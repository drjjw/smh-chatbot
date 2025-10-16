#!/usr/bin/env node

/**
 * PDF Chunking and Embedding Script for RAG Enhancement
 * 
 * This script:
 * 1. Loads PDF documents (SMH and UHN manuals)
 * 2. Splits them into semantic chunks (500 tokens with 100 token overlap)
 * 3. Generates embeddings using OpenAI text-embedding-3-small API
 * 4. Stores chunks and embeddings in Supabase
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Initialize clients
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for insert permissions
);

// Configuration
const CHUNK_SIZE = 500; // tokens (roughly 2000 characters)
const CHUNK_OVERLAP = 100; // tokens (roughly 400 characters)
const CHARS_PER_TOKEN = 4; // Rough estimate
const BATCH_SIZE = 50; // Process embeddings in batches (OpenAI has good rate limits)
const BATCH_DELAY_MS = 100; // Small delay between batches

// PDF document configurations
const DOCUMENTS = [
    {
        type: 'smh',
        filename: 'smh-manual-2023.pdf',
        name: 'SMH Housestaff Manual 2023'
    },
    {
        type: 'uhn',
        filename: 'uhn-manual-2025.pdf',
        name: 'UHN Nephrology Manual 2025'
    }
];

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
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
            encoding_format: 'float'
        });
        
        return response.data[0].embedding;
    } catch (error) {
        console.error('Error generating embedding:', error.message);
        throw error;
    }
}

/**
 * Process embeddings in batches
 */
async function processEmbeddingsBatch(chunks, startIdx, batchSize) {
    const batch = chunks.slice(startIdx, startIdx + batchSize);
    const embeddings = [];
    
    // OpenAI supports batch requests, but we'll do them individually for simplicity
    for (const chunk of batch) {
        try {
            const embedding = await generateEmbedding(chunk.content);
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
 * Store chunks with embeddings in Supabase
 */
async function storeChunks(documentType, documentName, chunksWithEmbeddings) {
    const records = chunksWithEmbeddings
        .filter(item => item.embedding !== null)
        .map(({ chunk, embedding }) => ({
            document_type: documentType,
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
            .from('document_chunks')
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
 * Main processing function
 */
async function processDocument(docConfig) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📄 Processing: ${docConfig.name}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const startTime = Date.now();
    
    // 1. Load PDF
    console.log('📖 Loading PDF...');
    const filepath = path.join(__dirname, '..', docConfig.filename);
    const pdfData = await loadPDF(filepath);
    console.log(`  ✓ Loaded ${pdfData.pages} pages`);
    console.log(`  ✓ Total characters: ${pdfData.text.length.toLocaleString()}`);
    
    // 2. Chunk text
    console.log('\n✂️  Chunking text...');
    const chunks = chunkText(pdfData.text);
    console.log(`  ✓ Created ${chunks.length} chunks`);
    console.log(`  ✓ Chunk size: ~${CHUNK_SIZE} tokens (${CHUNK_SIZE * CHARS_PER_TOKEN} chars)`);
    console.log(`  ✓ Overlap: ~${CHUNK_OVERLAP} tokens (${CHUNK_OVERLAP * CHARS_PER_TOKEN} chars)`);
    
    // 3. Generate embeddings
    console.log('\n🔢 Generating embeddings with OpenAI...');
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
    console.log('\n💾 Storing in Supabase...');
    const insertedCount = await storeChunks(docConfig.type, docConfig.name, allEmbeddings);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Completed in ${duration}s`);
    console.log(`  📊 Final stats:`);
    console.log(`     - Chunks processed: ${chunks.length}`);
    console.log(`     - Embeddings generated: ${successCount}`);
    console.log(`     - Records stored: ${insertedCount}`);
}

/**
 * Main execution
 */
async function main() {
    console.log('\n🚀 PDF Chunking & Embedding Script (OpenAI)');
    console.log('=' .repeat(60));
    
    // Check environment
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_key_here') {
        console.error('❌ OPENAI_API_KEY not found in environment');
        console.error('   Please add your OpenAI API key to .env file');
        process.exit(1);
    }
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Supabase credentials not found in environment');
        process.exit(1);
    }
    
    console.log('✓ Environment variables loaded');
    console.log(`✓ Target database: ${process.env.SUPABASE_URL}`);
    console.log(`✓ Using OpenAI text-embedding-3-small (1536 dimensions)`);
    
    // Process each document
    for (const doc of DOCUMENTS) {
        await processDocument(doc);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 All documents processed successfully!');
    console.log('='.repeat(60) + '\n');
}

// Run main function
if (require.main === module) {
    main().catch(error => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { cleanPDFText, chunkText, generateEmbedding };
