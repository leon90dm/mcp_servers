#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import assert from 'assert';
import { generateEmbedding } from '../dist/embedding-service.js';
import { semanticSearch } from '../dist/semantic-search.js';

// Load environment variables from .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(dirname(__dirname), '.env');
dotenv.config({ path: envPath });

// Log environment variables for debugging
console.log('Environment variables:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set (value hidden)' : 'Not set');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? 'Set (value hidden)' : 'Not set');
console.log('VECTOR_ENABLED:', process.env.VECTOR_ENABLED);
console.log('EMBEDDING_API_KEY:', process.env.EMBEDDING_API_KEY ? 'Set (value hidden)' : 'Not set');

// Set environment variables manually if not loaded from .env
if (!process.env.EMBEDDING_API_KEY) {
  console.log('Setting environment variables manually...');
  process.env.EMBEDDING_API_URL = 'https://cloud.infini-ai.com/maas/v1/embeddings';
  process.env.EMBEDDING_API_KEY = 'sk-da2aztc3c6slspo4';
  process.env.EMBEDDING_MODEL = 'jina-embeddings-v2-base-zh';
  process.env.EMBEDDING_DIMENSION = '768';
}

// Mock storage provider for testing
class MockStorageProvider {
  constructor() {
    this.entities = [
      {
        name: 'John_Smith',
        entityType: 'person',
        observations: ['Speaks fluent Spanish', 'Lives in New York', 'Works as a software engineer']
      },
      {
        name: 'Acme_Corp',
        entityType: 'organization',
        observations: ['Founded in 2010', 'Based in San Francisco', 'Specializes in AI technology']
      },
      {
        name: 'Project_Alpha',
        entityType: 'project',
        observations: ['Started in 2022', 'Focuses on machine learning', 'Led by John Smith']
      }
    ];
    
    this.relations = [
      {
        from: 'John_Smith',
        to: 'Acme_Corp',
        relationType: 'works_at'
      },
      {
        from: 'John_Smith',
        to: 'Project_Alpha',
        relationType: 'leads'
      },
      {
        from: 'Acme_Corp',
        to: 'Project_Alpha',
        relationType: 'sponsors'
      }
    ];
    
    // Pre-computed embeddings for entities and observations
    this.entityEmbeddings = new Map();
    this.observationEmbeddings = new Map();
  }
  
  async loadGraph() {
    return {
      entities: this.entities,
      relations: this.relations
    };
  }
  
  async saveGraph() {
    // Not needed for testing
  }
  
  async semanticSearchEntities(queryEmbedding, threshold, limit) {
    // Generate embeddings for entities if not already done
    if (this.entityEmbeddings.size === 0) {
      for (const entity of this.entities) {
        const text = `${entity.name} ${entity.entityType}`;
        const embedding = await generateEmbedding(text);
        this.entityEmbeddings.set(entity.name, embedding);
      }
    }
    
    // Calculate similarity scores
    const scores = [];
    for (const entity of this.entities) {
      const embedding = this.entityEmbeddings.get(entity.name);
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      if (similarity >= threshold) {
        scores.push({ entity, similarity });
      }
    }
    
    // Sort by similarity and limit results
    scores.sort((a, b) => b.similarity - a.similarity);
    return scores.slice(0, limit).map(score => score.entity);
  }
  
  async semanticSearchObservations(queryEmbedding, threshold, limit) {
    // Generate embeddings for observations if not already done
    if (this.observationEmbeddings.size === 0) {
      for (const entity of this.entities) {
        for (const observation of entity.observations) {
          const key = `${entity.name}:${observation}`;
          const embedding = await generateEmbedding(observation);
          this.observationEmbeddings.set(key, embedding);
        }
      }
    }
    
    // Calculate similarity scores
    const scores = [];
    for (const entity of this.entities) {
      for (const observation of entity.observations) {
        const key = `${entity.name}:${observation}`;
        const embedding = this.observationEmbeddings.get(key);
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        if (similarity >= threshold) {
          scores.push({ 
            entityName: entity.name, 
            observation: { content: observation },
            similarity 
          });
        }
      }
    }
    
    // Sort by similarity and limit results
    scores.sort((a, b) => b.similarity - a.similarity);
    return scores.slice(0, limit);
  }
  
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same dimension');
    }
  
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
  
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
  
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
  
    if (normA === 0 || normB === 0) {
      return 0;
    }
  
    return dotProduct / (normA * normB);
  }
}

// Helper functions
function logSuccess(message) {
  console.log(`✅ ${message}`);
}

function logFailure(message, error) {
  console.error(`❌ ${message}`);
  if (error) console.error(error);
}

// Main test function
async function runTests() {
  console.log('🧪 Starting semantic search tests...');
  
  try {
    const storageProvider = new MockStorageProvider();
    
    // Test 1: Search for software engineer
    try {
      console.log('\n📋 Test 1: Search for "software engineer"');
      const query = "software engineer";
      const result = await semanticSearch(storageProvider, query, 0.5);
      
      assert(result.entities.length > 0, 'Should return at least one entity');
      const johnFound = result.entities.some(e => e.name === 'John_Smith');
      assert(johnFound, 'Should find John_Smith entity');
      
      logSuccess(`Found ${result.entities.length} entities and ${result.relations.length} relations`);
      console.log(`   Entities: ${result.entities.map(e => e.name).join(', ')}`);
    } catch (error) {
      logFailure('Failed to search for software engineer', error);
      throw error;
    }
    
    // Test 2: Search for AI technology
    try {
      console.log('\n📋 Test 2: Search for "artificial intelligence company"');
      const query = "artificial intelligence company";
      const result = await semanticSearch(storageProvider, query, 0.5);
      
      assert(result.entities.length > 0, 'Should return at least one entity');
      const acmeFound = result.entities.some(e => e.name === 'Acme_Corp');
      assert(acmeFound, 'Should find Acme_Corp entity');
      
      logSuccess(`Found ${result.entities.length} entities and ${result.relations.length} relations`);
      console.log(`   Entities: ${result.entities.map(e => e.name).join(', ')}`);
    } catch (error) {
      logFailure('Failed to search for AI technology', error);
      throw error;
    }
    
    // Test 3: Search with high threshold
    try {
      console.log('\n📋 Test 3: Search with high threshold');
      const query = "unrelated query about politics";
      const result = await semanticSearch(storageProvider, query, 0.9);
      
      assert(result.entities.length === 0, 'Should return no entities with high threshold');
      assert(result.relations.length === 0, 'Should return no relations with high threshold');
      
      logSuccess('Correctly returned empty results for unrelated query with high threshold');
    } catch (error) {
      logFailure('Failed to search with high threshold', error);
      throw error;
    }
    
    console.log('\n🎉 All semantic search tests passed successfully!');
  } catch (error) {
    console.error('\n❌ Tests failed with error:', error);
    process.exit(1);
  }
}

// Run the tests
runTests();
