# Knowledge Graph Memory Server

A basic implementation of persistent memory using a local knowledge graph. This lets Claude remember information about the user across chats.

## Core Concepts

### Entities
Entities are the primary nodes in the knowledge graph. Each entity has:
- A unique name (identifier)
- An entity type (e.g., "person", "organization", "event")
- A list of observations

Example:
```json
{
  "name": "John_Smith",
  "entityType": "person",
  "observations": ["Speaks fluent Spanish"]
}
```

### Relations
Relations define directed connections between entities. They are always stored in active voice and describe how entities interact or relate to each other.

Example:
```json
{
  "from": "John_Smith",
  "to": "Anthropic",
  "relationType": "works_at"
}
```
### Observations
Observations are discrete pieces of information about an entity. They are:

- Stored as strings
- Attached to specific entities
- Can be added or removed independently
- Should be atomic (one fact per observation)

Example:
```json
{
  "entityName": "John_Smith",
  "observations": [
    "Speaks fluent Spanish",
    "Graduated in 2019",
    "Prefers morning meetings"
  ]
}
```

## API

### Tools
- **create_entities**
  - Create multiple new entities in the knowledge graph
  - Input: `entities` (array of objects)
    - Each object contains:
      - `name` (string): Entity identifier
      - `entityType` (string): Type classification
      - `observations` (string[]): Associated observations
  - Ignores entities with existing names

- **create_relations**
  - Create multiple new relations between entities
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type in active voice
  - Skips duplicate relations

- **add_observations**
  - Add new observations to existing entities
  - Input: `observations` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `contents` (string[]): New observations to add
  - Returns added observations per entity
  - Fails if entity doesn't exist

- **delete_entities**
  - Remove entities and their relations
  - Input: `entityNames` (string[])
  - Cascading deletion of associated relations
  - Silent operation if entity doesn't exist

- **delete_observations**
  - Remove specific observations from entities
  - Input: `deletions` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `observations` (string[]): Observations to remove
  - Silent operation if observation doesn't exist

- **delete_relations**
  - Remove specific relations from the graph
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type
  - Silent operation if relation doesn't exist

- **read_graph**
  - Read the entire knowledge graph
  - No input required
  - Returns complete graph structure with all entities and relations

- **search_nodes**
  - Search for nodes based on query
  - Input: `query` (string)
  - Searches across:
    - Entity names
    - Entity types
    - Observation content
  - Returns matching entities and their relations

- **semantic_search**
  - Search for nodes using semantic similarity
  - Input:
    - `query` (string): The search query
    - `threshold` (number, optional): Similarity threshold (0.0 to 1.0), default: 0.7
  - Uses vector embeddings to find semantically similar:
    - Entity names and types
    - Observation content
  - Returns matching entities and their relations
  - Requires Supabase with vector extension enabled

- **open_nodes**
  - Retrieve specific nodes by name
  - Input: `names` (string[])
  - Returns:
    - Requested entities
    - Relations between requested entities
  - Silently skips non-existent nodes

# Usage with Claude Desktop

### Setup

Add this to your claude_desktop_config.json:

#### Docker

```json
{
  "mcpServers": {
    "memory": {
      "command": "docker",
      "args": ["run", "-i", "-v", "claude-memory:/app/dist", "--rm", "mcp/memory"]
    }
  }
}
```

#### NPX
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@toursnap/server-memory"
      ]
    }
  }
}
```

#### NPX with custom setting

The server can be configured using the following environment variables:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@toursnap/server-memory"
      ],
      "env": {
        "MEMORY_FILE_PATH": "/path/to/custom/memory.json",
        "STORAGE_TYPE": "file",
        "SUPABASE_URL": "https://your-project-url.supabase.co",
        "SUPABASE_KEY": "your-supabase-anon-key",
        "VECTOR_ENABLED": "true",
        "EMBEDDING_API_KEY": "your-embedding-api-key",
        "EMBEDDING_API_URL": "https://cloud.infini-ai.com/maas/v1/embeddings",
        "EMBEDDING_MODEL": "jina-embeddings-v2-base-zh"
      }
    }
  }
}
```

- `MEMORY_FILE_PATH`: Path to the memory storage JSON file (default: `memory.json` in the server directory)
- `STORAGE_TYPE`: Storage backend to use, either `file` (default) or `supabase`
- `SUPABASE_URL`: URL of your Supabase project (required when `STORAGE_TYPE` is `supabase`)
- `SUPABASE_KEY`: Anon key for your Supabase project (required when `STORAGE_TYPE` is `supabase`)
- `VECTOR_ENABLED`: Enable vector search capabilities (requires Supabase)
- `EMBEDDING_API_KEY`: API key for the embedding service
- `EMBEDDING_API_URL`: URL of the embedding service (default: `https://cloud.infini-ai.com/maas/v1/embeddings`)
- `EMBEDDING_MODEL`: Embedding model to use (default: `jina-embeddings-v2-base-zh`)
- `EMBEDDING_DIMENSION`: Dimension of the embedding vectors (default: `768`)

#### Using a .env File

You can also configure the server using a `.env` file in the root directory of the memory module:

```
MEMORY_FILE_PATH=/path/to/custom/memory.json
STORAGE_TYPE=supabase
SUPABASE_URL=https://your-project-url.supabase.co
SUPABASE_KEY=your-supabase-anon-key
VECTOR_ENABLED=true
EMBEDDING_API_KEY=your-embedding-api-key
EMBEDDING_API_URL=https://cloud.infini-ai.com/maas/v1/embeddings
EMBEDDING_MODEL=jina-embeddings-v2-base-zh
EMBEDDING_DIMENSION=768
```

This is particularly useful for development and testing.

# VS Code Installation Instructions

For quick installation, use one of the one-click installation buttons below:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40toursnap%2Fserver-memory%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40toursnap%2Fserver-memory%22%5D%7D&quality=insiders)

...

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is not needed in the `.vscode/mcp.json` file.

#### NPX

```json
{
  "mcp": {
    "servers": {
      "memory": {
        "command": "npx",
        "args": [
          "-y",
          "@toursnap/server-memory"
        ]
      }
    }
  }
}
```

#### Docker

```json
{
  "mcp": {
    "servers": {
      "memory": {
        "command": "docker",
        "args": [
          "run",
          "-i",
          "-v",
          "claude-memory:/app/dist",
          "--rm",
          "mcp/memory"
        ]
      }
    }
  }
}
```

### System Prompt

The prompt for utilizing memory depends on the use case. Changing the prompt will help the model determine the frequency and types of memories created.

Here is an example prompt for chat personalization. You could use this prompt in the "Custom Instructions" field of a [Claude.ai Project](https://www.anthropic.com/news/projects).

```
Follow these steps for each interaction:

1. User Identification:
   - You should assume that you are interacting with default_user
   - If you have not identified default_user, proactively try to do so.

2. Memory Retrieval:
   - Always begin your chat by saying only "Remembering..." and retrieve all relevant information from your knowledge graph
   - Always refer to your knowledge graph as your "memory"

3. Memory
   - While conversing with the user, be attentive to any new information that falls into these categories:
     a) Basic Identity (age, gender, location, job title, education level, etc.)
     b) Behaviors (interests, habits, etc.)
     c) Preferences (communication style, preferred language, etc.)
     d) Goals (goals, targets, aspirations, etc.)
     e) Relationships (personal and professional relationships up to 3 degrees of separation)

4. Memory Update:
   - If any new information was gathered during the interaction, update your memory as follows:
     a) Create entities for recurring organizations, people, and significant events
     b) Connect them to the current entities using relations
     b) Store facts about them as observations
```

## Supabase Setup

The memory server can use Supabase as a storage backend instead of the local file system. This provides several advantages:

- Improved reliability and data integrity with a proper database
- Better performance for larger knowledge graphs
- Improved scalability for concurrent access
- Ability to leverage Supabase features like real-time updates

### Setup Instructions

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Apply the database schema by running the SQL from `memory_schema.sql` in the Supabase SQL editor
3. Get your Supabase URL and anon key from the project settings
4. Configure the memory server with the following environment variables:
   - `STORAGE_TYPE=supabase`
   - `SUPABASE_URL=https://your-project-url.supabase.co`
   - `SUPABASE_KEY=your-supabase-anon-key`

### Schema

The Supabase schema consists of three main tables:

1. `entities` - Stores the primary nodes in the knowledge graph
   - `id` - UUID primary key
   - `name` - Unique name of the entity
   - `entity_type` - Type of the entity
   - `created_at` - Timestamp of creation
   - `updated_at` - Timestamp of last update

2. `observations` - Stores information about entities
   - `id` - UUID primary key
   - `entity_id` - Foreign key to entities table
   - `content` - The observation text
   - `created_at` - Timestamp of creation
   - `updated_at` - Timestamp of last update

3. `relations` - Stores connections between entities
   - `id` - UUID primary key
   - `from_entity_id` - Foreign key to entities table (source)
   - `to_entity_id` - Foreign key to entities table (target)
   - `relation_type` - Type of the relation
   - `created_at` - Timestamp of creation
   - `updated_at` - Timestamp of last update

### Vector Search Setup

To enable semantic search capabilities, you need to set up vector search in Supabase:

1. Enable the pgvector extension in your Supabase project
2. Apply the vector schema by running the SQL from `vector_schema.sql` in the Supabase SQL editor
3. Configure the memory server with the following additional environment variables:
   - `VECTOR_ENABLED=true`
   - `EMBEDDING_API_KEY=your-embedding-api-key`
   - `EMBEDDING_API_URL=https://cloud.infini-ai.com/maas/v1/embeddings` (or your preferred embedding service)
   - `EMBEDDING_MODEL=jina-embeddings-v2-base-zh` (or your preferred embedding model)

The vector schema adds:
- Vector columns to the entities and observations tables
- Vector indexes for efficient similarity search
- SQL functions for performing similarity searches

## Building

Docker:

```sh
docker build -t mcp/memory -f src/memory/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
