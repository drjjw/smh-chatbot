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

// Initialize OpenAI client for embeddings (RAG)
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
    console.log('✓ OpenAI client initialized for RAG embeddings');
} else {
    console.warn('⚠️  OPENAI_API_KEY not found - OpenAI RAG mode will not work');
}

// Initialize local embeddings
const { generateLocalEmbedding, initializeModel: initLocalModel, getModelInfo } = require('./lib/local-embeddings');
let localEmbeddingsReady = false;

// Lazy-load local embedding model
async function ensureLocalEmbeddings() {
    if (!localEmbeddingsReady) {
        try {
            await initLocalModel();
            localEmbeddingsReady = true;
            const info = getModelInfo();
            console.log(`✓ Local embeddings ready: ${info.name} (${info.dimensions}D)`);
        } catch (error) {
            console.error('⚠️  Failed to initialize local embeddings:', error.message);
            throw error;
        }
    }
}

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
7. For questions about drug dose conversions related to MMF (CellCept) PO, Myfortic PO, MMF IV, Cyclosporine PO, Cyclosporine IV, Envarsus, Advagraf/Astagraf, Prograf, Prednisone, Methylprednisolone IV, Hydrocortisone IV, or Dexamethasone, attempt to answer but include a message directing users to consult https://ukidney.com/drugs

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

// ==================== RAG ENHANCEMENT ====================

/**
 * Generate embedding for a query using OpenAI text-embedding-3-small
 */
async function embedQuery(text) {
    try {
        if (!openaiClient) {
            throw new Error('OpenAI client not initialized. OPENAI_API_KEY environment variable is required for RAG mode.');
        }
        
        const response = await openaiClient.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
            encoding_format: 'float'
        });
        
        return response.data[0].embedding;
    } catch (error) {
        console.error('Error generating query embedding:', error.message);
        throw error;
    }
}

/**
 * Find relevant chunks from Supabase using vector similarity
 */
async function findRelevantChunks(embedding, documentType, limit = 5, threshold = null) {
    try {
        // OpenAI embeddings use higher threshold (0.3), local embeddings use lower (0.1)
        const defaultThreshold = threshold || parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.3;

        // Call the match_document_chunks function we created in Supabase
        const { data, error } = await supabase.rpc('match_document_chunks', {
            query_embedding: embedding,
            doc_type: documentType,
            match_threshold: defaultThreshold,
            match_count: limit
        });

        if (error) {
            console.error('Error finding relevant chunks:', error);
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('Error in findRelevantChunks:', error);
        throw error;
    }
}

/**
 * Find relevant chunks from Supabase using local embeddings
 */
async function findRelevantChunksLocal(embedding, documentType, limit = 5, threshold = null) {
    try {
        // Local embeddings use lower threshold (0.05) since they have lower similarity scores
        const defaultThreshold = threshold || parseFloat(process.env.RAG_SIMILARITY_THRESHOLD_LOCAL) || 0.05;

        // Call the match_document_chunks_local function for local embeddings
        const { data, error } = await supabase.rpc('match_document_chunks_local', {
            query_embedding: embedding,
            doc_type: documentType,
            match_threshold: defaultThreshold,
            match_count: limit
        });

        if (error) {
            console.error('Error finding relevant chunks (local):', error);
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('Error in findRelevantChunksLocal:', error);
        throw error;
    }
}

/**
 * Build RAG system prompt with retrieved chunks
 */
const getRAGSystemPrompt = (documentType = 'smh', chunks = []) => {
    const docNames = {
        'smh': 'SMH Housestaff Manual',
        'uhn': 'UHN Nephrology Manual'
    };

    const docName = docNames[documentType] || docNames['smh'];
    
    // Combine chunk content (without chunk labels)
    const context = chunks.map(chunk => chunk.content).join('\n\n---\n\n');

    return `You are a helpful assistant that answers questions based on the ${docName}.

IMPORTANT RULES:
1. Answer questions ONLY using information from the provided relevant excerpts below
2. If the answer is not in the excerpts, say "I don't have that information in the provided sections of the ${docName}"
3. Be concise and professional
4. If you're unsure, admit it rather than guessing
5. Do NOT mention chunk numbers or reference which excerpt information came from
6. For questions about drug dose conversions related to MMF (CellCept) PO, Myfortic PO, MMF IV, Cyclosporine PO, Cyclosporine IV, Envarsus, Advagraf/Astagraf, Prograf, Prednisone, Methylprednisolone IV, Hydrocortisone IV, or Dexamethasone, attempt to answer but include a message directing users to consult https://ukidney.com/drugs

FORMATTING RULES:
- Use **bold** for important terms and section titles
- Use bullet points (- or *) for lists
- Use numbered lists (1., 2., 3.) for sequential steps
- Use line breaks between different topics
- Keep paragraphs short and scannable

RELEVANT EXCERPTS FROM ${docName.toUpperCase()}:
---
${context}
---`;
};

/**
 * Get model-specific RAG prompt
 */
const getRAGGeminiPrompt = (documentType, chunks) => getRAGSystemPrompt(documentType, chunks) + `

RESPONSE STYLE - STRICTLY FOLLOW:
- Use markdown tables when presenting structured data
- Present information in the most compact, scannable format
- Lead with the direct answer, then provide details
- Use minimal explanatory text - let the structure speak`;

const getRAGGrokPrompt = (documentType, chunks) => getRAGSystemPrompt(documentType, chunks) + `

RESPONSE STYLE - STRICTLY FOLLOW:
- ALWAYS add a brief introductory sentence explaining the context
- When presenting factual data, include WHY it matters
- Add a short concluding note with clinical significance when relevant
- Use more descriptive language - explain, don't just list`;

/**
 * Chat with RAG using Gemini
 */
async function chatWithRAGGemini(message, history, documentType, chunks) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash"
    });

    const systemMessage = getRAGGeminiPrompt(documentType, chunks);
    
    const docNames = {
        'smh': 'SMH Housestaff Manual',
        'uhn': 'UHN Nephrology Manual'
    };
    const docName = docNames[documentType] || docNames['smh'];

    const fullHistory = [
        {
            role: 'user',
            parts: [{ text: systemMessage + `\n\nI understand. I will only answer questions based on the ${docName} excerpts you provided.` }]
        },
        {
            role: 'model',
            parts: [{ text: `I understand. I will only answer questions based on the ${docName} excerpts you provided. What would you like to know?` }]
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

/**
 * Chat with RAG using Grok
 */
async function chatWithRAGGrok(message, history, documentType, chunks) {
    const systemMessage = getRAGGrokPrompt(documentType, chunks);
    
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

// ==================== END RAG ENHANCEMENT ====================

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

// Helper function to update conversation rating
async function updateConversationRating(conversationId, rating) {
    try {
        const { error } = await supabase
            .from('chat_conversations')
            .update({ user_rating: rating })
            .eq('id', conversationId);

        if (error) {
            console.error('Failed to update conversation rating:', error);
            throw error;
        }

        return { success: true };
    } catch (err) {
        console.error('Error updating conversation rating:', err);
        throw err;
    }
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    // Ensure sessionId is a valid UUID
    let sessionId = req.body.sessionId;
    if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
        sessionId = uuidv4();
    }

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
            const conversationData = {
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
            };

            const { data: loggedConversation } = await supabase
                .from('chat_conversations')
                .insert([conversationData])
                .select('id')
                .single();

            res.locals.conversationId = loggedConversation?.id;
        }

        res.json({
            response: responseText,
            model: model,
            sessionId: sessionId,
            conversationId: res.locals.conversationId,
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

// RAG Chat endpoint
app.post('/api/chat-rag', async (req, res) => {
    const startTime = Date.now();
    console.log(`\n=== RAG Request received ===`);
    
    // Ensure sessionId is a valid UUID
    let sessionId = req.body.sessionId;
    if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
        sessionId = uuidv4();
    }

    try {
        const { message, history = [], model = 'gemini', doc = 'smh' } = req.body;
        
        // Get embedding type from query parameter (openai or local)
        const embeddingType = req.query.embedding || 'openai';
        console.log(`RAG: Message length: ${message.length} chars, Model: ${model}, Doc: ${doc}, Embedding: ${embeddingType}`);

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Validate document type
        const validDocs = ['smh', 'uhn'];
        const documentType = validDocs.includes(doc) ? doc : 'smh';

        let responseText;
        let retrievalTimeMs = 0;
        let chunksUsed = 0;
        let errorOccurred = null;
        let retrievedChunks = [];

        try {
            // Step 1: Embed the query (using selected embedding type)
            const retrievalStart = Date.now();
            console.log(`RAG: Embedding query: "${message.substring(0, 50)}..."`);
            
            let queryEmbedding;
            try {
                if (embeddingType === 'local') {
                    // Ensure local model is loaded
                    await ensureLocalEmbeddings();
                    queryEmbedding = await generateLocalEmbedding(message);
                    console.log(`RAG: Query embedded successfully (local model, ${queryEmbedding.length}D)`);
                } else {
                    // Use OpenAI embeddings
                    queryEmbedding = await embedQuery(message);
                    console.log(`RAG: Query embedded successfully (OpenAI, 1536D)`);
                }
            } catch (embedError) {
                console.error('RAG: Error embedding query:', embedError.message);
                throw new Error(`Failed to embed query with ${embeddingType}: ${embedError.message}`);
            }
            
            // Step 2: Find relevant chunks (from appropriate table)
            try {
                if (embeddingType === 'local') {
                    retrievedChunks = await findRelevantChunksLocal(queryEmbedding, documentType, 5);
                } else {
                    retrievedChunks = await findRelevantChunks(queryEmbedding, documentType, 5);
                }
                retrievalTimeMs = Date.now() - retrievalStart;
                chunksUsed = retrievedChunks.length;
                console.log(`RAG: Found ${chunksUsed} relevant chunks in ${retrievalTimeMs}ms (${embeddingType})`);
            } catch (chunkError) {
                console.error('RAG: Error finding chunks:', chunkError.message);
                throw new Error(`Failed to find relevant chunks with ${embeddingType}: ${chunkError.message}`);
            }

            // Step 3: Generate response using RAG
            try {
                console.log(`RAG: Generating response using ${model}...`);
                if (model === 'grok') {
                    responseText = await chatWithRAGGrok(message, history, documentType, retrievedChunks);
                } else {
                    responseText = await chatWithRAGGemini(message, history, documentType, retrievedChunks);
                }
                console.log(`RAG: Response generated (${responseText.length} chars)`);
            } catch (genError) {
                console.error('RAG: Error generating response:', genError.message);
                throw new Error(`Failed to generate response: ${genError.message}`);
            }
        } catch (chatError) {
            errorOccurred = chatError.message;
            console.error('RAG Chat Error:', chatError);
            throw chatError;
        } finally {
            const responseTime = Date.now() - startTime;

            // Log to Supabase with RAG metadata
            const conversationData = {
                session_id: sessionId,
                question: message,
                response: responseText || '',
                model: model,
                response_time_ms: responseTime,
                document_name: documentType === 'smh' ? 'smh-manual-2023.pdf' : 'uhn-manual-2025.pdf',
                document_path: path.join(__dirname, documentType === 'smh' ? 'smh-manual-2023.pdf' : 'uhn-manual-2025.pdf'),
                document_version: documentType === 'smh' ? '2023' : '2025',
                pdf_name: documentType === 'smh' ? 'smh-manual-2023.pdf' : 'uhn-manual-2025.pdf',
                pdf_pages: 0, // Not applicable for RAG
                error: errorOccurred,
                retrieval_method: 'rag',
                chunks_used: chunksUsed,
                retrieval_time_ms: retrievalTimeMs,
                metadata: {
                    history_length: history.length,
                    timestamp: new Date().toISOString(),
                    document_type: documentType,
                    chunk_similarities: retrievedChunks.map(c => c.similarity),
                    embedding_type: embeddingType,
                    embedding_dimensions: embeddingType === 'local' ? 384 : 1536
                }
            };

            const { data: loggedConversation } = await supabase
                .from('chat_conversations')
                .insert([conversationData])
                .select('id')
                .single();

            res.locals.conversationId = loggedConversation?.id;
        }

        const finalResponseTime = Date.now() - startTime;
        console.log(`RAG: Total response time: ${finalResponseTime}ms`);
        console.log(`=== RAG Request completed ===\n`);
        
        res.json({
            response: responseText,
            model: model,
            sessionId: sessionId,
            conversationId: res.locals.conversationId,
            metadata: {
                document: documentType === 'smh' ? 'smh-manual-2023.pdf' : 'uhn-manual-2025.pdf',
                documentType: documentType,
                responseTime: finalResponseTime,
                retrievalMethod: 'rag',
                chunksUsed: chunksUsed,
                retrievalTime: retrievalTimeMs,
                embedding_type: embeddingType,
                embedding_dimensions: embeddingType === 'local' ? 384 : 1536,
                chunkSimilarities: retrievedChunks.map(c => ({
                    index: c.chunk_index,
                    similarity: c.similarity
                }))
            }
        });

    } catch (error) {
        const errorTime = Date.now() - startTime;
        console.error(`RAG Chat error after ${errorTime}ms:`, error);
        console.log(`=== RAG Request failed ===\n`);
        res.status(500).json({ 
            error: 'Failed to process RAG chat message',
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

// Rating endpoint
app.post('/api/rate', async (req, res) => {
    try {
        const { conversationId, rating } = req.body;

        if (!conversationId) {
            return res.status(400).json({ error: 'conversationId is required' });
        }

        if (!['thumbs_up', 'thumbs_down'].includes(rating)) {
            return res.status(400).json({ error: 'rating must be either "thumbs_up" or "thumbs_down"' });
        }

        await updateConversationRating(conversationId, rating);

        res.json({ success: true, message: 'Rating submitted successfully' });
    } catch (error) {
        console.error('Rating error:', error);
        res.status(500).json({
            error: 'Failed to submit rating',
            details: error.message
        });
    }
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

