const express = require('express');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*', // Allow embedding from any domain (or specify ukidney.com)
    credentials: true
}));

// Add headers for iframe embedding
app.use((req, res, next) => {
    res.removeHeader('X-Frame-Options'); // Remove X-Frame-Options to allow all embedding
    // Don't set Content-Security-Policy frame-ancestors to allow embedding from anywhere
    next();
});

app.use(express.json());
app.use(express.static('public'));

// Initialize AI clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const xai = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1'
});

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Store PDF content in memory (now supports multiple documents)
let documents = {};
let currentDocument = {
    name: '',
    path: '',
    version: '',
    type: 'smh' // 'smh' or 'uhn'
};

// Clean PDF text to reduce token usage
function cleanPDFText(text) {
    let cleaned = text;
    
    // Remove "Page X" headers (appears on every page)
    cleaned = cleaned.replace(/\s*Page \d+\s*/g, '\n');
    
    // Remove excessive whitespace (3+ blank lines -> 2)
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
    
    // Trim lines
    cleaned = cleaned.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0) // Remove empty lines
        .join('\n');
    
    return cleaned;
}

// Load and parse PDF documents
async function loadPDF(documentType = 'smh') {
    try {
        let pdfFilename, docType, version;

        if (documentType === 'uhn') {
            pdfFilename = 'uhn-manual-2025.pdf';
            docType = 'uhn';
            version = '2025';
        } else {
            pdfFilename = 'smh-manual-2023.pdf';
            docType = 'smh';
            version = '2023';
        }

        const pdfPath = path.join(__dirname, pdfFilename);

        // Check if document is already loaded
        if (documents[documentType]) {
            console.log(`✓ Document ${documentType} already loaded`);
            return documents[documentType];
        }

        console.log(`Loading ${documentType} document...`);

        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdf(dataBuffer);

        // Clean the PDF text to reduce tokens
        const originalSize = data.text.length;
        const cleanedContent = cleanPDFText(data.text);
        const savedChars = originalSize - cleanedContent.length;
        const percentSaved = ((savedChars / originalSize) * 100).toFixed(1);

        const docMetadata = {
            pages: data.numpages,
            info: data.info
        };

        // Store document information
        const docInfo = {
            name: pdfFilename,
            path: pdfPath,
            version: version,
            type: docType,
            content: cleanedContent,
            metadata: docMetadata
        };

        // Store in documents cache
        documents[documentType] = docInfo;

        console.log('✓ PDF loaded successfully');
        console.log(`  - Document: ${docInfo.name} (${docType.toUpperCase()})`);
        console.log(`  - Pages: ${docMetadata.pages}`);
        console.log(`  - Characters: ${cleanedContent.length} (saved ${savedChars} / ${percentSaved}%)`);
        console.log(`  - Est. tokens: ~${Math.round(cleanedContent.length / 4)}`);

        return docInfo;
    } catch (error) {
        console.error(`Error loading PDF ${documentType}:`, error);
        throw error;
    }
}

// Set current document context
function setCurrentDocument(documentType) {
    if (documents[documentType]) {
        currentDocument = documents[documentType];
        console.log(`✓ Switched to document: ${currentDocument.name}`);
    } else {
        console.error(`Document ${documentType} not loaded`);
    }
}

// System prompt - Base for both models (now document-aware)
const getBaseSystemPrompt = (documentType = 'smh') => {
    const docNames = {
        'smh': 'SMH Housestaff Manual',
        'uhn': 'UHN Nephrology Manual'
    };

    const docName = docNames[documentType] || docNames['smh'];
    const docContent = documents[documentType]?.content || '';

    return `You are a helpful assistant that answers questions ONLY based on the ${docName} provided below.

IMPORTANT RULES:
1. Answer questions ONLY using information from the manual
2. If the answer is not in the manual, say "I don't have that information in the ${docName}"
3. Always cite the relevant section or page when possible
4. Do not use external knowledge or information from the internet
5. Be concise and professional
6. If you're unsure, admit it rather than guessing

FORMATTING RULES:
- Use **bold** for important terms and section titles
- Use bullet points (- or *) for lists
- Use numbered lists (1., 2., 3.) for sequential steps
- Use line breaks between different topics
- Cite sections like this: *(Reference: Section Name, Page X)*
- Keep paragraphs short and scannable

${docName.toUpperCase()} CONTENT:
---
${docContent}
---`;
};

// Gemini-specific prompt (structured, organized)
const getGeminiPrompt = (documentType = 'smh') => getBaseSystemPrompt(documentType) + `

RESPONSE STYLE - STRICTLY FOLLOW:
- Use markdown tables when presenting structured data with multiple conditions
- Present information in the most compact, scannable format
- Lead with the direct answer, then provide details
- Use minimal explanatory text - let the structure speak
- Example format for drug indications:
  | Condition | Indication |
  |-----------|------------|
  | X         | YES/NO     |`;

// Grok-specific prompt (analytical, contextual)
const getGrokPrompt = (documentType = 'smh') => getBaseSystemPrompt(documentType) + `

RESPONSE STYLE - STRICTLY FOLLOW:
- ALWAYS add a brief introductory sentence explaining the purpose or context
- When presenting factual data, include WHY it matters (even briefly)
- Add a short concluding note with clinical significance when relevant
- Use more descriptive language - don't just list, explain
- Example: Instead of just "Indication: YES", write "indicated because..." or "recommended to prevent..."
- Connect facts to their clinical rationale from the manual when available`;

// Chat with Gemini
async function chatWithGemini(message, history, documentType = 'smh') {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash"
    });

    const systemMessage = getGeminiPrompt(documentType);
    
    const docNames = {
        'smh': 'SMH Housestaff Manual',
        'uhn': 'UHN Nephrology Manual'
    };
    const docName = docNames[documentType] || docNames['smh'];

    const fullHistory = [
        {
            role: 'user',
            parts: [{ text: systemMessage + `\n\nI understand. I will only answer questions based on the ${docName} content you provided.` }]
        },
        {
            role: 'model',
            parts: [{ text: `I understand. I will only answer questions based on the ${docName} content you provided. What would you like to know?` }]
        },
        ...history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }))
    ];

    const chat = model.startChat({
        history: fullHistory
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    return response.text();
}

// Chat with Grok
async function chatWithGrok(message, history, documentType = 'smh') {
    const systemMessage = getGrokPrompt(documentType);
    
    const messages = [
        {
            role: 'system',
            content: systemMessage
        },
        ...history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        })),
        {
            role: 'user',
            content: message
        }
    ];

    const completion = await xai.chat.completions.create({
        model: 'grok-2-1212',
        messages: messages,
        temperature: 0.7
    });

    return completion.choices[0].message.content;
}

// Helper function to log conversation to Supabase
async function logConversation(data) {
    try {
        const { error } = await supabase
            .from('chat_conversations')
            .insert([data]);
        
        if (error) {
            console.error('Failed to log conversation:', error);
        }
    } catch (err) {
        console.error('Error logging to Supabase:', err);
    }
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    const sessionId = req.body.sessionId || uuidv4();

    try {
        const { message, history = [], model = 'gemini', doc = 'smh' } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Validate document type
        const validDocs = ['smh', 'uhn'];
        const documentType = validDocs.includes(doc) ? doc : 'smh';

        // Ensure document is loaded
        if (!documents[documentType]) {
            await loadPDF(documentType);
            setCurrentDocument(documentType);
        }

        let responseText;
        let errorOccurred = null;

        try {
            if (model === 'grok') {
                responseText = await chatWithGrok(message, history, documentType);
            } else {
                responseText = await chatWithGemini(message, history, documentType);
            }
        } catch (chatError) {
            errorOccurred = chatError.message;
            throw chatError;
        } finally {
            const responseTime = Date.now() - startTime;
            
            // Log to Supabase
            await logConversation({
                session_id: sessionId,
                question: message,
                response: responseText || '',
                model: model,
                response_time_ms: responseTime,
                document_name: currentDocument.name,
                document_path: currentDocument.path,
                document_version: currentDocument.version,
                pdf_name: currentDocument.name, // Legacy field
                pdf_pages: currentDocument.metadata.pages,
                error: errorOccurred,
                metadata: {
                    history_length: history.length,
                    timestamp: new Date().toISOString(),
                    document_title: currentDocument.metadata.info?.Title,
                    document_type: currentDocument.type
                }
            });
        }

        res.json({
            response: responseText,
            model: model,
            sessionId: sessionId,
            metadata: {
                document: currentDocument.name,
                documentVersion: currentDocument.version,
                documentType: currentDocument.type,
                pdfPages: currentDocument.metadata.pages,
                pdfTitle: currentDocument.metadata.info?.Title || currentDocument.name,
                responseTime: Date.now() - startTime
            }
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            error: 'Failed to process chat message',
            details: error.message 
        });
    }
});

// Root route - serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch index.php requests (Joomla/Apache adds this)
app.get('/index.php', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch any other .php requests
app.get('*.php', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const loadedDocs = Object.keys(documents);
    const docStatus = {};
    const requestedDoc = req.query.doc || 'smh';
    const validDocs = ['smh', 'uhn'];
    const docType = validDocs.includes(requestedDoc) ? requestedDoc : 'smh';

    loadedDocs.forEach(doc => {
        docStatus[doc] = {
            loaded: true,
            name: documents[doc].name,
            version: documents[doc].version,
            pages: documents[doc].metadata.pages,
            characters: documents[doc].content.length
        };
    });

    res.json({
        status: 'ok',
        currentDocument: documents[docType].name,
        currentDocumentType: docType,
        loadedDocuments: loadedDocs,
        documentDetails: docStatus,
        requestedDoc: requestedDoc
    });
});

// Analytics endpoint
app.get('/api/analytics', async (req, res) => {
    try {
        const { timeframe = '24h' } = req.query;
        
        // Calculate time filter
        const hoursBack = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : timeframe === '30d' ? 720 : 24;
        const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
        
        // Get conversation stats
        const { data: conversations, error } = await supabase
            .from('chat_conversations')
            .select('*')
            .gte('created_at', since)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Get unique documents
        const documentStats = {};
        conversations.forEach(c => {
            const docName = c.document_name || c.pdf_name || 'unknown';
            if (!documentStats[docName]) {
                documentStats[docName] = {
                    count: 0,
                    version: c.document_version,
                    avgResponseTime: 0,
                    totalTime: 0
                };
            }
            documentStats[docName].count++;
            documentStats[docName].totalTime += c.response_time_ms || 0;
        });
        
        // Calculate averages for documents
        Object.keys(documentStats).forEach(doc => {
            documentStats[doc].avgResponseTime = Math.round(
                documentStats[doc].totalTime / documentStats[doc].count
            );
            delete documentStats[doc].totalTime;
        });
        
        // Calculate analytics
        const stats = {
            totalConversations: conversations.length,
            byModel: {
                gemini: conversations.filter(c => c.model === 'gemini').length,
                grok: conversations.filter(c => c.model === 'grok').length
            },
            byDocument: documentStats,
            avgResponseTime: {
                gemini: Math.round(
                    conversations.filter(c => c.model === 'gemini')
                        .reduce((sum, c) => sum + (c.response_time_ms || 0), 0) / 
                    conversations.filter(c => c.model === 'gemini').length || 1
                ),
                grok: Math.round(
                    conversations.filter(c => c.model === 'grok')
                        .reduce((sum, c) => sum + (c.response_time_ms || 0), 0) / 
                    conversations.filter(c => c.model === 'grok').length || 1
                )
            },
            errors: conversations.filter(c => c.error).length,
            uniqueSessions: new Set(conversations.map(c => c.session_id)).size,
            uniqueDocuments: Object.keys(documentStats).length,
            timeframe: timeframe,
            recentQuestions: conversations.slice(0, 10).map(c => ({
                question: c.question,
                model: c.model,
                document: c.document_name || c.pdf_name,
                timestamp: c.created_at,
                responseTime: c.response_time_ms
            }))
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Start server
async function start() {
    console.log('Loading documents...');
    await loadPDF('smh'); // Load SMH document
    await loadPDF('uhn'); // Load UHN document
    setCurrentDocument('smh'); // Default to SMH

    app.listen(PORT, () => {
        console.log(`\n🚀 Server running at http://localhost:${PORT}`);
        console.log(`📄 Multi-document chatbot ready!`);
        console.log(`   - Supports: SMH Manual (2023), UHN Manual (2025)`);
        console.log(`   - Use ?doc=smh or ?doc=uhn URL parameter\n`);
    });
}

start();

