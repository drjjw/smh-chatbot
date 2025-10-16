/**
 * Local Embeddings Module
 * Uses all-MiniLM-L6-v2 model via @xenova/transformers
 * Provides local, offline embedding generation without API costs
 */

const { pipeline, env } = require('@xenova/transformers');

// Configure transformers to use local cache
env.cacheDir = './.cache/transformers';

// Model cache
let embeddingPipeline = null;
let isModelLoading = false;
let modelLoadPromise = null;

/**
 * Initialize the embedding model
 * Downloads model on first run (~90MB), then caches locally
 */
async function initializeModel() {
    if (embeddingPipeline) {
        return embeddingPipeline;
    }

    if (isModelLoading) {
        // If model is already being loaded, wait for it
        return modelLoadPromise;
    }

    isModelLoading = true;
    console.log('🔄 Initializing all-MiniLM-L6-v2 model...');
    console.log('   (First run will download ~90MB model)');

    try {
        modelLoadPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        embeddingPipeline = await modelLoadPromise;
        console.log('✅ Local embedding model loaded successfully');
        console.log('   Model: all-MiniLM-L6-v2 (384 dimensions)');
        return embeddingPipeline;
    } catch (error) {
        console.error('❌ Failed to initialize local embedding model:', error.message);
        isModelLoading = false;
        modelLoadPromise = null;
        throw error;
    } finally {
        isModelLoading = false;
    }
}

/**
 * Generate embedding for text using local model
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - 384-dimensional embedding vector
 */
async function generateLocalEmbedding(text) {
    const startTime = Date.now();
    
    try {
        // Ensure model is loaded
        const model = await initializeModel();
        
        // Generate embedding
        const output = await model(text, {
            pooling: 'mean',
            normalize: true
        });
        
        // Convert to regular array
        const embedding = Array.from(output.data);
        
        const duration = Date.now() - startTime;
        console.log(`Local embedding generated in ${duration}ms (${embedding.length} dimensions)`);
        
        return embedding;
    } catch (error) {
        console.error('Error generating local embedding:', error.message);
        throw error;
    }
}

/**
 * Get model info
 */
function getModelInfo() {
    return {
        name: 'all-MiniLM-L6-v2',
        dimensions: 384,
        maxTokens: 256,
        loaded: embeddingPipeline !== null,
        source: 'Sentence Transformers (via Xenova/transformers.js)'
    };
}

module.exports = {
    generateLocalEmbedding,
    initializeModel,
    getModelInfo
};



