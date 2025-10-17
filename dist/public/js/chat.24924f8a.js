// Chat logic and conversation management
import { sendMessageToAPI } from './api.9da9e38f.js';
import { addMessage, addLoading, removeLoading, buildResponseWithMetadata } from './ui.29410cc7.js';

// Send a message
export async function sendMessage(state, elements) {
    const message = elements.messageInput.value.trim();
    if (!message || state.isLoading) return;

    state.isLoading = true;
    elements.sendButton.disabled = true;

    // Add user message
    addMessage(message, 'user', null, null, elements.chatContainer, null, null, null);
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
            addMessage('Server returned an invalid response. Please try again.', 'assistant', null, null, elements.chatContainer, null, null, null);
            state.isLoading = false;
            elements.sendButton.disabled = false;
            elements.messageInput.focus();
            return;
        }

        removeLoading();

        if (response.ok) {
            // Build response with metadata
            const responseText = buildResponseWithMetadata(data, state.ragMode, state.isLocalEnv);

            // Get the last user message for the switch button
            const lastUserMessage = state.conversationHistory.length > 0 &&
                state.conversationHistory[state.conversationHistory.length - 1].role === 'user'
                ? state.conversationHistory[state.conversationHistory.length - 1].content
                : null;

            addMessage(responseText, 'assistant', data.model, data.conversationId, elements.chatContainer, lastUserMessage, state, sendMessage);
            state.conversationHistory.push({ role: 'assistant', content: data.response });
        } else {
            const errorMsg = data.error || 'Unknown error occurred';
            const details = data.details ? ` (${data.details})` : '';
            addMessage(`Error: ${errorMsg}${details}`, 'assistant', null, null, elements.chatContainer, null, null, null);
        }
    } catch (error) {
        removeLoading();
        const errorMessage = error.message || 'Failed to connect to server. Please try again.';
        addMessage(errorMessage, 'assistant', null, null, elements.chatContainer, null, null, null);
        console.error('Error:', error);
    }

    state.isLoading = false;
    elements.sendButton.disabled = false;
    // Only focus input if it's a real DOM element (not during model switching)
    if (elements.messageInput && typeof elements.messageInput.focus === 'function') {
        elements.messageInput.focus();
    }
}


