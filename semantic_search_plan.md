# Semantic Search Implementation Plan for Memory Module

## Overview

The current memory module uses basic string matching for search, which can fail when there are slight differences between search queries and stored entity names or observations. We'll enhance this by implementing semantic search using vector embeddings, leveraging Supabase's vector store capabilities.

## Goals

1. Add semantic search capabilities to the memory module
2. Maintain compatibility with the existing knowledge graph structure
3. Use Supabase's vector store for efficient similarity searches
4. Provide a configurable similarity threshold for search results

## Technical Approach

### 1. Architecture Changes

We'll extend the current architecture to include:

- Vector embeddings for entities and observations
- Integration with Supabase for vector storage and search
- New API methods for semantic search

### 2. Data Model Extensions

```typescript
// Extended Entity interface with embedding
interface EntityWithEmbedding extends Entity {
  embedding?: number[]; // Vector embedding of entity name + type
}

// Extended Observation interface
interface ObservationWithEmbedding {
  content: string;
  embedding?: number[]; // Vector embedding of observation content
}

// Updated Entity interface
interface Entity {
  name: string;
  entityType: string;
  observations: string[] | ObservationWithEmbedding[]; // Support both formats for backward compatibility
  embedding?: number[]; // Vector embedding of entity name + type
}
```

### 3. Implementation Steps

#### Phase 1: Setup and Dependencies

1. Add necessary dependencies:
   - OpenAI's embedding API or another embedding service
   - Supabase JS client
   - Vector manipulation utilities

2. Configure Supabase:
   - Create tables with vector columns for entities and observations
   - Set up pgvector extension in Supabase

#### Phase 2: Core Implementation

3. Implement embedding generation:
   - Create a service to generate embeddings for entity names, types, and observations
   - Implement batch processing for efficient embedding generation

4. Implement storage layer:
   - Extend the current storage to save embeddings alongside entities and observations
   - Create migration utilities to add embeddings to existing data

5. Implement semantic search:
   - Create a `semanticSearch` function that:
     - Generates an embedding for the search query
     - Performs similarity search in Supabase
     - Returns results above the specified threshold
     - Formats results as a KnowledgeGraph object

#### Phase 3: API and Integration

6. Extend the MCP server API:
   - Add a new `semantic_search` tool
   - Define input schema with query and threshold parameters
   - Implement handler for the new tool

7. Update existing operations:
   - Modify entity and observation creation to generate and store embeddings
   - Update deletion operations to handle embeddings

#### Phase 4: Testing and Optimization

8. Create test suite:
   - Unit tests for embedding generation
   - Integration tests for Supabase vector operations
   - End-to-end tests for semantic search functionality

9. Optimize performance:
   - Implement caching for frequently accessed embeddings
   - Add batch processing for bulk operations
   - Configure vector index parameters for optimal search performance

## Implementation Details

### Supabase Setup

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create entities table with vector support
CREATE TABLE entities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  embedding VECTOR(1536) -- Assuming OpenAI's embedding dimension
);

-- Create observations table with vector support
CREATE TABLE observations (
  id SERIAL PRIMARY KEY,
  entity_id INTEGER REFERENCES entities(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536)
);

-- Create vector indexes
CREATE INDEX ON entities USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON observations USING ivfflat (embedding vector_cosine_ops);
```

### Embedding Generation

```typescript
async function generateEmbedding(text: string): Promise<number[]> {
  // Use OpenAI's embedding API or another service
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: text
    })
  });

  const result = await response.json();
  return result.data[0].embedding;
}
```

### Semantic Search Implementation

```typescript
async function semanticSearch(query: string, threshold: number = 0.7): Promise<KnowledgeGraph> {
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);
  
  // Search entities by similarity
  const { data: matchingEntities } = await supabase
    .rpc('match_entities', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: 10
    });
  
  // Search observations by similarity
  const { data: matchingObservations } = await supabase
    .rpc('match_observations', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: 20
    });
  
  // Get entity IDs from matching observations
  const entityIdsFromObservations = [...new Set(matchingObservations.map(o => o.entity_id))];
  
  // Get additional entities from matching observations
  const { data: additionalEntities } = await supabase
    .from('entities')
    .select('*')
    .in('id', entityIdsFromObservations)
    .not('id', 'in', matchingEntities.map(e => e.id));
  
  // Combine all matching entities
  const allMatchingEntities = [...matchingEntities, ...additionalEntities];
  
  // Get all observations for matching entities
  const { data: allObservations } = await supabase
    .from('observations')
    .select('*')
    .in('entity_id', allMatchingEntities.map(e => e.id));
  
  // Get relations between matching entities
  const { data: matchingRelations } = await supabase
    .from('relations')
    .select('*')
    .in('from_entity_id', allMatchingEntities.map(e => e.id))
    .in('to_entity_id', allMatchingEntities.map(e => e.id));
  
  // Format results as KnowledgeGraph
  return formatAsKnowledgeGraph(allMatchingEntities, allObservations, matchingRelations);
}
```

### API Extension

```typescript
// Add to the tools list
{
  name: "semantic_search",
  description: "Search for nodes in the knowledge graph using semantic similarity",
  inputSchema: {
    type: "object",
    properties: {
      query: { 
        type: "string", 
        description: "The search query to find semantically similar entities and observations" 
      },
      threshold: { 
        type: "number", 
        description: "Similarity threshold (0.0 to 1.0) for including results", 
        default: 0.7 
      }
    },
    required: ["query"]
  }
}

// Add to the request handler
case "semantic_search":
  return { 
    content: [{ 
      type: "text", 
      text: JSON.stringify(
        await knowledgeGraphManager.semanticSearch(
          args.query as string, 
          args.threshold as number
        ), 
        null, 
        2
      ) 
    }] 
  };
```

## Migration Strategy

1. Create new Supabase tables without disrupting existing functionality
2. Add a background process to generate embeddings for existing entities and observations
3. Implement dual-storage approach during transition (file-based + Supabase)
4. Add feature flag to enable/disable semantic search during testing

## Potential Challenges

1. **API Rate Limits**: Embedding generation may be subject to rate limits
2. **Storage Costs**: Vector embeddings increase storage requirements
3. **Performance**: Vector similarity search may be computationally intensive
4. **Consistency**: Keeping embeddings in sync with text content

## Next Steps After Implementation

1. Implement caching for frequently accessed embeddings
2. Add periodic re-embedding to capture updated language models
3. Extend with multi-modal embeddings (text + images)
4. Implement hybrid search combining keyword and semantic approaches

## Timeline Estimate

- Phase 1 (Setup): 1-2 days
- Phase 2 (Core Implementation): 3-4 days
- Phase 3 (API and Integration): 2-3 days
- Phase 4 (Testing and Optimization): 2-3 days

Total: 8-12 days for full implementation
