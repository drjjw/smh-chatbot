// Main initialization and event wiring
import { API_URL, generateSessionId, getEmbeddingType } from './config.d8a1ca03.js';
import { checkHealth } from './api.9da9e38f.js';
import { updateDocumentUI, updateModelInTooltip } from './ui.3e614ce3.js';
import { sendMessage } from './chat.24924f8a.js';
import { submitRating } from './rating.889e6e99.js';

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

// Initialize document and method selection from URL parameters (now async with registry validation)
async function initializeDocument() {
    const urlParams = new URLSearchParams(window.location.search);
    const docParam = urlParams.get('doc');
    const methodParam = urlParams.get('method');
    const embeddingParam = getEmbeddingType();
    const modelParam = urlParams.get('model');

    // Set model from URL parameter
    if (modelParam && (modelParam === 'gemini' || modelParam === 'grok')) {
        state.selectedModel = modelParam;
        // Update button states
        if (modelParam === 'grok') {
            elements.grokBtn.classList.add('active');
            elements.geminiBtn.classList.remove('active');
        } else {
            elements.geminiBtn.classList.add('active');
            elements.grokBtn.classList.remove('active');
        }
        // Update tooltip
        updateModelInTooltip(modelParam);
    } else {
        // Default model - update tooltip
        updateModelInTooltip(state.selectedModel);
    }

    // Validate document slug using registry
    let selectedDoc = 'smh'; // default
    if (docParam) {
        const { documentExists } = await import('./config.d8a1ca03.js');
        const exists = await documentExists(docParam);
        if (exists) {
            selectedDoc = docParam;
        } else {
            console.warn(`⚠️  Document '${docParam}' not found in registry, using default (smh)`);
        }
    }
    
    state.selectedDocument = selectedDoc;

    // Log all URL parameters
    console.log('\n📋 URL Parameters Applied:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Document:        ${docParam || 'smh (default)'}`);
    console.log(`  Validated as:    ${selectedDoc}`);
    console.log(`  Model:           ${state.selectedModel}`);
    console.log(`  Search Mode:     ${methodParam === 'rag' ? 'Targeted (RAG)' : 'Comprehensive (Full Doc)'}`);
    console.log(`  Embedding Type:  ${embeddingParam} ${embeddingParam === 'openai' ? '(1536D)' : '(384D)'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Set retrieval method from URL parameter
    if (methodParam && methodParam === 'rag') {
        state.ragMode = true;
        if (elements.ragBtn) {
            elements.ragBtn.classList.add('active');
            elements.fullDocBtn.classList.remove('active');
        }
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

    // Update UI based on selected document (async)
    await updateDocumentUI(state.selectedDocument);
}

// Model selector event listeners
elements.geminiBtn.addEventListener('click', () => {
    state.selectedModel = 'gemini';
    elements.geminiBtn.classList.add('active');
    elements.grokBtn.classList.remove('active');
    updateModelInTooltip('gemini');
});

elements.grokBtn.addEventListener('click', () => {
    state.selectedModel = 'grok';
    elements.grokBtn.classList.add('active');
    elements.geminiBtn.classList.remove('active');
    updateModelInTooltip('grok');
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
