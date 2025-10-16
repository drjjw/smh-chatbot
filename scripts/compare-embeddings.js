#!/usr/bin/env node

/**
 * Embedding Comparison Test Script
 * 
 * Compares OpenAI embeddings vs local all-MiniLM-L6-v2 embeddings
 * Tests performance, accuracy, and retrieval quality
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3456';
const OUTPUT_FILE = path.join(__dirname, '..', 'EMBEDDING-COMPARISON-RESULTS.md');

// Test queries (mix of correct spelling and typos)
const TEST_QUERIES = [
    'what is protocol for treating hemodialysis catheter infection',
    'what is protocol for treating hemodialsysi catheter infection', // typo
    'hyperkalemia management in dialysis patients',
    'hyperkalemia managment', // typo
    'AKI staging criteria KDIGO',
    'peritoneal dialysis complications and management',
    'indications for urgent dialysis',
    'contrast induced nephropathy prevention'
];

// Models to test
const MODELS = ['gemini']; // Could add 'grok' later
const DOC_TYPES = ['smh'];  // Could add 'uhn' later

/**
 * Send a test query to the API
 */
async function testQuery(query, embeddingType, model, docType) {
    const startTime = Date.now();
    
    try {
        const response = await fetch(`${API_URL}/api/chat-rag?embedding=${embeddingType}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: query,
                history: [],
                model: model,
                sessionId: '00000000-0000-0000-0000-000000000000',
                doc: docType
            }),
            timeout: 60000
        });

        const data = await response.json();
        const totalTime = Date.now() - startTime;

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return {
            success: true,
            response: data.response,
            metadata: data.metadata,
            totalTime: totalTime,
            error: null
        };
    } catch (error) {
        return {
            success: false,
            response: null,
            metadata: null,
            totalTime: Date.now() - startTime,
            error: error.message
        };
    }
}

/**
 * Compare two sets of chunks
 */
function compareChunks(openaiChunks, localChunks) {
    if (!openaiChunks || !localChunks) {
        return { overlap: 0, total: 0, percentage: 0 };
    }

    const openaiIndices = new Set(openaiChunks.map(c => c.index));
    const localIndices = new Set(localChunks.map(c => c.index));
    
    const intersection = [...openaiIndices].filter(x => localIndices.has(x));
    const union = new Set([...openaiIndices, ...localIndices]);

    return {
        overlap: intersection.length,
        total: union.size,
        percentage: union.size > 0 ? (intersection.length / union.size * 100).toFixed(1) : 0,
        openaiOnly: openaiIndices.size - intersection.length,
        localOnly: localIndices.size - intersection.length
    };
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('🧪 Starting Embedding Comparison Tests');
    console.log('=' .repeat(60));
    console.log(`API URL: ${API_URL}`);
    console.log(`Test queries: ${TEST_QUERIES.length}`);
    console.log(`Models: ${MODELS.join(', ')}`);
    console.log(`Documents: ${DOC_TYPES.join(', ')}`);
    console.log('=' .repeat(60) + '\n');

    const results = [];
    let testNumber = 0;
    const totalTests = TEST_QUERIES.length * MODELS.length * DOC_TYPES.length;

    for (const docType of DOC_TYPES) {
        for (const model of MODELS) {
            for (const query of TEST_QUERIES) {
                testNumber++;
                console.log(`\n[${testNumber}/${totalTests}] Testing query: "${query.substring(0, 50)}..."`);
                
                // Test with OpenAI embeddings
                console.log('  🔵 Testing OpenAI embeddings...');
                const openaiResult = await testQuery(query, 'openai', model, docType);
                
                if (openaiResult.success) {
                    console.log(`     ✓ Success (${openaiResult.totalTime}ms)`);
                } else {
                    console.log(`     ✗ Failed: ${openaiResult.error}`);
                }

                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, 500));

                // Test with local embeddings
                console.log('  🟢 Testing local embeddings...');
                const localResult = await testQuery(query, 'local', model, docType);
                
                if (localResult.success) {
                    console.log(`     ✓ Success (${localResult.totalTime}ms)`);
                } else {
                    console.log(`     ✗ Failed: ${localResult.error}`);
                }

                // Compare results
                const comparison = {
                    query,
                    model,
                    docType,
                    openai: openaiResult,
                    local: localResult,
                    timeDiff: null,
                    chunkComparison: null
                };

                if (openaiResult.success && localResult.success) {
                    comparison.timeDiff = {
                        absolute: localResult.totalTime - openaiResult.totalTime,
                        percentage: ((localResult.totalTime / openaiResult.totalTime - 1) * 100).toFixed(1),
                        faster: localResult.totalTime < openaiResult.totalTime ? 'local' : 'openai'
                    };

                    comparison.chunkComparison = compareChunks(
                        openaiResult.metadata?.chunkSimilarities,
                        localResult.metadata?.chunkSimilarities
                    );

                    console.log(`  📊 Time: OpenAI ${openaiResult.totalTime}ms vs Local ${localResult.totalTime}ms (${comparison.timeDiff.faster} faster by ${Math.abs(comparison.timeDiff.absolute)}ms)`);
                    console.log(`  📊 Chunk overlap: ${comparison.chunkComparison.overlap}/${comparison.chunkComparison.total} (${comparison.chunkComparison.percentage}%)`);
                }

                results.push(comparison);

                // Small delay between queries
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    return results;
}

/**
 * Generate markdown report
 */
function generateReport(results) {
    const timestamp = new Date().toISOString();
    let report = `# Embedding Comparison Test Results\n\n`;
    report += `**Date**: ${timestamp}\n`;
    report += `**API URL**: ${API_URL}\n`;
    report += `**Total Tests**: ${results.length}\n\n`;

    // Summary statistics
    const successfulTests = results.filter(r => r.openai.success && r.local.success);
    const openaiFailures = results.filter(r => !r.openai.success).length;
    const localFailures = results.filter(r => !r.local.success).length;

    report += `## Summary\n\n`;
    report += `- Successful comparisons: ${successfulTests.length}/${results.length}\n`;
    report += `- OpenAI failures: ${openaiFailures}\n`;
    report += `- Local failures: ${localFailures}\n\n`;

    if (successfulTests.length > 0) {
        // Performance statistics
        const avgOpenaiTime = successfulTests.reduce((sum, r) => sum + r.openai.totalTime, 0) / successfulTests.length;
        const avgLocalTime = successfulTests.reduce((sum, r) => sum + r.local.totalTime, 0) / successfulTests.length;
        const avgOpenaiRetrieval = successfulTests.reduce((sum, r) => sum + (r.openai.metadata?.retrievalTime || 0), 0) / successfulTests.length;
        const avgLocalRetrieval = successfulTests.reduce((sum, r) => sum + (r.local.metadata?.retrievalTime || 0), 0) / successfulTests.length;

        report += `## Performance Comparison\n\n`;
        report += `| Metric | OpenAI | Local | Winner |\n`;
        report += `|--------|--------|-------|--------|\n`;
        report += `| Avg Total Time | ${avgOpenaiTime.toFixed(0)}ms | ${avgLocalTime.toFixed(0)}ms | ${avgLocalTime < avgOpenaiTime ? '**Local**' : '**OpenAI**'} |\n`;
        report += `| Avg Retrieval Time | ${avgOpenaiRetrieval.toFixed(0)}ms | ${avgLocalRetrieval.toFixed(0)}ms | ${avgLocalRetrieval < avgOpenaiRetrieval ? '**Local**' : '**OpenAI**'} |\n`;
        report += `| Faster (count) | ${successfulTests.filter(r => r.timeDiff?.faster === 'openai').length} | ${successfulTests.filter(r => r.timeDiff?.faster === 'local').length} | - |\n\n`;

        // Chunk overlap statistics
        const avgChunkOverlap = successfulTests.reduce((sum, r) => sum + parseFloat(r.chunkComparison?.percentage || 0), 0) / successfulTests.length;
        
        report += `## Chunk Retrieval Comparison\n\n`;
        report += `- Average chunk overlap: ${avgChunkOverlap.toFixed(1)}%\n`;
        report += `- Perfect matches (100% overlap): ${successfulTests.filter(r => r.chunkComparison?.percentage == 100).length}\n`;
        report += `- High overlap (≥80%): ${successfulTests.filter(r => parseFloat(r.chunkComparison?.percentage) >= 80).length}\n`;
        report += `- Medium overlap (50-79%): ${successfulTests.filter(r => { const p = parseFloat(r.chunkComparison?.percentage); return p >= 50 && p < 80; }).length}\n`;
        report += `- Low overlap (<50%): ${successfulTests.filter(r => parseFloat(r.chunkComparison?.percentage) < 50).length}\n\n`;
    }

    // Detailed results
    report += `## Detailed Test Results\n\n`;

    results.forEach((result, i) => {
        report += `### Test ${i + 1}: ${result.query}\n\n`;
        report += `**Model**: ${result.model} | **Document**: ${result.docType}\n\n`;

        if (result.openai.success && result.local.success) {
            report += `#### Performance\n\n`;
            report += `| | OpenAI | Local | Difference |\n`;
            report += `|---|--------|-------|------------|\n`;
            report += `| Total Time | ${result.openai.totalTime}ms | ${result.local.totalTime}ms | ${result.timeDiff.absolute > 0 ? '+' : ''}${result.timeDiff.absolute}ms (${result.timeDiff.percentage}%) |\n`;
            report += `| Retrieval Time | ${result.openai.metadata?.retrievalTime || 'N/A'}ms | ${result.local.metadata?.retrievalTime || 'N/A'}ms | - |\n`;
            report += `| Chunks Used | ${result.openai.metadata?.chunksUsed || 'N/A'} | ${result.local.metadata?.chunksUsed || 'N/A'} | - |\n\n`;

            report += `#### Chunk Overlap\n\n`;
            report += `- Common chunks: ${result.chunkComparison.overlap}\n`;
            report += `- Total unique chunks: ${result.chunkComparison.total}\n`;
            report += `- Overlap percentage: ${result.chunkComparison.percentage}%\n`;
            report += `- OpenAI-only chunks: ${result.chunkComparison.openaiOnly}\n`;
            report += `- Local-only chunks: ${result.chunkComparison.localOnly}\n\n`;

            // Show chunk indices for analysis
            if (result.openai.metadata?.chunkSimilarities && result.local.metadata?.chunkSimilarities) {
                report += `**OpenAI chunks**: ${result.openai.metadata.chunkSimilarities.map(c => c.index).join(', ')}\n\n`;
                report += `**Local chunks**: ${result.local.metadata.chunkSimilarities.map(c => c.index).join(', ')}\n\n`;
            }

        } else {
            if (!result.openai.success) {
                report += `**OpenAI Error**: ${result.openai.error}\n\n`;
            }
            if (!result.local.success) {
                report += `**Local Error**: ${result.local.error}\n\n`;
            }
        }

        report += `---\n\n`;
    });

    // Recommendations
    report += `## Recommendations\n\n`;
    if (successfulTests.length > 0) {
        const localFasterCount = successfulTests.filter(r => r.timeDiff?.faster === 'local').length;
        const localFasterPercent = (localFasterCount / successfulTests.length * 100).toFixed(0);
        
        report += `Based on ${successfulTests.length} successful tests:\n\n`;
        
        if (localFasterPercent >= 70) {
            report += `- ✅ **Local embeddings are faster in ${localFasterPercent}% of cases** - Consider using local as default\n`;
        } else if (localFasterPercent >= 40) {
            report += `- ⚖️ **Performance is comparable** - Choice depends on other factors (cost, offline capability)\n`;
        } else {
            report += `- ⚠️ **OpenAI embeddings are faster in ${100 - localFasterPercent}% of cases** - May want to stick with OpenAI\n`;
        }

        if (avgChunkOverlap >= 80) {
            report += `- ✅ **High chunk overlap (${avgChunkOverlap.toFixed(1)}%)** - Both systems retrieve similar content\n`;
        } else if (avgChunkOverlap >= 60) {
            report += `- ⚖️ **Moderate chunk overlap (${avgChunkOverlap.toFixed(1)}%)** - Some differences in retrieval\n`;
        } else {
            report += `- ⚠️ **Low chunk overlap (${avgChunkOverlap.toFixed(1)}%)** - Significant differences in what gets retrieved\n`;
        }

        report += `\n### Quality Assessment Needed\n\n`;
        report += `To determine which embedding system produces better responses, manual review of answer quality is required. Compare:\n\n`;
        report += `1. Answer accuracy and completeness\n2. Relevance to the question\n3. Handling of typos and misspellings\n4. Overall clinical usefulness\n\n`;
    }

    return report;
}

/**
 * Main execution
 */
async function main() {
    try {
        // Run tests
        const results = await runTests();

        // Generate report
        console.log('\n\n📝 Generating comparison report...');
        const report = generateReport(results);

        // Save report
        fs.writeFileSync(OUTPUT_FILE, report);
        console.log(`✅ Report saved to: ${OUTPUT_FILE}`);

        // Print summary
        const successfulTests = results.filter(r => r.openai.success && r.local.success);
        console.log('\n' + '='.repeat(60));
        console.log('📊 Test Summary');
        console.log('='.repeat(60));
        console.log(`Total tests: ${results.length}`);
        console.log(`Successful: ${successfulTests.length}`);
        console.log(`OpenAI failures: ${results.filter(r => !r.openai.success).length}`);
        console.log(`Local failures: ${results.filter(r => !r.local.success).length}`);
        
    if (successfulTests.length > 0) {
        const avgOpenaiTime = successfulTests.reduce((sum, r) => sum + r.openai.totalTime, 0) / successfulTests.length;
        const avgLocalTime = successfulTests.reduce((sum, r) => sum + r.local.totalTime, 0) / successfulTests.length;
        const avgOpenaiRetrieval = successfulTests.reduce((sum, r) => sum + (r.openai.metadata?.retrievalTime || 0), 0) / successfulTests.length;
        const avgLocalRetrieval = successfulTests.reduce((sum, r) => sum + (r.local.metadata?.retrievalTime || 0), 0) / successfulTests.length;
        const avgChunkOverlap = successfulTests.reduce((sum, r) => sum + parseFloat(r.chunkComparison?.percentage || 0), 0) / successfulTests.length;
            
            console.log(`\nAverage response time:`);
            console.log(`  OpenAI: ${avgOpenaiTime.toFixed(0)}ms`);
            console.log(`  Local:  ${avgLocalTime.toFixed(0)}ms`);
            console.log(`\nAverage chunk overlap: ${avgChunkOverlap.toFixed(1)}%`);
        }
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { testQuery, compareChunks };

