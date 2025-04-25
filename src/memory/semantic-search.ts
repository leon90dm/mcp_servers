import { Entity, KnowledgeGraph, StorageProvider } from './types.js';
import { generateEmbedding } from './embedding-service.js';

/**
 * Perform semantic search on the knowledge graph
 * @param storageProvider The storage provider to use
 * @param query The search query
 * @param threshold Similarity threshold (0-1)
 * @param limit Maximum number of results
 * @returns A knowledge graph containing matching entities and their relations
 */
export async function semanticSearch(
  storageProvider: StorageProvider,
  query: string,
  threshold: number = 0.7,
  limit: number = 10
): Promise<KnowledgeGraph> {
  // Check if the storage provider supports semantic search
  if (!storageProvider.semanticSearchEntities || !storageProvider.semanticSearchObservations) {
    throw new Error("Storage provider does not support semantic search");
  }

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Search for entities
    const matchingEntities = await storageProvider.semanticSearchEntities(
      queryEmbedding,
      threshold,
      limit
    );

    // Search for observations
    const matchingObservations = await storageProvider.semanticSearchObservations(
      queryEmbedding,
      threshold,
      limit * 2 // Get more observations than entities
    );

    // Get entities from matching observations that aren't already in matchingEntities
    const entityNames = new Set(matchingEntities.map(e => e.name));
    const additionalEntityNames = new Set<string>();

    for (const { entityName } of matchingObservations) {
      if (!entityNames.has(entityName)) {
        additionalEntityNames.add(entityName);
      }
    }

    // Load the full graph to get relations
    const fullGraph = await storageProvider.loadGraph();

    // Get additional entities
    const additionalEntities = fullGraph.entities.filter(e => 
      additionalEntityNames.has(e.name)
    );

    // Combine all matching entities
    const allMatchingEntities = [...matchingEntities, ...additionalEntities];
    const allEntityNames = new Set(allMatchingEntities.map(e => e.name));

    // Filter relations to only include those between matching entities
    const matchingRelations = fullGraph.relations.filter(r => 
      allEntityNames.has(r.from) && allEntityNames.has(r.to)
    );

    return {
      entities: allMatchingEntities,
      relations: matchingRelations
    };
  } catch (error) {
    console.error("Error performing semantic search:", error);
    return { entities: [], relations: [] };
  }
}
