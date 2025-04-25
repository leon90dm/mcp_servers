import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Entity, KnowledgeGraph, Observation, Relation, StorageProvider } from './types.js';
import { generateEmbedding, generateEntityEmbedding } from './embedding-service.js';

/**
 * Supabase storage provider with vector embedding support
 */
export class SupabaseVectorProvider implements StorageProvider {
  private supabase: SupabaseClient;
  private initialized: boolean = false;

  /**
   * Create a new Supabase vector storage provider
   * @param supabaseUrl Supabase project URL
   * @param supabaseKey Supabase API key
   */
  constructor(private supabaseUrl: string, private supabaseKey: string) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase URL and key are required for Supabase storage");
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Initialize the provider by checking if vector extension is enabled
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if vector extension is enabled
      const { data, error } = await this.supabase.rpc('has_vector_extension');
      
      if (error) {
        // If the function doesn't exist, create it
        await this.supabase.rpc('create_vector_extension_check');
        const { data: retryData, error: retryError } = await this.supabase.rpc('has_vector_extension');
        
        if (retryError || !retryData) {
          console.warn("Vector extension not available. Semantic search will not work.");
        }
      }
      
      this.initialized = true;
    } catch (error) {
      console.warn("Failed to check vector extension:", error);
      this.initialized = true; // Set to true anyway to avoid repeated checks
    }
  }

  /**
   * Load the entire knowledge graph from Supabase
   */
  async loadGraph(): Promise<KnowledgeGraph> {
    await this.initialize();
    
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

      // Create a map of entity IDs to names
      const idToNameMap = new Map<string, string>();
      const entitiesMap = new Map<string, Entity>();

      // Process entities and build the maps
      for (const entity of entities) {
        idToNameMap.set(entity.id, entity.name);
        entitiesMap.set(entity.name, {
          name: entity.name,
          entityType: entity.entity_type,
          observations: []
        });
      }

      // Process observations and add them to the corresponding entities
      for (const observation of observations) {
        const entityName = idToNameMap.get(observation.entity_id);
        if (entityName && entitiesMap.has(entityName)) {
          entitiesMap.get(entityName)!.observations.push(observation.content);
        }
      }

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

  /**
   * Save the entire knowledge graph to Supabase
   * @param graph The knowledge graph to save
   */
  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    await this.initialize();
    
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

      // Process each entity
      for (const entity of graph.entities) {
        let entityId: string;

        // Check if entity already exists
        if (nameToIdMap.has(entity.name)) {
          entityId = nameToIdMap.get(entity.name)!;

          // Update entity type if needed
          const { error } = await this.supabase
            .from('entities')
            .update({ entity_type: entity.entityType })
            .eq('id', entityId);

          if (error) throw error;
        } else {
          // Create new entity
          const { data, error } = await this.supabase
            .from('entities')
            .insert({ name: entity.name, entity_type: entity.entityType })
            .select('id')
            .single();

          if (error) throw error;
          entityId = data.id;
          nameToIdMap.set(entity.name, entityId);

          // Generate and store embedding for new entity
          await this.storeEntityEmbedding(entity.name, await generateEntityEmbedding(entity));
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
        for (const content of newObservations) {
          const { error } = await this.supabase
            .from('observations')
            .insert({ entity_id: entityId, content });

          if (error) throw error;

          // Generate and store embedding for new observation
          await this.storeObservationEmbedding(entity.name, content, await generateEmbedding(content));
        }
      }

      // Process relations
      for (const relation of graph.relations) {
        const fromId = nameToIdMap.get(relation.from);
        const toId = nameToIdMap.get(relation.to);

        if (!fromId || !toId) {
          console.warn(`Skipping relation ${relation.from} -> ${relation.to}: entity not found`);
          continue;
        }

        // Check if relation already exists
        const { data: existingRelation, error: checkError } = await this.supabase
          .from('relations')
          .select('id')
          .eq('from_entity_id', fromId)
          .eq('to_entity_id', toId)
          .eq('relation_type', relation.relationType)
          .maybeSingle();

        if (checkError) throw checkError;

        // If relation doesn't exist, create it
        if (!existingRelation) {
          const { error } = await this.supabase
            .from('relations')
            .insert({
              from_entity_id: fromId,
              to_entity_id: toId,
              relation_type: relation.relationType
            });

          if (error) throw error;
        }
      }
    } catch (error) {
      console.error("Error saving graph to Supabase:", error);
      throw error;
    }
  }

  /**
   * Store an embedding for an entity
   * @param entityName Name of the entity
   * @param embedding Vector embedding
   */
  async storeEntityEmbedding(entityName: string, embedding: number[]): Promise<void> {
    await this.initialize();
    
    try {
      const { data: entity, error: findError } = await this.supabase
        .from('entities')
        .select('id')
        .eq('name', entityName)
        .single();

      if (findError) throw findError;

      const { error: updateError } = await this.supabase
        .from('entities')
        .update({ embedding })
        .eq('id', entity.id);

      if (updateError) throw updateError;
    } catch (error) {
      console.error(`Error storing embedding for entity ${entityName}:`, error);
      throw error;
    }
  }

  /**
   * Store an embedding for an observation
   * @param entityName Name of the entity the observation belongs to
   * @param observationContent Content of the observation
   * @param embedding Vector embedding
   */
  async storeObservationEmbedding(entityName: string, observationContent: string, embedding: number[]): Promise<void> {
    await this.initialize();
    
    try {
      // Get entity ID
      const { data: entity, error: findEntityError } = await this.supabase
        .from('entities')
        .select('id')
        .eq('name', entityName)
        .single();

      if (findEntityError) throw findEntityError;

      // Find the observation
      const { data: observation, error: findObsError } = await this.supabase
        .from('observations')
        .select('id')
        .eq('entity_id', entity.id)
        .eq('content', observationContent)
        .single();

      if (findObsError) throw findObsError;

      // Update the embedding
      const { error: updateError } = await this.supabase
        .from('observations')
        .update({ embedding })
        .eq('id', observation.id);

      if (updateError) throw updateError;
    } catch (error) {
      console.error(`Error storing embedding for observation "${observationContent}" of entity ${entityName}:`, error);
      throw error;
    }
  }

  /**
   * Perform semantic search on entities
   * @param queryEmbedding Query embedding vector
   * @param threshold Similarity threshold (0-1)
   * @param limit Maximum number of results
   * @returns Array of matching entities
   */
  async semanticSearchEntities(queryEmbedding: number[], threshold: number = 0.7, limit: number = 10): Promise<Entity[]> {
    await this.initialize();
    
    try {
      // Call the match_entities function
      const { data, error } = await this.supabase.rpc('match_entities', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit
      });

      if (error) throw error;

      // Get observations for each entity
      const entities: Entity[] = [];
      for (const match of data) {
        const { data: observations, error: obsError } = await this.supabase
          .from('observations')
          .select('content')
          .eq('entity_id', match.id);

        if (obsError) throw obsError;

        entities.push({
          name: match.name,
          entityType: match.entity_type,
          observations: observations.map((o: any) => o.content)
        });
      }

      return entities;
    } catch (error) {
      console.error("Error performing semantic search on entities:", error);
      return [];
    }
  }

  /**
   * Perform semantic search on observations
   * @param queryEmbedding Query embedding vector
   * @param threshold Similarity threshold (0-1)
   * @param limit Maximum number of results
   * @returns Array of matching observations with their entity names
   */
  async semanticSearchObservations(
    queryEmbedding: number[], 
    threshold: number = 0.7, 
    limit: number = 20
  ): Promise<{entityName: string, observation: Observation}[]> {
    await this.initialize();
    
    try {
      // Call the match_observations function
      const { data, error } = await this.supabase.rpc('match_observations', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit
      });

      if (error) throw error;

      // Get entity names for each observation
      const results: {entityName: string, observation: Observation}[] = [];
      for (const match of data) {
        const { data: entity, error: entityError } = await this.supabase
          .from('entities')
          .select('name')
          .eq('id', match.entity_id)
          .single();

        if (entityError) throw entityError;

        results.push({
          entityName: entity.name,
          observation: {
            content: match.content,
            embedding: queryEmbedding // We don't need to return the actual embedding
          }
        });
      }

      return results;
    } catch (error) {
      console.error("Error performing semantic search on observations:", error);
      return [];
    }
  }
}
