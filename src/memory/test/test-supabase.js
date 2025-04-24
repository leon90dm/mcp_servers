#!/usr/bin/env node

// Test script for the memory module with Supabase integration
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables from .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Validate configuration
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set');
  console.error('Example: SUPABASE_URL=https://your-project.supabase.co SUPABASE_KEY=your-anon-key node test-supabase.js');
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

// Helper function to create entities
async function createEntities() {
  console.log('Creating test entities...');

  const entityMap = new Map();

  for (const entity of testEntities) {
    // Create entity
    const { data: entityData, error: entityError } = await supabase
      .from('entities')
      .insert({
        name: entity.name,
        entity_type: entity.entityType
      })
      .select('id')
      .single();

    if (entityError) {
      console.error(`Error creating entity ${entity.name}:`, entityError);
      continue;
    }

    entityMap.set(entity.name, entityData.id);

    // Create observations for this entity
    const observations = entity.observations.map(content => ({
      entity_id: entityData.id,
      content
    }));

    const { error: obsError } = await supabase
      .from('observations')
      .insert(observations);

    if (obsError) {
      console.error(`Error creating observations for ${entity.name}:`, obsError);
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

  console.log('All data verified successfully!');
  return true;
}

// Main test function
async function runTest() {
  try {
    console.log('Starting Supabase memory module test...');

    // Clear any existing test data
    await clearTestData();

    // Create entities and get entity map
    const entityMap = await createEntities();

    // Create relations
    await createRelations(entityMap);

    // Verify data
    const success = await verifyData();

    if (success) {
      console.log('Test completed successfully!');
    } else {
      console.error('Test failed!');
      process.exit(1);
    }

  } catch (error) {
    console.error('Unexpected error during test:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
