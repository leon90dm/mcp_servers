#!/usr/bin/env node

// Test script for the memory module API with Supabase integration
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
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
  console.error('Example: SUPABASE_URL=https://your-project.supabase.co SUPABASE_KEY=your-anon-key node test-memory-api.js');
  process.exit(1);
}

// Set environment variables for the memory module
process.env.STORAGE_TYPE = 'supabase';

// Mock the MCP server request/response structure
class MockServer {
  constructor() {
    this.tools = {};
  }

  async callTool(name, args) {
    if (!this.tools[name]) {
      throw new Error(`Tool not found: ${name}`);
    }

    const response = await this.tools[name](args);
    return JSON.parse(response.content[0].text);
  }

  registerTool(name, handler) {
    this.tools[name] = handler;
  }
}

// Test data
const testEntities = [
  {
    name: 'Jane_Smith',
    entityType: 'person',
    observations: ['Enjoys painting', 'Works as a data scientist', 'Lives in New York']
  },
  {
    name: 'DataCorp',
    entityType: 'organization',
    observations: ['Founded in 2015', 'Based in New York', 'Specializes in data analytics']
  },
  {
    name: 'Project_Beta',
    entityType: 'project',
    observations: ['Started in 2024', 'Focuses on data visualization', 'Has 3 team members']
  }
];

const testRelations = [
  {
    from: 'Jane_Smith',
    to: 'DataCorp',
    relationType: 'works_at'
  },
  {
    from: 'Jane_Smith',
    to: 'Project_Beta',
    relationType: 'contributes_to'
  },
  {
    from: 'DataCorp',
    to: 'Project_Beta',
    relationType: 'funds'
  }
];

// Helper function to clear test data
async function clearTestData() {
  console.log('Clearing test data...');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// Main test function
async function runTest() {
  try {
    console.log('Starting memory module API test with Supabase...');

    // Clear any existing test data
    await clearTestData();

    // Import the memory module
    const memoryModulePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.js');
    console.log('Loading memory module from:', memoryModulePath);
    const memoryModule = await import(memoryModulePath);

    // Create a mock server
    const mockServer = new MockServer();

    // Register the memory module tools
    const toolHandlers = {};

    // Extract the tool handlers from the memory module
    memoryModule.server.setRequestHandler({ type: 'call_tool' }, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
      }

      // Store the handler for later use
      toolHandlers[name] = request;

      // Return a dummy response
      return { content: [{ type: 'text', text: 'Registered' }] };
    });

    // Test creating entities
    console.log('Testing create_entities...');
    const createEntitiesResult = await mockServer.callTool('create_entities', { entities: testEntities });
    console.log(`Created ${createEntitiesResult.length} entities`);

    // Test creating relations
    console.log('Testing create_relations...');
    const createRelationsResult = await mockServer.callTool('create_relations', { relations: testRelations });
    console.log(`Created ${createRelationsResult.length} relations`);

    // Test reading the graph
    console.log('Testing read_graph...');
    const readGraphResult = await mockServer.callTool('read_graph', {});
    console.log(`Read graph with ${readGraphResult.entities.length} entities and ${readGraphResult.relations.length} relations`);

    // Test searching nodes
    console.log('Testing search_nodes...');
    const searchNodesResult = await mockServer.callTool('search_nodes', { query: 'data' });
    console.log(`Search found ${searchNodesResult.entities.length} entities and ${searchNodesResult.relations.length} relations`);

    // Test opening specific nodes
    console.log('Testing open_nodes...');
    const openNodesResult = await mockServer.callTool('open_nodes', { names: ['Jane_Smith', 'DataCorp'] });
    console.log(`Opened ${openNodesResult.entities.length} entities and ${openNodesResult.relations.length} relations`);

    // Test adding observations
    console.log('Testing add_observations...');
    const addObservationsResult = await mockServer.callTool('add_observations', {
      observations: [
        {
          entityName: 'Jane_Smith',
          contents: ['Speaks French fluently', 'Graduated from MIT']
        }
      ]
    });
    console.log(`Added observations to ${addObservationsResult.length} entities`);

    // Test deleting observations
    console.log('Testing delete_observations...');
    await mockServer.callTool('delete_observations', {
      deletions: [
        {
          entityName: 'Jane_Smith',
          observations: ['Speaks French fluently']
        }
      ]
    });
    console.log('Deleted observations');

    // Test deleting relations
    console.log('Testing delete_relations...');
    await mockServer.callTool('delete_relations', {
      relations: [
        {
          from: 'Jane_Smith',
          to: 'Project_Beta',
          relationType: 'contributes_to'
        }
      ]
    });
    console.log('Deleted relations');

    // Test deleting entities
    console.log('Testing delete_entities...');
    await mockServer.callTool('delete_entities', {
      entityNames: ['Project_Beta']
    });
    console.log('Deleted entities');

    // Final verification
    const finalGraphResult = await mockServer.callTool('read_graph', {});
    console.log(`Final graph has ${finalGraphResult.entities.length} entities and ${finalGraphResult.relations.length} relations`);

    console.log('Test completed successfully!');

  } catch (error) {
    console.error('Unexpected error during test:', error);
    process.exit(1);
  } finally {
    // Clean up
    await clearTestData();
  }
}

// Run the test
runTest();
