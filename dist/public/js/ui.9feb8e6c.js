// UI updates, messages, and loading states
import { docConfig } from './config.6e33e3e5.js';
import { getRandomFact } from './facts.64f2b87f.js';

// Update document UI based on selected document
export function updateDocumentUI(selectedDocument) {
    const config = docConfig[selectedDocument];
    document.getElementById('headerTitle').textContent = config.title;
    document.getElementById('headerSubtitle').textContent = config.subtitle;
    document.getElementById('welcomeTitle').textContent = `Welcome to the ${config.welcomeMessage} Assistant`;

    // Update back link
    const backLink = document.querySelector('.back-link');
    if (backLink) {
        backLink.href = config.backLink;
    }

    // Update about tooltip document name
    const documentNameElement = document.getElementById('documentName');
    if (documentNameElement) {
        documentNameElement.textContent = config.welcomeMessage;
    }

    console.log(`📄 Document set to: ${selectedDocument.toUpperCase()} - ${config.welcomeMessage}`);
}

// Update model name in about tooltip
export function updateModelInTooltip(selectedModel) {
    const modelNameElement = document.getElementById('modelName');
    if (modelNameElement) {
        const modelDisplayName = selectedModel === 'gemini' ? 'Gemini 2.5' : 'Grok 4';
        modelNameElement.textContent = modelDisplayName;
    }
}

// Add a message to the chat
export function addMessage(content, role, model = null, conversationId = null, chatContainer) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Render markdown for assistant messages, plain text for user
    if (role === 'assistant') {
        contentDiv.innerHTML = marked.parse(content);

        // Wrap all tables in a scrollable container for mobile responsiveness
        const tables = contentDiv.querySelectorAll('table');
        tables.forEach(table => {
            if (!table.parentElement.classList.contains('table-wrapper')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-wrapper';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });

        // Add subtle model badge
        if (model) {
            const badge = document.createElement('div');
            badge.className = 'model-badge';
            badge.textContent = model === 'gemini' ? '🤖 Gemini' : '🚀 Grok';
            contentDiv.appendChild(badge);
        }

        // Add rating buttons for assistant messages
        if (conversationId) {
            const ratingButtons = createRatingButtons(conversationId);
            contentDiv.appendChild(ratingButtons);
        }
    } else {
        contentDiv.textContent = content;
    }

    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);

    // Scroll to show the top of the new message (not the bottom)
    if (role === 'assistant') {
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        // For user messages, scroll to bottom to show input was received
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Create rating buttons for a message
function createRatingButtons(conversationId) {
    const ratingButtons = document.createElement('div');
    ratingButtons.className = 'rating-buttons';

    const thumbsUpBtn = document.createElement('button');
    thumbsUpBtn.className = 'rating-btn thumbs-up';
    thumbsUpBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 11H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3z"/></svg>';
    thumbsUpBtn.title = 'Rate this response as helpful';
    thumbsUpBtn.onclick = () => window.submitRating(conversationId, 'thumbs_up', thumbsUpBtn);

    const thumbsDownBtn = document.createElement('button');
    thumbsDownBtn.className = 'rating-btn thumbs-down';
    thumbsDownBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 13h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3z"/></svg>';
    thumbsDownBtn.title = 'Rate this response as not helpful';
    thumbsDownBtn.onclick = () => window.submitRating(conversationId, 'thumbs_down', thumbsDownBtn);

    ratingButtons.appendChild(thumbsUpBtn);
    ratingButtons.appendChild(thumbsDownBtn);
    
    return ratingButtons;
}

// Add loading indicator with rotating fun facts
export function addLoading(chatContainer) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.id = 'loading';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content loading-container';
    
    // Loading dots
    const dotsDiv = document.createElement('div');
    dotsDiv.className = 'loading-dots';
    dotsDiv.innerHTML = '<span></span><span></span><span></span>';
    
    // Fun fact display
    const factDiv = document.createElement('div');
    factDiv.className = 'fun-fact';
    factDiv.innerHTML = getRandomFact();
    
    contentDiv.appendChild(dotsDiv);
    contentDiv.appendChild(factDiv);
    loadingDiv.appendChild(contentDiv);
    chatContainer.appendChild(loadingDiv);
    
    // Scroll to show the loading indicator at the top
    loadingDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Start rotating facts every 5 seconds with fade animation
    startFactRotation();
}

// Rotate facts with fade effect
let factRotationInterval = null;

function startFactRotation() {
    // Clear any existing interval
    if (factRotationInterval) {
        clearInterval(factRotationInterval);
    }
    
    factRotationInterval = setInterval(() => {
        const factElement = document.querySelector('#loading .fun-fact');
        if (!factElement) {
            clearInterval(factRotationInterval);
            return;
        }
        
        // Fade out
        factElement.classList.add('fade-out');
        
        // Change text and fade in after fade out completes
        setTimeout(() => {
            factElement.innerHTML = getRandomFact();
            factElement.classList.remove('fade-out');
            factElement.classList.add('fade-in');
            
            // Remove fade-in class after animation
            setTimeout(() => {
                factElement.classList.remove('fade-in');
            }, 600);
        }, 600);
    }, 8000); // Change fact every 8 seconds
}

// Remove loading indicator
export function removeLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.remove();
    }
    
    // Clear the fact rotation interval
    if (factRotationInterval) {
        clearInterval(factRotationInterval);
        factRotationInterval = null;
    }
}

// Build response text with metadata
export function buildResponseWithMetadata(data, ragMode, isLocalEnv) {
    let responseText = data.response;

    // Add metadata based on mode and environment
    if (ragMode && data.metadata && data.metadata.chunksUsed) {
        // RAG Mode metadata
        let metaInfo;
        if (isLocalEnv) {
            // Local: Show detailed debug info
            const embeddingInfo = data.metadata.embedding_type 
                ? ` | Embedding: ${data.metadata.embedding_type} (${data.metadata.embedding_dimensions}D)` 
                : '';
            metaInfo = `\n\n---\n*🔍 RAG Mode: Used ${data.metadata.chunksUsed} relevant chunks (retrieval: ${data.metadata.retrievalTime}ms, total: ${data.metadata.responseTime}ms)${embeddingInfo}*`;
        } else {
            // Production: Show only response time
            metaInfo = `\n\n---\n*Response time: ${data.metadata.responseTime}ms*`;
        }
        responseText += metaInfo;

        // Log RAG performance
        console.log('📊 RAG Performance:', {
            chunks: data.metadata.chunksUsed,
            retrievalTime: data.metadata.retrievalTime,
            totalTime: data.metadata.responseTime,
            similarities: data.metadata.chunkSimilarities
        });
    } else if (!ragMode && data.metadata) {
        // Full Doc Mode metadata
        let metaInfo;
        if (isLocalEnv) {
            // Local: Show detailed debug info
            const docSize = data.metadata.pdfPages ? `${data.metadata.pdfPages} pages` : 'full document';
            metaInfo = `\n\n---\n*📄 Full Doc Mode: Entire ${docSize} context (response time: ${data.metadata.responseTime}ms)*`;
        } else {
            // Production: Show only response time
            metaInfo = `\n\n---\n*Response time: ${data.metadata.responseTime}ms*`;
        }
        responseText += metaInfo;

        // Log Full Doc performance
        console.log('📊 Full Doc Performance:', {
            document: data.metadata.document,
            pages: data.metadata.pdfPages,
            totalTime: data.metadata.responseTime
        });
    }

    return responseText;
}

