// Basic entity interface
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  embedding?: number[]; // Optional embedding vector
}

// Extended entity interface with embedding
export interface EntityWithEmbedding extends Entity {
  embedding: number[]; // Required embedding vector
}

// Basic observation interface
export interface Observation {
  content: string;
  embedding?: number[]; // Optional embedding vector
}

// Extended observation interface with embedding
export interface ObservationWithEmbedding extends Observation {
  embedding: number[]; // Required embedding vector
}

// Relation interface
export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

// Knowledge graph interface
export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// Storage provider interface
export interface StorageProvider {
  loadGraph(): Promise<KnowledgeGraph>;
  saveGraph(graph: KnowledgeGraph): Promise<void>;
  
  // New methods for semantic search
  storeEntityEmbedding?(entityName: string, embedding: number[]): Promise<void>;
  storeObservationEmbedding?(entityName: string, observationContent: string, embedding: number[]): Promise<void>;
  semanticSearchEntities?(queryEmbedding: number[], threshold: number, limit: number): Promise<Entity[]>;
  semanticSearchObservations?(queryEmbedding: number[], threshold: number, limit: number): Promise<{entityName: string, observation: Observation}[]>;
}

// Search result interface
export interface SearchResult {
  entity: Entity;
  score: number;
}

// Semantic search options
export interface SemanticSearchOptions {
  threshold: number;
  limit: number;
}
