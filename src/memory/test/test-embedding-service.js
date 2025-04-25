#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import assert from 'assert';
import fetch from 'node-fetch';
import {
  generateEmbedding,
  generateEmbeddingsBatch,
  generateEntityEmbedding,
  cosineSimilarity,
  clearEmbeddingCache,
  getEmbeddingCacheSize
} from '../dist/embedding-service.js';

// Load environment variables from .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(dirname(__dirname), '.env');
dotenv.config({ path: envPath });

// Log environment variables for debugging
console.log('Environment variables:');
console.log('EMBEDDING_API_URL:', process.env.EMBEDDING_API_URL);
console.log('EMBEDDING_MODEL:', process.env.EMBEDDING_MODEL);
console.log('EMBEDDING_API_KEY:', process.env.EMBEDDING_API_KEY ? 'Set (value hidden)' : 'Not set');
console.log('EMBEDDING_DIMENSION:', process.env.EMBEDDING_DIMENSION);

// Set environment variables manually if not loaded from .env
if (!process.env.EMBEDDING_API_KEY) {
  console.log('Setting environment variables manually...');
  process.env.EMBEDDING_API_URL = 'https://cloud.infini-ai.com/maas/v1/embeddings';
  process.env.EMBEDDING_API_KEY = 'sk-da2aztc3c6slspo4';
  process.env.EMBEDDING_MODEL = 'jina-embeddings-v2-base-zh';
  process.env.EMBEDDING_DIMENSION = '768';
}

// Test configuration
const TEST_TEXTS = [
  "Hello world",
  "The quick brown fox jumps over the lazy dog",
  "Machine learning is fascinating",
  "Vector embeddings represent semantic meaning"
];

const TEST_ENTITY = {
  name: "John_Smith",
  entityType: "person",
  observations: ["Speaks fluent Spanish", "Lives in New York"]
};

// Helper functions
function isValidEmbedding(embedding) {
  return (
    Array.isArray(embedding) &&
    embedding.length > 0 &&
    embedding.every(value => typeof value === 'number')
  );
}

function logSuccess(message) {
  console.log(`✅ ${message}`);
}

function logFailure(message, error) {
  console.error(`❌ ${message}`);
  if (error) console.error(error);
}

// Main test function
async function runTests() {
  console.log('🧪 Starting embedding service tests...');

  try {
    // Test 1: Generate a single embedding
    try {
      console.log('\n📋 Test 1: Generate a single embedding');
      const embedding = await generateEmbedding(TEST_TEXTS[0]);
      assert(isValidEmbedding(embedding), 'Embedding should be a non-empty array of numbers');
      logSuccess('Successfully generated embedding');
      console.log(`   Embedding dimension: ${embedding.length}`);

      // Test cache
      const cacheSize1 = getEmbeddingCacheSize();
      assert(cacheSize1 === 1, `Cache should contain 1 item, found ${cacheSize1}`);
      logSuccess('Cache is working correctly');

      // Test cached retrieval
      console.time('   Cached retrieval');
      const cachedEmbedding = await generateEmbedding(TEST_TEXTS[0]);
      console.timeEnd('   Cached retrieval');
      assert(embedding === cachedEmbedding, 'Cached embedding should be the same reference');
      logSuccess('Cached retrieval is working correctly');
    } catch (error) {
      logFailure('Failed to generate single embedding', error);
      throw error;
    }

    // Test 2: Generate batch embeddings
    try {
      console.log('\n📋 Test 2: Generate batch embeddings');
      clearEmbeddingCache();
      assert(getEmbeddingCacheSize() === 0, 'Cache should be empty after clearing');

      const embeddings = await generateEmbeddingsBatch(TEST_TEXTS);
      assert(Array.isArray(embeddings), 'Batch result should be an array');
      assert(embeddings.length === TEST_TEXTS.length, `Should return ${TEST_TEXTS.length} embeddings`);

      embeddings.forEach((embedding, i) => {
        assert(isValidEmbedding(embedding), `Embedding ${i} should be a non-empty array of numbers`);
      });

      logSuccess(`Successfully generated ${embeddings.length} embeddings in batch`);

      // Test cache after batch
      const cacheSize2 = getEmbeddingCacheSize();
      assert(cacheSize2 === TEST_TEXTS.length, `Cache should contain ${TEST_TEXTS.length} items, found ${cacheSize2}`);
      logSuccess('Batch caching is working correctly');
    } catch (error) {
      logFailure('Failed to generate batch embeddings', error);
      throw error;
    }

    // Test 3: Generate entity embedding
    try {
      console.log('\n📋 Test 3: Generate entity embedding');
      const entityEmbedding = await generateEntityEmbedding(TEST_ENTITY);
      assert(isValidEmbedding(entityEmbedding), 'Entity embedding should be a non-empty array of numbers');
      logSuccess('Successfully generated entity embedding');

      // Verify that entity embedding is different from simple text embeddings
      const nameEmbedding = await generateEmbedding(TEST_ENTITY.name);
      const similarity = cosineSimilarity(entityEmbedding, nameEmbedding);
      console.log(`   Similarity between entity and name-only embeddings: ${similarity.toFixed(4)}`);
      assert(similarity < 1.0, 'Entity embedding should be different from name-only embedding');
      logSuccess('Entity embedding correctly combines name and type');
    } catch (error) {
      logFailure('Failed to generate entity embedding', error);
      throw error;
    }

    // Test 4: Test cosine similarity
    try {
      console.log('\n📋 Test 4: Test cosine similarity');

      // Get embeddings for semantically similar texts
      const embedding1 = await generateEmbedding("Machine learning is fascinating");
      const embedding2 = await generateEmbedding("AI and neural networks are interesting");
      const embedding3 = await generateEmbedding("The weather is nice today");

      const similarity12 = cosineSimilarity(embedding1, embedding2);
      const similarity13 = cosineSimilarity(embedding1, embedding3);

      console.log(`   Similarity between related concepts: ${similarity12.toFixed(4)}`);
      console.log(`   Similarity between unrelated concepts: ${similarity13.toFixed(4)}`);

      assert(similarity12 > similarity13, 'Related concepts should have higher similarity');
      logSuccess('Cosine similarity correctly identifies semantic relationships');

      // Test same vector similarity
      const selfSimilarity = cosineSimilarity(embedding1, embedding1);
      assert(Math.abs(selfSimilarity - 1.0) < 0.0001, 'Self similarity should be 1.0');
      logSuccess('Self similarity is correctly calculated as 1.0');

      // Test error handling for different dimensions
      try {
        cosineSimilarity([1, 2, 3], [1, 2]);
        assert(false, 'Should throw error for different dimensions');
      } catch (error) {
        assert(error.message.includes('same dimension'), 'Error message should mention dimension mismatch');
        logSuccess('Correctly handles vectors with different dimensions');
      }
    } catch (error) {
      logFailure('Failed to test cosine similarity', error);
      throw error;
    }

    // Test 5: Test error handling
    try {
      console.log('\n📋 Test 5: Test error handling');

      // Test with empty string
      const emptyEmbedding = await generateEmbedding("");
      assert(isValidEmbedding(emptyEmbedding), 'Should handle empty string');
      logSuccess('Successfully handles empty string');

      // Test with very long text
      const longText = "a".repeat(1000);
      const longEmbedding = await generateEmbedding(longText);
      assert(isValidEmbedding(longEmbedding), 'Should handle long text');
      logSuccess('Successfully handles long text');

      // Test cache management
      clearEmbeddingCache();
      assert(getEmbeddingCacheSize() === 0, 'Cache should be empty after clearing');
      logSuccess('Cache clearing works correctly');
    } catch (error) {
      logFailure('Failed to test error handling', error);
      throw error;
    }

    console.log('\n🎉 All tests passed successfully!');
  } catch (error) {
    console.error('\n❌ Tests failed with error:', error);
    process.exit(1);
  }
}

// Run the tests
runTests();
