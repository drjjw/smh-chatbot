#!/usr/bin/env node

/**
 * PDF Chunking and Local Embedding Script
 * 
 * This script:
 * 1. Loads PDF documents (SMH and UHN manuals)
 * 2. Splits them into semantic chunks (500 tokens with 100 token overlap)
 * 3. Generates embeddings using all-MiniLM-L6-v2 local model
 * 4. Stores chunks and embeddings in Supabase (document_chunks_local table)
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { generateLocalEmbedding, initializeModel, getModelInfo } = require('../lib/local-embeddings');
const { createClient } = require('@supabase/supabase-js');
const documentRegistry = require('../lib/document-registry');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for insert permissions
);

// Configuration
const CHUNK_SIZE = 500; // tokens (roughly 2000 characters)
const CHUNK_OVERLAP = 100; // tokens (roughly 400 characters)
const CHARS_PER_TOKEN = 4; // Rough estimate
const BATCH_SIZE = 50; // Process embeddings in batches
const BATCH_DELAY_MS = 10; // Small delay between batches (local is fast)

/**
 * Clean PDF text to reduce noise (reuse from server.js)
 */
function cleanPDFText(text) {
    let cleaned = text;
    
    // Remove "Page X" headers
    cleaned = cleaned.replace(/\s*Page \d+\s*/g, '\n');
    
    // Remove excessive whitespace
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
    
    // Trim lines
    cleaned = cleaned.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
    
    return cleaned;
}

/**
 * Split text into overlapping chunks
 */
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const chunks = [];
    const chunkChars = chunkSize * CHARS_PER_TOKEN;
    const overlapChars = overlap * CHARS_PER_TOKEN;
    
    let start = 0;
    let chunkIndex = 0;
    
    while (start < text.length) {
        const end = Math.min(start + chunkChars, text.length);
        const chunk = text.substring(start, end);
        
        // Only include non-empty chunks
        if (chunk.trim().length > 0) {
            chunks.push({
                index: chunkIndex,
                content: chunk.trim(),
                charStart: start,
                charEnd: end
            });
            chunkIndex++;
        }
        
        // Move forward by (chunkSize - overlap) to create overlap
        start += chunkChars - overlapChars;
    }
    
    return chunks;
}

/**
 * Process embeddings in batches
 */
async function processEmbeddingsBatch(chunks, startIdx, batchSize) {
    const batch = chunks.slice(startIdx, startIdx + batchSize);
    const embeddings = [];
    
    for (const chunk of batch) {
        try {
            const embedding = await generateLocalEmbedding(chunk.content);
            embeddings.push({ chunk, embedding });
            process.stdout.write('.');
        } catch (error) {
            console.error(`\nFailed to embed chunk ${chunk.index}:`, error.message);
            embeddings.push({ chunk, embedding: null });
        }
    }
    
    return embeddings;
}

/**
 * Load PDF and return content
 */
async function loadPDF(filepath) {
    const dataBuffer = fs.readFileSync(filepath);
    const data = await pdf(dataBuffer);
    return {
        text: cleanPDFText(data.text),
        pages: data.numpages,
        info: data.info
    };
}

/**
 * Store chunks with embeddings in Supabase (local table, now uses document_slug)
 */
async function storeChunks(documentSlug, documentName, chunksWithEmbeddings) {
    const records = chunksWithEmbeddings
        .filter(item => item.embedding !== null)
        .map(({ chunk, embedding }) => ({
            document_slug: documentSlug,
            document_name: documentName,
            chunk_index: chunk.index,
            content: chunk.content,
            embedding: embedding,
            metadata: {
                char_start: chunk.charStart,
                char_end: chunk.charEnd,
                tokens_approx: Math.round(chunk.content.length / CHARS_PER_TOKEN)
            }
        }));
    
    // Insert in batches to avoid payload size limits
    const insertBatchSize = 50;
    let inserted = 0;
    
    for (let i = 0; i < records.length; i += insertBatchSize) {
        const batch = records.slice(i, i + insertBatchSize);
        const { data, error } = await supabase
            .from('document_chunks_local')
            .insert(batch);
        
        if (error) {
            console.error(`\n❌ Error inserting batch ${i / insertBatchSize + 1}:`, error.message);
            throw error;
        }
        
        inserted += batch.length;
        process.stdout.write(`\n  💾 Inserted ${inserted}/${records.length} chunks`);
    }
    
    return inserted;
}

/**
 * Main processing function (now using registry)
 */
async function processDocument(docConfig) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📄 Processing: ${docConfig.title}`);
    console.log(`   Slug: ${docConfig.slug}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const startTime = Date.now();
    
    // 1. Load PDF using registry path
    console.log('📖 Loading PDF...');
    const filepath = documentRegistry.getDocumentPath(docConfig);
    const pdfData = await loadPDF(filepath);
    console.log(`  ✓ Loaded ${pdfData.pages} pages`);
    console.log(`  ✓ Total characters: ${pdfData.text.length.toLocaleString()}`);
    
    // 2. Chunk text
    console.log('\n✂️  Chunking text...');
    const chunks = chunkText(pdfData.text);
    console.log(`  ✓ Created ${chunks.length} chunks`);
    console.log(`  ✓ Chunk size: ~${CHUNK_SIZE} tokens (${CHUNK_SIZE * CHARS_PER_TOKEN} chars)`);
    console.log(`  ✓ Overlap: ~${CHUNK_OVERLAP} tokens (${CHUNK_OVERLAP * CHARS_PER_TOKEN} chars)`);
    
    // 3. Generate embeddings with local model
    console.log('\n🔢 Generating embeddings with local all-MiniLM-L6-v2...');
    console.log(`  Processing in batches of ${BATCH_SIZE}`);
    
    const allEmbeddings = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);
        
        process.stdout.write(`\n  Batch ${batchNum}/${totalBatches}: `);
        
        const batchResults = await processEmbeddingsBatch(chunks, i, BATCH_SIZE);
        allEmbeddings.push(...batchResults);
        
        // Small delay between batches
        if (i + BATCH_SIZE < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
    }
    
    const successCount = allEmbeddings.filter(item => item.embedding !== null).length;
    console.log(`\n  ✓ Generated ${successCount}/${chunks.length} embeddings successfully`);
    
    // 4. Store in Supabase
    console.log('\n💾 Storing in Supabase (document_chunks_local table)...');
    const insertedCount = await storeChunks(docConfig.slug, docConfig.title, allEmbeddings);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Completed in ${duration}s`);
    console.log(`  📊 Final stats:`);
    console.log(`     - Chunks processed: ${chunks.length}`);
    console.log(`     - Embeddings generated: ${successCount}`);
    console.log(`     - Records stored: ${insertedCount}`);
}

/**
 * Main execution (now using document registry)
 */
async function main() {
    console.log('\n🚀 PDF Chunking & Local Embedding Script');
    console.log('=' .repeat(60));
    
    // Check environment
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Supabase credentials not found in environment');
        process.exit(1);
    }
    
    console.log('✓ Environment variables loaded');
    console.log(`✓ Target database: ${process.env.SUPABASE_URL}`);
    
    // Initialize local model
    console.log('\n🤖 Initializing local embedding model...');
    try {
        await initializeModel();
        const modelInfo = getModelInfo();
        console.log(`✓ Model: ${modelInfo.name}`);
        console.log(`✓ Dimensions: ${modelInfo.dimensions}`);
        console.log(`✓ Max tokens: ${modelInfo.maxTokens}`);
    } catch (error) {
        console.error('❌ Failed to initialize model:', error.message);
        process.exit(1);
    }
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const docArg = args.find(arg => arg.startsWith('--doc='));
    const allFlag = args.includes('--all');
    
    // Load document registry
    console.log('\n📚 Loading document registry from database...');
    const allDocs = await documentRegistry.loadDocuments();
    const localDocs = allDocs.filter(doc => doc.embedding_type === 'local');
    
    console.log(`✓ Found ${localDocs.length} documents using local embeddings`);
    
    let docsToProcess = [];
    
    if (allFlag) {
        // Process all documents with local embedding type
        docsToProcess = localDocs;
        console.log('📝 Processing ALL documents with local embeddings');
    } else if (docArg) {
        // Process specific document
        const slug = docArg.split('=')[1];
        const doc = await documentRegistry.getDocumentBySlug(slug);
        
        if (!doc) {
            console.error(`❌ Document not found: ${slug}`);
            process.exit(1);
        }
        
        if (doc.embedding_type !== 'local') {
            console.error(`❌ Document ${slug} uses ${doc.embedding_type} embeddings, not local`);
            console.error(`   Use chunk-and-embed.js for OpenAI embeddings`);
            process.exit(1);
        }
        
        docsToProcess = [doc];
        console.log(`📝 Processing single document: ${slug}`);
    } else {
        // Default: show usage
        console.log('\nUsage:');
        console.log('  node chunk-and-embed-local.js --all           # Process all local embedding docs');
        console.log('  node chunk-and-embed-local.js --doc=<slug>    # Process specific document');
        console.log('\nAvailable documents (local embeddings):');
        localDocs.forEach(doc => {
            console.log(`  - ${doc.slug}: ${doc.title}`);
        });
        process.exit(0);
    }
    
    // Process documents
    for (const doc of docsToProcess) {
        await processDocument(doc);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`🎉 Processed ${docsToProcess.length} document(s) successfully!`);
    console.log('📊 Local embeddings stored in document_chunks_local table');
    console.log('='.repeat(60) + '\n');
}

// Run main function
if (require.main === module) {
    main().catch(error => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { cleanPDFText, chunkText };




