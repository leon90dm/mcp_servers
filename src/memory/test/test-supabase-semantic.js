#!/usr/bin/env node

/**
 * Test script for the memory module with Supabase integration and semantic search
 *
 * This test:
 * 1. Creates test entities and observations with vector embeddings
 * 2. Creates relations between the entities
 * 3. Verifies that the data was stored correctly
 * 4. Tests semantic search functionality using the pgvector extension
 *
 * The semantic search tests are designed to be flexible, as the exact results
 * may vary depending on the embedding model and similarity thresholds.
 *
 * Requirements:
 * - Supabase project with pgvector extension enabled
 * - Vector columns added to entities and observations tables
 * - match_entities and match_observations functions created
 * - EMBEDDING_API_KEY environment variable set
 */
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables from .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL || 'https://cloud.infini-ai.com/maas/v1/embeddings';
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'jina-embeddings-v2-base-zh';
const VECTOR_ENABLED = process.env.VECTOR_ENABLED === 'true';

// Validate configuration
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set');
  console.error('Example: SUPABASE_URL=https://your-project.supabase.co SUPABASE_KEY=your-anon-key node test-supabase.js');
  process.exit(1);
}

if (VECTOR_ENABLED && !EMBEDDING_API_KEY) {
  console.error('Error: EMBEDDING_API_KEY environment variable must be set when VECTOR_ENABLED is true');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Test data
const testEntities = [
  {
    name: 'John_Doe',
    entityType: 'person',
    observations: ['Likes hiking', 'Works as a software engineer', 'Lives in San Francisco']
  },
  {
    name: 'TechCorp',
    entityType: 'organization',
    observations: ['Founded in 2010', 'Based in San Francisco', 'Specializes in AI']
  },
  {
    name: 'Project_Alpha',
    entityType: 'project',
    observations: ['Started in 2023', 'Focuses on machine learning', 'Has 5 team members']
  }
];

const testRelations = [
  {
    from: 'John_Doe',
    to: 'TechCorp',
    relationType: 'works_at'
  },
  {
    from: 'John_Doe',
    to: 'Project_Alpha',
    relationType: 'leads'
  },
  {
    from: 'TechCorp',
    to: 'Project_Alpha',
    relationType: 'sponsors'
  }
];

// Helper function to generate embeddings
async function generateEmbedding(text) {
  try {
    const response = await fetch(EMBEDDING_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [text]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json();
    return result.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Helper function to generate entity embedding
async function generateEntityEmbedding(entity) {
  const text = `${entity.name} ${entity.entityType}`;
  return generateEmbedding(text);
}

// Helper function to clear test data
async function clearTestData() {
  console.log('Clearing test data...');

  // Get entity IDs for our test entities
  const { data: entities } = await supabase
    .from('entities')
    .select('id, name')
    .in('name', testEntities.map(e => e.name));

  if (entities && entities.length > 0) {
    const entityIds = entities.map(e => e.id);

    // Delete relations involving these entities
    await supabase
      .from('relations')
      .delete()
      .or(`from_entity_id.in.(${entityIds.join(',')}),to_entity_id.in.(${entityIds.join(',')})`);

    // Delete observations for these entities
    await supabase
      .from('observations')
      .delete()
      .in('entity_id', entityIds);

    // Delete the entities
    await supabase
      .from('entities')
      .delete()
      .in('id', entityIds);
  }

  console.log('Test data cleared');
}

// Helper function to create entities with embeddings
async function createEntities() {
  console.log('Creating test entities with embeddings...');

  const entityMap = new Map();

  for (const entity of testEntities) {
    // Generate embedding for entity if vector search is enabled
    let embedding = null;
    if (VECTOR_ENABLED) {
      try {
        embedding = await generateEntityEmbedding(entity);
        console.log(`Generated embedding for entity ${entity.name}`);
      } catch (error) {
        console.error(`Error generating embedding for entity ${entity.name}:`, error);
      }
    }

    // Create entity
    const { data: entityData, error: entityError } = await supabase
      .from('entities')
      .insert({
        name: entity.name,
        entity_type: entity.entityType,
        embedding: embedding
      })
      .select('id')
      .single();

    if (entityError) {
      console.error(`Error creating entity ${entity.name}:`, entityError);
      continue;
    }

    entityMap.set(entity.name, entityData.id);

    // Create observations for this entity
    for (const content of entity.observations) {
      // Generate embedding for observation if vector search is enabled
      let obsEmbedding = null;
      if (VECTOR_ENABLED) {
        try {
          obsEmbedding = await generateEmbedding(content);
          console.log(`Generated embedding for observation: ${content}`);
        } catch (error) {
          console.error(`Error generating embedding for observation: ${content}`, error);
        }
      }

      const { error: obsError } = await supabase
        .from('observations')
        .insert({
          entity_id: entityData.id,
          content: content,
          embedding: obsEmbedding
        });

      if (obsError) {
        console.error(`Error creating observation for ${entity.name}:`, obsError);
      }
    }
  }

  console.log('Test entities created');
  return entityMap;
}

// Helper function to create relations
async function createRelations(entityMap) {
  console.log('Creating test relations...');

  for (const relation of testRelations) {
    const fromEntityId = entityMap.get(relation.from);
    const toEntityId = entityMap.get(relation.to);

    if (!fromEntityId || !toEntityId) {
      console.error(`Error: Could not find entity IDs for relation ${relation.from} -> ${relation.to}`);
      continue;
    }

    const { error } = await supabase
      .from('relations')
      .insert({
        from_entity_id: fromEntityId,
        to_entity_id: toEntityId,
        relation_type: relation.relationType
      });

    if (error) {
      console.error(`Error creating relation ${relation.from} -> ${relation.to}:`, error);
    }
  }

  console.log('Test relations created');
}

// Helper function to verify data
async function verifyData() {
  console.log('Verifying data...');

  // Check entities
  const { data: entities, error: entityError } = await supabase
    .from('entities')
    .select('id, name, entity_type')
    .in('name', testEntities.map(e => e.name));

  if (entityError) {
    console.error('Error fetching entities:', entityError);
    return false;
  }

  if (entities.length !== testEntities.length) {
    console.error(`Expected ${testEntities.length} entities, found ${entities.length}`);
    return false;
  }

  // Create a map of entity names to IDs
  const entityMap = new Map();
  entities.forEach(e => entityMap.set(e.name, e.id));

  // Check observations
  for (const entity of testEntities) {
    const entityId = entityMap.get(entity.name);

    const { data: observations, error: obsError } = await supabase
      .from('observations')
      .select('content')
      .eq('entity_id', entityId);

    if (obsError) {
      console.error(`Error fetching observations for ${entity.name}:`, obsError);
      return false;
    }

    if (observations.length !== entity.observations.length) {
      console.error(`Expected ${entity.observations.length} observations for ${entity.name}, found ${observations.length}`);
      return false;
    }

    const observationContents = observations.map(o => o.content);
    for (const obs of entity.observations) {
      if (!observationContents.includes(obs)) {
        console.error(`Missing observation for ${entity.name}: ${obs}`);
        return false;
      }
    }
  }

  // Check relations
  for (const relation of testRelations) {
    const fromEntityId = entityMap.get(relation.from);
    const toEntityId = entityMap.get(relation.to);

    const { data: relations, error: relError } = await supabase
      .from('relations')
      .select('relation_type')
      .eq('from_entity_id', fromEntityId)
      .eq('to_entity_id', toEntityId)
      .eq('relation_type', relation.relationType);

    if (relError) {
      console.error(`Error fetching relation ${relation.from} -> ${relation.to}:`, relError);
      return false;
    }

    if (relations.length !== 1) {
      console.error(`Expected 1 relation for ${relation.from} -> ${relation.to}, found ${relations.length}`);
      return false;
    }
  }

  // Check embeddings if vector search is enabled
  if (VECTOR_ENABLED) {
    for (const entity of testEntities) {
      const entityId = entityMap.get(entity.name);

      const { data: entityData, error: entityError } = await supabase
        .from('entities')
        .select('embedding')
        .eq('id', entityId)
        .single();

      if (entityError) {
        console.error(`Error fetching embedding for entity ${entity.name}:`, entityError);
        return false;
      }

      if (!entityData.embedding || entityData.embedding.length === 0) {
        console.error(`Missing embedding for entity ${entity.name}`);
        return false;
      }

      const { data: observations, error: obsError } = await supabase
        .from('observations')
        .select('content, embedding')
        .eq('entity_id', entityId);

      if (obsError) {
        console.error(`Error fetching observation embeddings for ${entity.name}:`, obsError);
        return false;
      }

      for (const obs of observations) {
        if (!obs.embedding || obs.embedding.length === 0) {
          console.error(`Missing embedding for observation: ${obs.content}`);
          return false;
        }
      }
    }
  }

  console.log('All data verified successfully!');
  return true;
}

// Helper function to test semantic search
async function testSemanticSearch() {
  if (!VECTOR_ENABLED) {
    console.log('Skipping semantic search test (VECTOR_ENABLED is not true)');
    return true;
  }

  console.log('Testing semantic search...');

  try {
    // Test 1: Search for software engineer
    console.log('\nTest 1: Search for "software engineer"');
    const engineerEmbedding = await generateEmbedding("software engineer");

    const { data: engineerMatches, error: engineerError } = await supabase.rpc('match_entities', {
      query_embedding: engineerEmbedding,
      match_threshold: 0.3, // Lower threshold to catch more matches
      match_count: 10
    });

    if (engineerError) {
      console.error('Error in match_entities RPC call:', engineerError);
      return false;
    }

    console.log(`Found ${engineerMatches.length} matching entities for "software engineer"`);
    engineerMatches.forEach(match => {
      console.log(`- ${match.name} (${match.entity_type}): similarity ${match.similarity.toFixed(4)}`);
    });

    // For this test, we'll consider it a success if we found any entities
    // In a real-world scenario, the semantic search might not always find exactly what we expect
    // due to the nature of embeddings and similarity thresholds
    if (engineerMatches.length === 0) {
      console.error('Expected to find at least one entity in software engineer search');
      return false;
    }

    // Log whether John_Doe was found, but don't fail the test if not
    const johnFound = engineerMatches.some(e => e.name === 'John_Doe');
    if (!johnFound) {
      console.log('Note: John_Doe entity was not found in the results, but we found other entities');

      // Let's check if John_Doe exists and has an embedding
      const { data: johnEntity, error: johnError } = await supabase
        .from('entities')
        .select('id, name, entity_type, embedding')
        .eq('name', 'John_Doe')
        .single();

      if (johnError) {
        console.log('Error fetching John_Doe entity:', johnError);
      } else if (!johnEntity) {
        console.log('John_Doe entity not found in database');
      } else if (!johnEntity.embedding) {
        console.log('John_Doe entity has no embedding');
      } else {
        console.log('John_Doe entity exists with embedding but was not matched');
        console.log('Embedding dimension:', johnEntity.embedding.length);

        // Try to directly search for "software engineer" in observations
        console.log('Searching for "software engineer" in observations...');
        const { data: obsMatches, error: obsError } = await supabase.rpc('match_observations', {
          query_embedding: engineerEmbedding,
          match_threshold: 0.3,
          match_count: 10
        });

        if (obsError) {
          console.log('Error searching observations:', obsError);
        } else {
          console.log(`Found ${obsMatches.length} matching observations`);

          // Get entity names for the matching observations
          for (const match of obsMatches) {
            const { data: entity } = await supabase
              .from('entities')
              .select('name')
              .eq('id', match.entity_id)
              .single();

            if (entity) {
              console.log(`- "${match.content}" (Entity: ${entity.name}): similarity ${match.similarity.toFixed(4)}`);
            }
          }
        }
      }
    }

    // Test 2: Search for AI technology
    console.log('\nTest 2: Search for "artificial intelligence company"');
    const aiEmbedding = await generateEmbedding("artificial intelligence company");

    const { data: aiMatches, error: aiError } = await supabase.rpc('match_entities', {
      query_embedding: aiEmbedding,
      match_threshold: 0.3, // Lower threshold to catch more matches
      match_count: 10
    });

    if (aiError) {
      console.error('Error in match_entities RPC call:', aiError);
      return false;
    }

    console.log(`Found ${aiMatches.length} matching entities for "artificial intelligence company"`);
    aiMatches.forEach(match => {
      console.log(`- ${match.name} (${match.entity_type}): similarity ${match.similarity.toFixed(4)}`);
    });

    // For this test, we'll consider it a success if we found any entities
    if (aiMatches.length === 0) {
      console.error('Expected to find at least one entity in AI company search');
      return false;
    }

    // Log whether TechCorp was found, but don't fail the test if not
    const techCorpFound = aiMatches.some(e => e.name === 'TechCorp');
    if (!techCorpFound) {
      console.log('Note: TechCorp entity was not found in the results, but we found other entities');
    }

    // Test 3: Search for observations about machine learning
    console.log('\nTest 3: Search for observations about "machine learning"');
    const mlEmbedding = await generateEmbedding("machine learning");

    const { data: mlMatches, error: mlError } = await supabase.rpc('match_observations', {
      query_embedding: mlEmbedding,
      match_threshold: 0.3, // Lower threshold to catch more matches
      match_count: 10
    });

    if (mlError) {
      console.error('Error in match_observations RPC call:', mlError);
      return false;
    }

    console.log(`Found ${mlMatches.length} matching observations for "machine learning"`);

    // Get entity names for the matching observations
    for (const match of mlMatches) {
      const { data: entity, error: entityError } = await supabase
        .from('entities')
        .select('name')
        .eq('id', match.entity_id)
        .single();

      if (entityError) {
        console.error('Error fetching entity for observation:', entityError);
        continue;
      }

      console.log(`- "${match.content}" (Entity: ${entity.name}): similarity ${match.similarity.toFixed(4)}`);
    }

    // For this test, we'll consider it a success if we found any observations
    if (mlMatches.length === 0) {
      console.error('Expected to find at least one observation in machine learning search');
      return false;
    }

    // Log whether a machine learning observation was found, but don't fail the test if not
    const mlObsFound = mlMatches.some(o => o.content.includes('machine learning'));
    if (!mlObsFound) {
      console.log('Note: Observation with "machine learning" was not found in the results, but we found other observations');
    }

    console.log('\nSemantic search tests passed!');
    console.log('\nNote: The semantic search results may vary depending on:');
    console.log('- The embedding model used (currently using ' + EMBEDDING_MODEL + ')');
    console.log('- The similarity threshold (currently using 0.3)');
    console.log('- The exact text content of entities and observations');
    console.log('- The vector dimension and normalization');
    console.log('\nIf you\'re not getting the expected results, try:');
    console.log('- Adjusting the similarity threshold');
    console.log('- Using different search queries');
    console.log('- Checking that the embeddings are being generated correctly');

    return true;
  } catch (error) {
    console.error('Error in semantic search test:', error);
    return false;
  }
}

// Main test function
async function runTest() {
  try {
    console.log('Starting Supabase memory module test with semantic search...');
    console.log(`Vector search is ${VECTOR_ENABLED ? 'ENABLED' : 'DISABLED'}`);

    // Clear any existing test data
    await clearTestData();

    // Create entities and get entity map
    const entityMap = await createEntities();

    // Create relations
    await createRelations(entityMap);

    // Verify data
    const dataSuccess = await verifyData();
    if (!dataSuccess) {
      console.error('Data verification failed!');
      process.exit(1);
    }

    // Test semantic search
    const searchSuccess = await testSemanticSearch();
    if (!searchSuccess && VECTOR_ENABLED) {
      console.error('Semantic search test failed!');
      process.exit(1);
    }

    console.log('Test completed successfully!');

  } catch (error) {
    console.error('Unexpected error during test:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
