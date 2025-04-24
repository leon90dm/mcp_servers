#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file if it exists
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(__dirname, 'memory.json');

// If MEMORY_FILE_PATH is just a filename, put it in the same directory as the script
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
  ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
    ? process.env.MEMORY_FILE_PATH
    : path.join(__dirname, process.env.MEMORY_FILE_PATH)
  : defaultMemoryPath;

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'file'; // 'file' or 'supabase'

// We are storing our memory using entities, relations, and observations in a graph structure
interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// Storage interface for different storage implementations
interface StorageProvider {
  loadGraph(): Promise<KnowledgeGraph>;
  saveGraph(graph: KnowledgeGraph): Promise<void>;
}

// File-based storage implementation
class FileStorageProvider implements StorageProvider {
  constructor(private filePath: string) {}

  async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      const lines = data.split("\n").filter((line: string) => line.trim() !== "");
      return lines.reduce((graph: KnowledgeGraph, line: string) => {
        const item = JSON.parse(line);
        if (item.type === "entity") graph.entities.push(item as Entity);
        if (item.type === "relation") graph.relations.push(item as Relation);
        return graph;
      }, { entities: [], relations: [] });
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map(e => JSON.stringify({ type: "entity", ...e })),
      ...graph.relations.map(r => JSON.stringify({ type: "relation", ...r })),
    ];
    await fs.writeFile(this.filePath, lines.join("\n"));
  }
}

// Supabase storage implementation
class SupabaseStorageProvider implements StorageProvider {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase URL and key are required for Supabase storage");
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async loadGraph(): Promise<KnowledgeGraph> {
    try {
      // Load entities
      const { data: entities, error: entitiesError } = await this.supabase
        .from('entities')
        .select('id, name, entity_type');

      if (entitiesError) throw entitiesError;

      // Load observations
      const { data: observations, error: observationsError } = await this.supabase
        .from('observations')
        .select('entity_id, content');

      if (observationsError) throw observationsError;

      // Load relations
      const { data: relations, error: relationsError } = await this.supabase
        .from('relations')
        .select('from_entity_id, to_entity_id, relation_type');

      if (relationsError) throw relationsError;

      // Map entities with their observations
      const entitiesMap = new Map<string, Entity>();
      const idToNameMap = new Map<string, string>();

      // Process entities and create the map
      entities.forEach((entity: any) => {
        entitiesMap.set(entity.id, {
          name: entity.name,
          entityType: entity.entity_type,
          observations: []
        });
        idToNameMap.set(entity.id, entity.name);
      });

      // Add observations to entities
      observations.forEach((observation: any) => {
        const entity = entitiesMap.get(observation.entity_id);
        if (entity) {
          entity.observations.push(observation.content);
        }
      });

      // Convert entities map to array
      const entitiesArray = Array.from(entitiesMap.values());

      // Process relations
      const relationsArray = relations.map((relation: any) => ({
        from: idToNameMap.get(relation.from_entity_id) || '',
        to: idToNameMap.get(relation.to_entity_id) || '',
        relationType: relation.relation_type
      })).filter((r: {from: string, to: string}) => r.from && r.to); // Filter out relations with missing entities

      return {
        entities: entitiesArray,
        relations: relationsArray
      };
    } catch (error) {
      console.error("Error loading graph from Supabase:", error);
      return { entities: [], relations: [] };
    }
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    // This is a simplified implementation that assumes the graph is the source of truth
    // In a real implementation, you would need to handle updates, deletions, etc.
    try {
      // First, get existing entities to map names to IDs
      const { data: existingEntities, error: entitiesError } = await this.supabase
        .from('entities')
        .select('id, name');

      if (entitiesError) throw entitiesError;

      // Create a map of entity names to IDs
      const nameToIdMap = new Map<string, string>();
      existingEntities.forEach((entity: any) => {
        nameToIdMap.set(entity.name, entity.id);
      });

      // Process entities
      for (const entity of graph.entities) {
        let entityId = nameToIdMap.get(entity.name);

        if (!entityId) {
          // Entity doesn't exist, create it
          const { data, error } = await this.supabase
            .from('entities')
            .insert({
              name: entity.name,
              entity_type: entity.entityType
            })
            .select('id')
            .single();

          if (error) throw error;
          entityId = data.id;
          nameToIdMap.set(entity.name, entityId as string);
        } else {
          // Entity exists, update it
          const { error } = await this.supabase
            .from('entities')
            .update({ entity_type: entity.entityType })
            .eq('id', entityId);

          if (error) throw error;
        }

        // Get existing observations for this entity
        const { data: existingObservations, error: obsError } = await this.supabase
          .from('observations')
          .select('content')
          .eq('entity_id', entityId);

        if (obsError) throw obsError;

        // Find new observations to add
        const existingObsSet = new Set(existingObservations.map((o: any) => o.content));
        const newObservations = entity.observations.filter(obs => !existingObsSet.has(obs));

        // Add new observations
        if (newObservations.length > 0) {
          const obsToInsert = newObservations.map(content => ({
            entity_id: entityId,
            content
          }));

          const { error } = await this.supabase
            .from('observations')
            .insert(obsToInsert);

          if (error) throw error;
        }
      }

      // Process relations
      for (const relation of graph.relations) {
        const fromEntityId = nameToIdMap.get(relation.from);
        const toEntityId = nameToIdMap.get(relation.to);

        if (fromEntityId && toEntityId) {
          // Check if relation already exists
          const { data: existingRelation, error: checkError } = await this.supabase
            .from('relations')
            .select('id')
            .eq('from_entity_id', fromEntityId)
            .eq('to_entity_id', toEntityId)
            .eq('relation_type', relation.relationType);

          if (checkError) throw checkError;

          if (existingRelation.length === 0) {
            // Relation doesn't exist, create it
            const { error } = await this.supabase
              .from('relations')
              .insert({
                from_entity_id: fromEntityId,
                to_entity_id: toEntityId,
                relation_type: relation.relationType
              });

            if (error) throw error;
          }
        }
      }
    } catch (error) {
      console.error("Error saving graph to Supabase:", error);
      throw error;
    }
  }
}

// Factory function to create the appropriate storage provider
function createStorageProvider(): StorageProvider {
  if (STORAGE_TYPE === 'supabase') {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.warn("Supabase URL or key not provided, falling back to file storage");
      return new FileStorageProvider(MEMORY_FILE_PATH);
    }
    try {
      return new SupabaseStorageProvider(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
      console.error("Error creating Supabase storage provider:", error);
      console.warn("Falling back to file storage");
      return new FileStorageProvider(MEMORY_FILE_PATH);
    }
  }
  return new FileStorageProvider(MEMORY_FILE_PATH);
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager {
  private storageProvider: StorageProvider;

  constructor() {
    this.storageProvider = createStorageProvider();
  }

  private async loadGraph(): Promise<KnowledgeGraph> {
    return this.storageProvider.loadGraph();
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    return this.storageProvider.saveGraph(graph);
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations = relations.filter(r => !graph.relations.some(existingRelation =>
      existingRelation.from === r.from &&
      existingRelation.to === r.to &&
      existingRelation.relationType === r.relationType
    ));
    graph.relations.push(...newRelations);
    await this.saveGraph(graph);
    return newRelations;
  }

  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(content => !entity.observations.includes(content));
      entity.observations.push(...newObservations);
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(o => !d.observations.includes(o));
      }
    });
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.relations = graph.relations.filter(r => !relations.some(delRelation =>
      r.from === delRelation.from &&
      r.to === delRelation.to &&
      r.relationType === delRelation.relationType
    ));
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  // Very basic search function
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();

    // Filter entities
    const filteredEntities = graph.entities.filter(e =>
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      e.observations.some(o => o.toLowerCase().includes(query.toLowerCase()))
    );

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));

    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r =>
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );

    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };

    return filteredGraph;
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();

    // Filter entities
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));

    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r =>
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );

    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };

    return filteredGraph;
  }
}

const knowledgeGraphManager = new KnowledgeGraphManager();


// The server instance and tools exposed to Claude
const server = new Server({
  name: "memory-server",
  version: "0.6.3",
},    {
    capabilities: {
      tools: {},
    },
  },);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_entities",
        description: "Create multiple new entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "The name of the entity" },
                  entityType: { type: "string", description: "The type of the entity" },
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "An array of observation contents associated with the entity"
                  },
                },
                required: ["name", "entityType", "observations"],
              },
            },
          },
          required: ["entities"],
        },
      },
      {
        name: "create_relations",
        description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
              },
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "add_observations",
        description: "Add new observations to existing entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            observations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity to add the observations to" },
                  contents: {
                    type: "array",
                    items: { type: "string" },
                    description: "An array of observation contents to add"
                  },
                },
                required: ["entityName", "contents"],
              },
            },
          },
          required: ["observations"],
        },
      },
      {
        name: "delete_entities",
        description: "Delete multiple entities and their associated relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entityNames: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to delete"
            },
          },
          required: ["entityNames"],
        },
      },
      {
        name: "delete_observations",
        description: "Delete specific observations from entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            deletions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity containing the observations" },
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "An array of observations to delete"
                  },
                },
                required: ["entityName", "observations"],
              },
            },
          },
          required: ["deletions"],
        },
      },
      {
        name: "delete_relations",
        description: "Delete multiple relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
              },
              description: "An array of relations to delete"
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "read_graph",
        description: "Read the entire knowledge graph",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph based on a query",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query to match against entity names, types, and observation content" },
          },
          required: ["query"],
        },
      },
      {
        name: "open_nodes",
        description: "Open specific nodes in the knowledge graph by their names",
        inputSchema: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to retrieve",
            },
          },
          required: ["names"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "create_entities":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createEntities(args.entities as Entity[]), null, 2) }] };
    case "create_relations":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createRelations(args.relations as Relation[]), null, 2) }] };
    case "add_observations":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.addObservations(args.observations as { entityName: string; contents: string[] }[]), null, 2) }] };
    case "delete_entities":
      await knowledgeGraphManager.deleteEntities(args.entityNames as string[]);
      return { content: [{ type: "text", text: "Entities deleted successfully" }] };
    case "delete_observations":
      await knowledgeGraphManager.deleteObservations(args.deletions as { entityName: string; observations: string[] }[]);
      return { content: [{ type: "text", text: "Observations deleted successfully" }] };
    case "delete_relations":
      await knowledgeGraphManager.deleteRelations(args.relations as Relation[]);
      return { content: [{ type: "text", text: "Relations deleted successfully" }] };
    case "read_graph":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2) }] };
    case "search_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchNodes(args.query as string), null, 2) }] };
    case "open_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.openNodes(args.names as string[]), null, 2) }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Knowledge Graph MCP Server running on stdio (Storage: ${STORAGE_TYPE})`);

  if (STORAGE_TYPE === 'supabase') {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error("Warning: Supabase storage selected but URL or key not provided. Falling back to file storage.");
    } else {
      console.error(`Connected to Supabase project at ${SUPABASE_URL}`);
    }
  } else {
    console.error(`Using file storage at ${MEMORY_FILE_PATH}`);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
