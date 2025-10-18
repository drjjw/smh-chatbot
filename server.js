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

// Graceful shutdown handling
let server;
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  if (server) {
    server.close((err) => {
      if (err) {
        console.error('Error during server close:', err);
        process.exit(1);
      }

      console.log('✓ HTTP server closed gracefully');
      console.log('✓ All connections drained');

      // Close any database connections or cleanup here if needed
      console.log('✓ Cleanup complete. Exiting...');
      process.exit(0);
    });

    // Force shutdown after 30 seconds if graceful shutdown takes too long
    setTimeout(() => {
      console.error('⚠️  Forced shutdown after 30 seconds');
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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

// Initialize document registry
const documentRegistry = require('./lib/document-registry');

// Initialize embedding cache
const { getEmbeddingWithCache, getCacheStats, clearCache, initializeCacheCleanup } = require('./lib/embedding-cache');

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

// Store PDF content in memory (now supports multiple documents from registry)
let documents = {};
let currentDocument = null; // Will be set from registry

// Clean PDF text to reduce token usage
function cleanPDFText(text) {
    let cleaned = text;
    
    // Convert "Page X" headers to citation markers
    cleaned = cleaned.replace(/\s*Page (\d+)\s*/g, '\n[Page $1]\n');
    
    // Remove excessive whitespace (3+ blank lines -> 2)
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
    
    // Trim lines
    cleaned = cleaned.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0) // Remove empty lines
        .join('\n');
    
    return cleaned;
}

// Load and parse PDF documents (now using document registry)
async function loadPDF(documentSlug = 'smh') {
    try {
        // Check if document is already loaded
        if (documents[documentSlug]) {
            console.log(`✓ Document ${documentSlug} already loaded`);
            return documents[documentSlug];
        }

        // Get document metadata from registry
        const docConfig = await documentRegistry.getDocumentBySlug(documentSlug);
        if (!docConfig) {
            throw new Error(`Document not found in registry: ${documentSlug}`);
        }

        console.log(`Loading ${documentSlug} document from registry...`);
        console.log(`  - Title: ${docConfig.title}`);
        console.log(`  - File: ${docConfig.pdf_subdirectory}/${docConfig.pdf_filename}`);

        // Get full path to PDF using registry
        const pdfPath = documentRegistry.getDocumentPath(docConfig);

        // Check if PDF file exists before trying to load it
        if (!fs.existsSync(pdfPath)) {
            throw new Error(`PDF file not found: ${pdfPath}`);
        }

        // Load and parse PDF
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

        // Store document information with registry metadata
        const docInfo = {
            slug: documentSlug,
            name: docConfig.pdf_filename,
            path: pdfPath,
            title: docConfig.title,
            welcomeMessage: docConfig.welcome_message,
            year: docConfig.year,
            embeddingType: docConfig.embedding_type,
            content: cleanedContent,
            metadata: docMetadata,
            registryConfig: docConfig
        };

        // Store in documents cache
        documents[documentSlug] = docInfo;

        console.log('✓ PDF loaded successfully');
        console.log(`  - Document: ${docInfo.name} (${documentSlug.toUpperCase()})`);
        console.log(`  - Title: ${docConfig.title}`);
        console.log(`  - Pages: ${docMetadata.pages}`);
        console.log(`  - Characters: ${cleanedContent.length} (saved ${savedChars} / ${percentSaved}%)`);
        console.log(`  - Est. tokens: ~${Math.round(cleanedContent.length / 4)}`);
        console.log(`  - Embedding type: ${docConfig.embedding_type}`);

        return docInfo;
    } catch (error) {
        console.error(`Error loading PDF ${documentSlug}:`, error);
        throw error;
    }
}

// Set current document context
function setCurrentDocument(documentSlug) {
    if (documents[documentSlug]) {
        currentDocument = documents[documentSlug];
        console.log(`✓ Switched to document: ${currentDocument.title} (${documentSlug})`);
    } else {
        console.error(`Document ${documentSlug} not loaded`);
    }
}

// System prompt - Base for both models (now document-aware with registry)
const getBaseSystemPrompt = (documentSlug = 'smh') => {
    const doc = documents[documentSlug];
    const docName = doc?.welcomeMessage || 'SMH Housestaff Manual';
    const docContent = doc?.content || '';

    return `You are a helpful assistant that answers questions ONLY based on the ${docName} provided below.

***CRITICAL FORMATTING REQUIREMENT: You MUST include footnotes [1], [2], etc. for EVERY claim/fact in your response, with references at the end. Look for [Page X] markers in the text and use them for page numbers in your references. Example: "Drug X is indicated[1]. Dosage is 100mg[2]. [1] Section 3.2, Page 15 [2] Page 45"***

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
- **MANDATORY**: Use footnotes [1], [2], etc. for EVERY claim or fact: place superscript [number] immediately after each claim
- **MANDATORY**: Provide numbered references at the end of EVERY response (do not skip this step)
- Number footnotes sequentially starting from [1] for each response
- Extract page numbers from [Page X] markers in the text for accurate citations
- Example: "Drug X is indicated[1]. Dosage is 100mg[2].\n\n---\n\n**References**\n[1] Section 3.2, Page 15\n[2] Page 45"

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
- **MANDATORY**: Include footnotes [1], [2], etc. for EVERY claim with references at response end
- Example format for drug indications:
  | Condition | Indication |
  |-----------|------------|
  | X         | YES/NO[1]     |

[1] Reference: Section X.X`;

// Grok-specific prompt (analytical, contextual)
const getGrokPrompt = (documentType = 'smh') => getBaseSystemPrompt(documentType) + `

RESPONSE STYLE - STRICTLY FOLLOW:
- ALWAYS add a brief introductory sentence explaining the purpose or context
- When presenting factual data, include WHY it matters (even briefly)
- Add a short concluding note with clinical significance when relevant
- Use more descriptive language - don't just list, explain
- **MANDATORY**: Include footnotes [1], [2], etc. for EVERY claim with references at response end
- Example: Instead of just "Indication: YES", write "indicated because...[1]" and add "[1] Reference: Section X.X" at end
- Connect facts to their clinical rationale from the manual when available`;

// Chat with Gemini
async function chatWithGemini(message, history, documentType = 'smh') {
    console.log(`🤖 Using Gemini model: gemini-2.5-flash`);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash"
    });

    const systemMessage = getGeminiPrompt(documentType);
    
    // Get document name from registry
    const doc = documents[documentType];
    const docName = doc?.welcomeMessage || 'SMH Housestaff Manual';

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
async function chatWithGrok(message, history, documentType = 'smh', modelName = 'grok-4-fast-non-reasoning') {
    console.log(`🤖 Using Grok model: ${modelName}`);
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
        model: modelName,
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
            doc_slug: documentType,
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
            doc_slug: documentType,
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
const getRAGSystemPrompt = async (documentType = 'smh', chunks = []) => {
    // Get document info from registry (for RAG, PDF might not be loaded in memory)
    let docName = 'SMH Housestaff Manual';
    try {
        const docConfig = await documentRegistry.getDocumentBySlug(documentType);
        if (docConfig) {
            // Use title for RAG prompt (cleaner), fall back to welcome_message or default
            docName = docConfig.title || docConfig.welcome_message || docName;
        }
    } catch (error) {
        console.warn(`Could not get document config for ${documentType}, using default name`);
    }
    
    // Combine chunk content with page information
    const context = chunks.map(chunk => {
        const pageInfo = chunk.metadata?.estimated_page ? ` [Page ${chunk.metadata.estimated_page}]` : '';
        return chunk.content + pageInfo;
    }).join('\n\n---\n\n');

    return `You are a helpful assistant that answers questions based on the ${docName}.

***CRITICAL FORMATTING REQUIREMENT: You MUST include footnotes [1], [2], etc. for EVERY claim/fact in your response, with references at the end. Look for [Page X] markers in the text and use them for page numbers in your references. Example: "Drug X is indicated[1]. Dosage is 100mg[2]. [1] Section 3.2, Page 15 [2] Page 45"***

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
- **MANDATORY**: Use footnotes [1], [2], etc. for EVERY claim or fact: place superscript [number] immediately after each claim
- **MANDATORY**: Provide numbered references at the end of EVERY response (do not skip this step)
- Number footnotes sequentially starting from [1] for each response
- Extract page numbers from [Page X] markers in the text for accurate citations
- Example: "Drug X is indicated[1]. Dosage is 100mg[2].\n\n---\n\n**References**\n[1] Section 3.2, Page 15\n[2] Page 45"

RELEVANT EXCERPTS FROM ${docName.toUpperCase()}:
---
${context}
---`;
};

/**
 * Get model-specific RAG prompt
 */
const getRAGGeminiPrompt = async (documentType, chunks) => {
    const basePrompt = await getRAGSystemPrompt(documentType, chunks);
    return basePrompt + `

RESPONSE STYLE - STRICTLY FOLLOW:
- Use markdown tables when presenting structured data
- Present information in the most compact, scannable format
- Lead with the direct answer, then provide details
- Use minimal explanatory text - let the structure speak
- **MANDATORY**: Include footnotes [1], [2], etc. for EVERY claim with references at response end`;
};

const getRAGGrokPrompt = async (documentType, chunks) => {
    const basePrompt = await getRAGSystemPrompt(documentType, chunks);
    return basePrompt + `

RESPONSE STYLE - STRICTLY FOLLOW:
- ALWAYS add a brief introductory sentence explaining the context
- When presenting factual data, include WHY it matters
- Add a short concluding note with clinical significance when relevant
- Use more descriptive language - explain, don't just list
- **MANDATORY**: Include footnotes [1], [2], etc. for EVERY claim with references at response end`;
};

/**
 * Chat with RAG using Gemini
 */
async function chatWithRAGGemini(message, history, documentType, chunks) {
    console.log(`🤖 Using RAG Gemini model: gemini-2.5-flash`);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash"
    });

    const systemMessage = await getRAGGeminiPrompt(documentType, chunks);
    
    // Get document name from registry (use title first for cleaner reference)
    const docConfig = await documentRegistry.getDocumentBySlug(documentType);
    const docName = docConfig?.title || docConfig?.welcome_message || 'SMH Housestaff Manual';

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
async function chatWithRAGGrok(message, history, documentType, chunks, modelName = 'grok-4-fast-non-reasoning') {
    console.log(`🤖 Using RAG Grok model: ${modelName}`);
    const systemMessage = await getRAGGrokPrompt(documentType, chunks);
    
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
        model: modelName,
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

        // Validate document type using registry
        const isValid = await documentRegistry.isValidSlug(doc);
        const documentType = isValid ? doc : 'smh';

        // Ensure document is loaded (lazy loading)
        if (!documents[documentType]) {
            try {
                await ensureDocumentLoaded(documentType);
                setCurrentDocument(documentType);
            } catch (error) {
                console.error(`Failed to load document ${documentType}:`, error.message);
                return res.status(500).json({
                    error: 'Document Loading Error',
                    message: `The requested document (${documentType}) could not be loaded. The PDF file may be missing or corrupted.`,
                    details: error.message
                });
            }
        }

        let responseText;
        let errorOccurred = null;

        try {
            if (model === 'grok') {
                const modelName = 'grok-4-fast-non-reasoning';
                responseText = await chatWithGrok(message, history, documentType, modelName);
            } else if (model === 'grok-reasoning') {
                const modelName = 'grok-4-fast-reasoning';
                responseText = await chatWithGrok(message, history, documentType, modelName);
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

        // Determine actual API model name for response
        const actualModelName = model === 'grok' ? 'grok-4-fast-non-reasoning' :
                                model === 'grok-reasoning' ? 'grok-4-fast-reasoning' :
                                'gemini-2.5-flash';

        res.json({
            response: responseText,
            model: model,
            actualModel: actualModelName,
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

        // Validate document type using registry
        const isValid = await documentRegistry.isValidSlug(doc);
        const documentType = isValid ? doc : 'smh';

        // Ensure document is loaded (lazy loading) - for RAG we need the document loaded
        // to get document metadata, but the actual content is retrieved from database chunks
        if (!documents[documentType]) {
            try {
                await ensureDocumentLoaded(documentType);
            } catch (error) {
                console.error(`Failed to load document ${documentType} for RAG:`, error.message);
                return res.status(500).json({
                    error: 'Document Loading Error',
                    message: `The requested document (${documentType}) could not be loaded. The PDF file may be missing or corrupted.`,
                    details: error.message
                });
            }
        }

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
                console.log(`RAG: Starting embedding process for type: ${embeddingType}`);
                if (embeddingType === 'local') {
                    // Use cached local embeddings
                    console.log(`RAG: Using cached local embeddings`);
                    queryEmbedding = await getEmbeddingWithCache(
                        message,
                        async (text) => {
                            console.log(`RAG: Generating local embedding for: "${text.substring(0, 30)}..."`);
                            await ensureLocalEmbeddings();
                            return await generateLocalEmbedding(text);
                        },
                        'local'
                    );
                    console.log(`RAG: Query embedded successfully (cached local, ${queryEmbedding.length}D)`);
                } else {
                    // Use cached OpenAI embeddings
                    console.log(`RAG: Using cached OpenAI embeddings`);
                    queryEmbedding = await getEmbeddingWithCache(
                        message,
                        embedQuery,
                        'openai'
                    );
                    console.log(`RAG: Query embedded successfully (cached OpenAI, 1536D)`);
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
                    const modelName = 'grok-4-fast-non-reasoning';
                    responseText = await chatWithRAGGrok(message, history, documentType, retrievedChunks, modelName);
                } else if (model === 'grok-reasoning') {
                    const modelName = 'grok-4-fast-reasoning';
                    responseText = await chatWithRAGGrok(message, history, documentType, retrievedChunks, modelName);
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
            // Get document info from registry for logging
            const docConfig = await documentRegistry.getDocumentBySlug(documentType);
            const docFileName = docConfig ? docConfig.pdf_filename : 'unknown.pdf';
            const docPath = docConfig ? documentRegistry.getDocumentPath(docConfig) : '';
            const docYear = docConfig ? docConfig.year : null;
            
            const conversationData = {
                session_id: sessionId,
                question: message,
                response: responseText || '',
                model: model,
                response_time_ms: responseTime,
                document_name: docFileName,
                document_path: docPath,
                document_version: docYear,
                pdf_name: docFileName,
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

        // Determine actual API model name for response
        const actualModelName = model === 'grok' ? 'grok-4-fast-non-reasoning' :
                                model === 'grok-reasoning' ? 'grok-4-fast-reasoning' :
                                'gemini-2.5-flash';

        // Get document info from registry for response metadata
        const docConfigResponse = await documentRegistry.getDocumentBySlug(documentType);
        const docFileNameResponse = docConfigResponse ? docConfigResponse.pdf_filename : 'unknown.pdf';
        
        res.json({
            response: responseText,
            model: model,
            actualModel: actualModelName,
            sessionId: sessionId,
            conversationId: res.locals.conversationId,
            metadata: {
                document: docFileNameResponse,
                documentType: documentType,
                documentTitle: docConfigResponse ? docConfigResponse.title : 'Unknown',
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

// Readiness check endpoint (for load balancers and PM2 health checks)
app.get('/api/ready', async (req, res) => {
    try {
        // Ensure registry is loaded
        if (!documentRegistryLoaded) {
            return res.status(503).json({
                status: 'not_ready',
                message: 'Document registry not loaded yet'
            });
        }

        // Check if default document is loaded
        const defaultDoc = activeDocumentSlugs.includes('smh') ? 'smh' : activeDocumentSlugs[0];
        if (!defaultDoc || !documents[defaultDoc]) {
            return res.status(503).json({
                status: 'not_ready',
                message: 'Default document not loaded yet',
                defaultDocument: defaultDoc
            });
        }

        // Server is ready to serve requests
        res.json({
            status: 'ready',
            message: 'Server is fully ready to serve requests',
            defaultDocument: defaultDoc,
            loadedDocuments: Object.keys(documents).length,
            availableDocuments: activeDocumentSlugs.length
        });
    } catch (error) {
        console.error('Readiness check error:', error);
        res.status(503).json({
            status: 'error',
            message: 'Readiness check failed',
            error: error.message
        });
    }
});

// Health check endpoint (with lazy loading awareness)
app.get('/api/health', async (req, res) => {
    try {
        const loadedDocs = Object.keys(documents);
        const requestedDoc = req.query.doc || 'smh';

        // Ensure registry is loaded for health check
        if (!documentRegistryLoaded) {
            await documentRegistry.loadDocuments();
            activeDocumentSlugs = await documentRegistry.getActiveSlugs();
            documentRegistryLoaded = true;
        }

        // Validate using registry
        const isValid = await documentRegistry.isValidSlug(requestedDoc);
        const docType = isValid ? requestedDoc : 'smh';

        // Get current document info
        let currentDocInfo;
        if (documents[docType]) {
            // Document is loaded in memory
            currentDocInfo = {
                title: documents[docType].title,
                pages: documents[docType].metadata.pages,
                loaded: true
            };
        } else if (isValid) {
            // Document exists in registry but not loaded yet (lazy loading)
            const docConfig = await documentRegistry.getDocumentBySlug(docType);
            currentDocInfo = {
                title: docConfig.title,
                pages: 'Not loaded (lazy loading)',
                loaded: false
            };
        }

        // Build document status for all loaded documents
        const docStatus = {};
        loadedDocs.forEach(doc => {
            docStatus[doc] = {
                loaded: true,
                title: documents[doc].title,
                name: documents[doc].name,
                year: documents[doc].year,
                pages: documents[doc].metadata.pages,
                characters: documents[doc].content.length,
                embeddingType: documents[doc].embeddingType
            };
        });

        res.json({
            status: 'ok',
            lazyLoadingEnabled: true,
            currentDocument: currentDocInfo?.title || 'Unknown',
            currentDocumentType: docType,
            currentDocumentLoaded: currentDocInfo?.loaded || false,
            loadedDocuments: loadedDocs,
            availableDocuments: activeDocumentSlugs,
            totalAvailableDocuments: activeDocumentSlugs.length,
            requestedDoc: requestedDoc,
            documentDetails: docStatus
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
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

// Embedding cache statistics endpoint
app.get('/api/cache/stats', async (req, res) => {
    try {
        const stats = getCacheStats();
        res.json({
            success: true,
            cache: stats
        });
    } catch (error) {
        console.error('Error getting cache stats:', error);
        res.status(500).json({ error: 'Failed to get cache statistics' });
    }
});

// Clear embedding cache endpoint (for testing/debugging)
app.post('/api/cache/clear', async (req, res) => {
    try {
        clearCache();
        res.json({
            success: true,
            message: 'Embedding cache cleared'
        });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// Documents registry API endpoint
app.get('/api/documents', async (req, res) => {
    try {
        const docs = await documentRegistry.getDocumentsForAPI();
        res.json({ documents: docs });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Track lazy loading status
let documentRegistryLoaded = false;
let activeDocumentSlugs = [];

// Lazy load document when first requested
async function ensureDocumentLoaded(documentSlug) {
    // Check if document is already loaded
    if (documents[documentSlug]) {
        return documents[documentSlug];
    }

    // Ensure registry is loaded
    if (!documentRegistryLoaded) {
        console.log('🔄 Loading document registry from database...');
        await documentRegistry.loadDocuments();
        activeDocumentSlugs = await documentRegistry.getActiveSlugs();
        documentRegistryLoaded = true;
        console.log(`✓ Document registry loaded: ${activeDocumentSlugs.length} active documents`);
    }

    // Validate document exists in registry
    if (!activeDocumentSlugs.includes(documentSlug)) {
        throw new Error(`Document not found in registry: ${documentSlug}`);
    }

    // Load the document
    console.log(`📄 Lazy loading document: ${documentSlug}`);
    try {
        const docInfo = await loadPDF(documentSlug);
        console.log(`✓ Document ${documentSlug} loaded successfully`);
        return docInfo;
    } catch (error) {
        console.error(`⚠️  Failed to lazy load ${documentSlug}:`, error.message);
        throw error;
    }
}

// Background preload other documents after server starts
async function preloadDocumentsInBackground() {
    try {
        console.log('🔄 Starting background document preloading...');

        // Ensure registry is loaded
        if (!documentRegistryLoaded) {
            await documentRegistry.loadDocuments();
            activeDocumentSlugs = await documentRegistry.getActiveSlugs();
            documentRegistryLoaded = true;
        }

        // Get documents that aren't already loaded
        const unloadedDocs = activeDocumentSlugs.filter(slug => !documents[slug]);

        if (unloadedDocs.length === 0) {
            console.log('✓ All documents already loaded');
            return;
        }

        console.log(`📄 Background loading ${unloadedDocs.length} additional documents...`);

        // Load documents in background (non-blocking)
        for (const slug of unloadedDocs) {
            try {
                await loadPDF(slug);
                console.log(`✓ Background loaded: ${slug}`);
            } catch (error) {
                console.error(`⚠️  Background load failed for ${slug}:`, error.message);
            }
        }

        console.log('✓ Background document preloading complete');
    } catch (error) {
        console.error('⚠️  Background preloading error:', error);
    }
}

// Start server
async function start() {
    const startupStart = Date.now();
    console.log('🔄 Starting server with lazy document loading...');

    try {
        // Phase 1: Load document registry
        const phase1Start = Date.now();
        console.log('📋 Phase 1: Loading document registry...');

        await documentRegistry.loadDocuments();
        activeDocumentSlugs = await documentRegistry.getActiveSlugs();
        documentRegistryLoaded = true;

        const phase1Time = Date.now() - phase1Start;
        console.log(`✓ Document registry loaded (${phase1Time}ms): ${activeDocumentSlugs.length} active documents available`);

        // Phase 2: Load default document
        const phase2Start = Date.now();
        const defaultDoc = activeDocumentSlugs.includes('smh') ? 'smh' : activeDocumentSlugs[0];

        if (defaultDoc) {
            console.log(`📄 Phase 2: Loading default document: ${defaultDoc}`);
            try {
                await loadPDF(defaultDoc);
                setCurrentDocument(defaultDoc);
                const phase2Time = Date.now() - phase2Start;
                console.log(`✓ Default document loaded (${phase2Time}ms): ${documents[defaultDoc].title}`);
            } catch (error) {
                console.error(`⚠️  Failed to load default document ${defaultDoc}:`, error.message);
                throw new Error(`Cannot start server: default document ${defaultDoc} failed to load`);
            }
        } else {
            throw new Error('❌ No documents available in registry. Server cannot start.');
        }

        // Phase 3: Initialize services
        const phase3Start = Date.now();
        console.log('🔧 Phase 3: Initializing services...');

        initializeCacheCleanup();

        const phase3Time = Date.now() - phase3Start;
        console.log(`✓ Services initialized (${phase3Time}ms)`);

        // Phase 4: Start HTTP server
        const phase4Start = Date.now();
        console.log('🌐 Phase 4: Starting HTTP server...');

        const serverStart = Date.now();
        server = app.listen(PORT, () => {
            const serverTime = Date.now() - serverStart;
            const totalStartupTime = Date.now() - startupStart;

            console.log(`\n🚀 Server running at http://localhost:${PORT} (${serverTime}ms)`);
            console.log(`📚 Multi-document chatbot ready (lazy loading enabled)!`);
            console.log(`   - Total startup time: ${totalStartupTime}ms`);
            console.log(`   - Default document: ${defaultDoc} (${documents[defaultDoc].title})`);
            console.log(`   - Available documents: ${activeDocumentSlugs.length} total`);
            console.log(`   - Documents will load on first request`);
            console.log(`   - Use ?doc=<slug> URL parameter to select document\n`);

            // Signal to PM2 that the app is ready
            if (process.send) {
                process.send('ready');
                console.log('✓ Sent ready signal to PM2');
            }

            // Start background preloading after server is ready
            setTimeout(() => {
                preloadDocumentsInBackground();
            }, 1000); // Wait 1 second to ensure server is fully ready
        });
    } catch (error) {
        const totalStartupTime = Date.now() - startupStart;
        console.error(`❌ Failed to start server after ${totalStartupTime}ms:`, error);
        process.exit(1);
    }
}

start();

