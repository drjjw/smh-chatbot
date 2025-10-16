// Chat logic and conversation management
import { sendMessageToAPI } from './api.js';
import { addMessage, addLoading, removeLoading, buildResponseWithMetadata } from './ui.js';

// Send a message
export async function sendMessage(state, elements) {
    const message = elements.messageInput.value.trim();
    if (!message || state.isLoading) return;

    state.isLoading = true;
    elements.sendButton.disabled = true;

    // Add user message
    addMessage(message, 'user', null, null, elements.chatContainer);
    state.conversationHistory.push({ role: 'user', content: message });
    elements.messageInput.value = '';

    // Show loading
    addLoading(elements.chatContainer);

    try {
        const response = await sendMessageToAPI(
            message,
            state.conversationHistory,
            state.selectedModel,
            state.sessionId,
            state.selectedDocument,
            state.ragMode
        );

        const data = await response.json();

        removeLoading();

        if (response.ok) {
            // Build response with metadata
            const responseText = buildResponseWithMetadata(data, state.ragMode, state.isLocalEnv);

            addMessage(responseText, 'assistant', data.model, data.conversationId, elements.chatContainer);
            state.conversationHistory.push({ role: 'assistant', content: data.response });
        } else {
            addMessage(`Error: ${data.error}`, 'assistant', null, null, elements.chatContainer);
        }
    } catch (error) {
        removeLoading();
        addMessage('Failed to connect to server. Please try again.', 'assistant', null, null, elements.chatContainer);
        console.error('Error:', error);
    }

    state.isLoading = false;
    elements.sendButton.disabled = false;
    elements.messageInput.focus();
}

