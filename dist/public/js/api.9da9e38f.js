// API communication and health checks
import { API_URL, getEmbeddingType } from './config.3f3300dc.js';

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
    // Add embedding type parameter for RAG mode
    const embeddingType = getEmbeddingType();
    const endpoint = ragMode 
        ? `${API_URL}/api/chat-rag?embedding=${embeddingType}` 
        : `${API_URL}/api/chat`;

    // Create AbortController for timeout (60 seconds for RAG, 30 for regular)
    const timeoutMs = ragMode ? 60000 : 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                history: conversationHistory.slice(0, -1),
                model: selectedModel,
                sessionId: sessionId,
                doc: selectedDocument
            }),
            signal: controller.signal,
            // Disable any caching to ensure fresh requests
            cache: 'no-store'
        });

        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs / 1000} seconds. This may happen with complex queries in RAG mode. Please try again or simplify your question.`);
        }
        throw error;
    }
}


