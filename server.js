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

// Store PDF content in memory
let pdfContent = '';
let pdfMetadata = {};
let currentDocument = {
    name: '',
    path: '',
    version: ''
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

// Load and parse PDF on startup
async function loadPDF() {
    try {
        const pdfFilename = 'smh-manual-2023.pdf';
        const pdfPath = path.join(__dirname, pdfFilename);
        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdf(dataBuffer);
        
        // Clean the PDF text to reduce tokens
        const originalSize = data.text.length;
        pdfContent = cleanPDFText(data.text);
        const savedChars = originalSize - pdfContent.length;
        const percentSaved = ((savedChars / originalSize) * 100).toFixed(1);
        
        pdfMetadata = {
            pages: data.numpages,
            info: data.info
        };
        
        // Store document information
        currentDocument = {
            name: pdfFilename,
            path: pdfPath,
            version: '2023'
        };
        
        console.log('✓ PDF loaded successfully');
        console.log(`  - Document: ${currentDocument.name}`);
        console.log(`  - Pages: ${pdfMetadata.pages}`);
        console.log(`  - Characters: ${pdfContent.length} (saved ${savedChars} / ${percentSaved}%)`);
        console.log(`  - Est. tokens: ~${Math.round(pdfContent.length / 4)}`);
    } catch (error) {
        console.error('Error loading PDF:', error);
        process.exit(1);
    }
}

// System prompt - Base for both models
const getBaseSystemPrompt = () => `You are a helpful assistant that answers questions ONLY based on the SMH Housestaff Manual provided below.

IMPORTANT RULES:
1. Answer questions ONLY using information from the manual
2. If the answer is not in the manual, say "I don't have that information in the SMH Housestaff Manual"
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

SMH HOUSESTAFF MANUAL CONTENT:
---
${pdfContent}
---`;

// Gemini-specific prompt (structured, organized)
const getGeminiPrompt = () => getBaseSystemPrompt() + `

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
const getGrokPrompt = () => getBaseSystemPrompt() + `

RESPONSE STYLE - STRICTLY FOLLOW:
- ALWAYS add a brief introductory sentence explaining the purpose or context
- When presenting factual data, include WHY it matters (even briefly)
- Add a short concluding note with clinical significance when relevant
- Use more descriptive language - don't just list, explain
- Example: Instead of just "Indication: YES", write "indicated because..." or "recommended to prevent..."
- Connect facts to their clinical rationale from the manual when available`;

// Chat with Gemini
async function chatWithGemini(message, history) {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash"
    });

    const systemMessage = getGeminiPrompt();
    
    const fullHistory = [
        {
            role: 'user',
            parts: [{ text: systemMessage + "\n\nI understand. I will only answer questions based on the SMH Housestaff Manual content you provided." }]
        },
        {
            role: 'model',
            parts: [{ text: "I understand. I will only answer questions based on the SMH Housestaff Manual content you provided. What would you like to know?" }]
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
async function chatWithGrok(message, history) {
    const systemMessage = getGrokPrompt();
    
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
        const { message, history = [], model = 'gemini' } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        let responseText;
        let errorOccurred = null;
        
        try {
            if (model === 'grok') {
                responseText = await chatWithGrok(message, history);
            } else {
                responseText = await chatWithGemini(message, history);
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
                pdf_pages: pdfMetadata.pages,
                error: errorOccurred,
                metadata: {
                    history_length: history.length,
                    timestamp: new Date().toISOString(),
                    document_title: pdfMetadata.info?.Title
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
                pdfPages: pdfMetadata.pages,
                pdfTitle: pdfMetadata.info?.Title || currentDocument.name,
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
    res.json({
        status: 'ok',
        pdfLoaded: !!pdfContent,
        document: currentDocument.name,
        documentVersion: currentDocument.version,
        pdfPages: pdfMetadata.pages,
        pdfCharacters: pdfContent.length
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
    await loadPDF();
    app.listen(PORT, () => {
        console.log(`\n🚀 Server running at http://localhost:${PORT}`);
        console.log(`📄 PDF-based chatbot ready!\n`);
    });
}

start();

