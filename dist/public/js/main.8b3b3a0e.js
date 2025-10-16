// Main initialization and event wiring
import { API_URL, generateSessionId } from './config.6e33e3e5.js';
import { checkHealth } from './api.9da9e38f.js';
import { updateDocumentUI } from './ui.d3392480.js';
import { sendMessage } from './chat.c13605ab.js';
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
    ragBtn: document.getElementById('ragBtn'),
    headerToggle: document.getElementById('headerToggle'),
    mainHeader: document.getElementById('mainHeader'),
    headerContent: document.getElementById('headerContent')
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

// Header collapse/expand functionality
function initializeHeaderToggle() {
    const STORAGE_KEY = 'ukidney-header-collapsed';
    
    // Load saved state from localStorage (defaults to false/expanded if not set)
    const savedState = localStorage.getItem(STORAGE_KEY);
    const isCollapsed = savedState === 'true';
    
    // Apply collapsed state only if explicitly saved as collapsed
    if (isCollapsed && elements.mainHeader && elements.headerContent) {
        elements.mainHeader.classList.add('collapsed');
        console.log('Header initialized as collapsed (from localStorage)');
    } else {
        // Ensure it starts expanded (remove any collapsed class that might exist)
        elements.mainHeader?.classList.remove('collapsed');
        console.log('Header initialized as expanded (default)');
    }
    
    // Toggle header on button click
    if (elements.headerToggle && elements.mainHeader && elements.headerContent) {
        elements.headerToggle.addEventListener('click', () => {
            const isCurrentlyCollapsed = elements.mainHeader.classList.toggle('collapsed');
            
            // Save state to localStorage
            localStorage.setItem(STORAGE_KEY, isCurrentlyCollapsed.toString());
            
            // Notify parent window if in iframe (for embedded usage)
            if (window.parent !== window) {
                try {
                    window.parent.postMessage({
                        type: 'headerCollapsed',
                        collapsed: isCurrentlyCollapsed
                    }, '*');
                } catch (e) {
                    console.log('Could not notify parent:', e);
                }
            }
            
            console.log(`Header ${isCurrentlyCollapsed ? 'collapsed' : 'expanded'}`);
        });
    }
}

// Expose submitRating to window for rating button clicks
window.submitRating = submitRating;

// Initialize
initializeDocument();
initializeHeaderToggle();
checkHealth(state.selectedDocument, elements.statusDiv);

// Focus input
elements.messageInput.focus();
