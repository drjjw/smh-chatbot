// Chat logic and conversation management
import { sendMessageToAPI } from './api.9da9e38f.js';
import { addMessage, addLoading, removeLoading, buildResponseWithMetadata } from './ui.9feb8e6c.js';

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

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            console.error('Failed to parse response as JSON:', jsonError);
            removeLoading();
            addMessage('Server returned an invalid response. Please try again.', 'assistant', null, null, elements.chatContainer);
            state.isLoading = false;
            elements.sendButton.disabled = false;
            elements.messageInput.focus();
            return;
        }

        removeLoading();

        if (response.ok) {
            // Build response with metadata
            const responseText = buildResponseWithMetadata(data, state.ragMode, state.isLocalEnv);

            addMessage(responseText, 'assistant', data.model, data.conversationId, elements.chatContainer);
            state.conversationHistory.push({ role: 'assistant', content: data.response });
        } else {
            const errorMsg = data.error || 'Unknown error occurred';
            const details = data.details ? ` (${data.details})` : '';
            addMessage(`Error: ${errorMsg}${details}`, 'assistant', null, null, elements.chatContainer);
        }
    } catch (error) {
        removeLoading();
        const errorMessage = error.message || 'Failed to connect to server. Please try again.';
        addMessage(errorMessage, 'assistant', null, null, elements.chatContainer);
        console.error('Error:', error);
    }

    state.isLoading = false;
    elements.sendButton.disabled = false;
    elements.messageInput.focus();
}


