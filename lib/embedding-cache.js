/**
 * Embedding Cache Service
 *
 * Caches query embeddings to reduce API calls and improve performance.
 * Supports both OpenAI and local embeddings with configurable TTL.
 */

const crypto = require('crypto');

// Cache configuration
const CACHE_CONFIG = {
    maxSize: 1000, // Maximum number of cached embeddings
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours TTL
    cleanupIntervalMs: 60 * 60 * 1000 // Clean up expired entries every hour
};

// In-memory cache storage
const embeddingCache = new Map();

// Cache statistics
const stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0
};

/**
 * Generate cache key from query text and embedding type
 */
function generateCacheKey(text, embeddingType) {
    // Create hash of the normalized query text
    const normalizedText = text.trim().toLowerCase();
    const hash = crypto.createHash('sha256').update(normalizedText).digest('hex');
    return `${embeddingType}:${hash}`;
}

/**
 * Create cache entry
 */
function createCacheEntry(embedding, embeddingType) {
    return {
        embedding,
        embeddingType,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now()
    };
}

/**
 * Check if cache entry is expired
 */
function isExpired(entry) {
    return Date.now() - entry.timestamp > CACHE_CONFIG.ttlMs;
}

/**
 * Clean up expired entries and enforce size limits
 */
function cleanupCache() {
    const now = Date.now();
    let evictedCount = 0;

    // Remove expired entries
    for (const [key, entry] of embeddingCache.entries()) {
        if (isExpired(entry)) {
            embeddingCache.delete(key);
            evictedCount++;
        }
    }

    // If still over size limit, remove least recently used entries
    if (embeddingCache.size > CACHE_CONFIG.maxSize) {
        const entries = Array.from(embeddingCache.entries())
            .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

        const toRemove = embeddingCache.size - CACHE_CONFIG.maxSize;
        for (let i = 0; i < toRemove; i++) {
            embeddingCache.delete(entries[i][0]);
            evictedCount++;
        }
    }

    if (evictedCount > 0) {
        stats.evictions += evictedCount;
        console.log(`🧹 Embedding cache: evicted ${evictedCount} entries`);
    }

    stats.size = embeddingCache.size;
}

/**
 * Get cached embedding
 */
function getCachedEmbedding(text, embeddingType) {
    const key = generateCacheKey(text, embeddingType);
    const entry = embeddingCache.get(key);

    if (!entry) {
        stats.misses++;
        return null;
    }

    if (isExpired(entry)) {
        embeddingCache.delete(key);
        stats.misses++;
        stats.evictions++;
        return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    stats.hits++;

    console.log(`💾 Embedding cache hit: ${key} (${entry.accessCount} uses) [CACHE]`);
    return entry.embedding;
}

/**
 * Cache embedding
 */
function setCachedEmbedding(text, embedding, embeddingType) {
    const key = generateCacheKey(text, embeddingType);
    const entry = createCacheEntry(embedding, embeddingType);

    embeddingCache.set(key, entry);
    stats.size = embeddingCache.size;

    // Trigger cleanup if we exceed max size
    if (embeddingCache.size > CACHE_CONFIG.maxSize) {
        cleanupCache();
    }

    console.log(`💾 Embedding cached: ${key} (${embedding.length}D) [CACHE]`);
}

/**
 * Enhanced embedding function with caching
 */
async function getEmbeddingWithCache(text, embeddingFunction, embeddingType) {
    // Check cache first
    const cached = getCachedEmbedding(text, embeddingType);
    if (cached) {
        return cached;
    }

    // Generate new embedding
    console.log(`🔄 Generating ${embeddingType} embedding for query...`);
    const startTime = Date.now();

    const embedding = await embeddingFunction(text);
    const duration = Date.now() - startTime;

    console.log(`✅ Generated ${embeddingType} embedding in ${duration}ms`);

    // Cache the result
    setCachedEmbedding(text, embedding, embeddingType);

    return embedding;
}

/**
 * Get cache statistics
 */
function getCacheStats() {
    const hitRate = stats.hits + stats.misses > 0 ?
        (stats.hits / (stats.hits + stats.misses) * 100).toFixed(1) : 0;

    return {
        ...stats,
        hitRate: `${hitRate}%`,
        size: embeddingCache.size,
        maxSize: CACHE_CONFIG.maxSize,
        ttlMs: CACHE_CONFIG.ttlMs,
        activeEntries: Array.from(embeddingCache.entries()).map(([key, entry]) => ({
            key,
            type: entry.embeddingType,
            age: Math.round((Date.now() - entry.timestamp) / 1000 / 60), // minutes
            accessCount: entry.accessCount,
            lastAccessed: Math.round((Date.now() - entry.lastAccessed) / 1000 / 60) // minutes ago
        }))
    };
}

/**
 * Clear cache (useful for testing)
 */
function clearCache() {
    const oldSize = embeddingCache.size;
    embeddingCache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.evictions = 0;
    stats.size = 0;

    console.log(`🗑️  Embedding cache cleared (${oldSize} entries removed)`);
}

/**
 * Initialize cache cleanup interval
 */
function initializeCacheCleanup() {
    setInterval(cleanupCache, CACHE_CONFIG.cleanupIntervalMs);
    console.log(`⏰ Embedding cache cleanup scheduled every ${CACHE_CONFIG.cleanupIntervalMs / 1000 / 60} minutes`);
}

// Export functions
module.exports = {
    getEmbeddingWithCache,
    getCacheStats,
    clearCache,
    initializeCacheCleanup
};
