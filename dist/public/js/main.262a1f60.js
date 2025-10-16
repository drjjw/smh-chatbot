// Main initialization and event wiring
import { API_URL, generateSessionId } from './config.77794265.js';
import { checkHealth } from './api.1b1f4712.js';
import { updateDocumentUI } from './ui.eed37fae.js';
import { sendMessage } from './chat.f970827b.js';
import { submitRating } from './rating.fea410db.js';

// Configure marked for better formatting
marked.setOptions({
    breaks: true,
    gfm: true
});

// Application state
const state = {
    conversationHistory: [],
    isLoading: false,
    selectedModel: 'gemini',
    ragMode: false, // Default to full document mode
    sessionId: generateSessionId(),
    selectedDocument: 'smh', // Default to SMH
    isLocalEnv: false
};

// DOM elements
const elements = {
    chatContainer: document.getElementById('chatContainer'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    statusDiv: document.getElementById('status'),
    geminiBtn: document.getElementById('geminiBtn'),
    grokBtn: document.getElementById('grokBtn'),
    fullDocBtn: document.getElementById('fullDocBtn'),
    ragBtn: document.getElementById('ragBtn')
};

console.log('🔍 URL Detection:');
console.log('  - Current path:', window.location.pathname);
console.log('  - API Base URL:', API_URL);
console.log('  - Health endpoint:', `${API_URL}/api/health`);

// Initialize document and method selection from URL parameters
function initializeDocument() {
    const urlParams = new URLSearchParams(window.location.search);
    const docParam = urlParams.get('doc');
    const methodParam = urlParams.get('method');

    // Set document type
    if (docParam && (docParam === 'smh' || docParam === 'uhn')) {
        state.selectedDocument = docParam;
    }

    // Set retrieval method from URL parameter
    if (methodParam && methodParam === 'rag') {
        state.ragMode = true;
        if (elements.ragBtn) {
            elements.ragBtn.classList.add('active');
            elements.fullDocBtn.classList.remove('active');
        }
        console.log('🔍 RAG mode enabled via URL parameter');
    }

    // Check if running on localhost
    state.isLocalEnv = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' ||
                 window.location.hostname === '';
    
    // Add class to body for CSS targeting
    if (state.isLocalEnv) {
        document.body.classList.add('local-env');
        console.log('🏠 Local environment detected - retrieval controls visible');
        
        // Show URL parameters info in welcome message
        const urlParamsInfo = document.getElementById('urlParamsInfo');
        if (urlParamsInfo) {
            urlParamsInfo.style.display = 'inline';
        }
    } else {
        console.log('🌐 Production environment - retrieval controls hidden');
    }

    // Update UI based on selected document
    updateDocumentUI(state.selectedDocument);
}

// Model selector event listeners
elements.geminiBtn.addEventListener('click', () => {
    state.selectedModel = 'gemini';
    elements.geminiBtn.classList.add('active');
    elements.grokBtn.classList.remove('active');
});

elements.grokBtn.addEventListener('click', () => {
    state.selectedModel = 'grok';
    elements.grokBtn.classList.add('active');
    elements.geminiBtn.classList.remove('active');
});

// Retrieval method selector event listeners
elements.fullDocBtn.addEventListener('click', () => {
    state.ragMode = false;
    elements.fullDocBtn.classList.add('active');
    elements.ragBtn.classList.remove('active');
    console.log('📄 Switched to Full Document mode');
});

elements.ragBtn.addEventListener('click', () => {
    state.ragMode = true;
    elements.ragBtn.classList.add('active');
    elements.fullDocBtn.classList.remove('active');
    console.log('🔍 Switched to RAG mode');
});

// Event listeners for chat
elements.sendButton.addEventListener('click', () => sendMessage(state, elements));
elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage(state, elements);
});

// Expose submitRating to window for rating button clicks
window.submitRating = submitRating;

// Initialize
initializeDocument();
checkHealth(state.selectedDocument, elements.statusDiv);

// Focus input
elements.messageInput.focus();
