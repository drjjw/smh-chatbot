// API communication and health checks
import { API_URL } from './config.js';

// Check server health on load
export async function checkHealth(selectedDocument, statusDiv) {
    try {
        const response = await fetch(`${API_URL}/api/health?doc=${selectedDocument}`);
        const data = await response.json();
        if (data.status === 'ok' && data.loadedDocuments && data.loadedDocuments.length > 0) {
            const currentDoc = data.documentDetails[data.currentDocumentType];
            statusDiv.textContent = `✓ Ready - ${currentDoc.pages} pages loaded (${data.currentDocumentType.toUpperCase()})`;
            statusDiv.className = 'status online';
        } else {
            statusDiv.textContent = '⚠ Documents not loaded';
            statusDiv.className = 'status';
        }
    } catch (error) {
        statusDiv.textContent = '✗ Server offline';
        statusDiv.className = 'status';
    }
}

// Send a message to the API
export async function sendMessageToAPI(message, conversationHistory, selectedModel, sessionId, selectedDocument, ragMode) {
    // Choose endpoint based on RAG mode
    const endpoint = ragMode ? `${API_URL}/api/chat-rag` : `${API_URL}/api/chat`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            history: conversationHistory.slice(0, -1),
            model: selectedModel,
            sessionId: sessionId,
            doc: selectedDocument
        })
    });

    return response;
}

