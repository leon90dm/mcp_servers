import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { Entity } from './types.js';

// Configuration
function getConfig() {
  return {
    EMBEDDING_API_URL: process.env.EMBEDDING_API_URL || 'https://cloud.infini-ai.com/maas/v1/embeddings',
    EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'jina-embeddings-v2-base-zh',
    EMBEDDING_DIMENSION: parseInt(process.env.EMBEDDING_DIMENSION || '768', 10) // Default dimension for jina-embeddings-v2-base-zh
  };
}

// Cache for embeddings to reduce API calls
const embeddingCache = new Map<string, number[]>();

/**
 * Generate embeddings for a single text string
 * @param text The text to generate an embedding for
 * @returns A vector embedding as an array of numbers
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = getConfig();

  // Check cache first
  const cacheKey = `${config.EMBEDDING_MODEL}:${text}`;
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  if (!config.EMBEDDING_API_KEY) {
    throw new Error('EMBEDDING_API_KEY environment variable is not set');
  }

  try {
    const response = await fetch(config.EMBEDDING_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.EMBEDDING_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.EMBEDDING_MODEL,
        input: [text]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json() as any;

    // Extract the embedding from the response
    // Adjust this based on the actual response structure from your API
    const embedding = result.data[0].embedding;

    // Cache the result
    embeddingCache.set(cacheKey, embedding);

    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * @param texts Array of texts to generate embeddings for
 * @returns Array of vector embeddings
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const config = getConfig();

  if (!config.EMBEDDING_API_KEY) {
    throw new Error('EMBEDDING_API_KEY environment variable is not set');
  }

  // Filter out texts that are already in cache
  const uncachedTexts: string[] = [];
  const uncachedIndices: number[] = [];
  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  // Check cache first for each text
  texts.forEach((text, index) => {
    const cacheKey = `${config.EMBEDDING_MODEL}:${text}`;
    if (embeddingCache.has(cacheKey)) {
      results[index] = embeddingCache.get(cacheKey)!;
    } else {
      uncachedTexts.push(text);
      uncachedIndices.push(index);
    }
  });

  // If all texts were in cache, return early
  if (uncachedTexts.length === 0) {
    return results as number[][];
  }

  try {
    // Process in batches of 20 to avoid API limits
    const batchSize = 20;
    for (let i = 0; i < uncachedTexts.length; i += batchSize) {
      const batchTexts = uncachedTexts.slice(i, i + batchSize);
      const batchIndices = uncachedIndices.slice(i, i + batchSize);

      const response = await fetch(config.EMBEDDING_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.EMBEDDING_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.EMBEDDING_MODEL,
          input: batchTexts
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const result = await response.json() as any;

      // Extract embeddings from the response
      const embeddings = result.data.map((item: any) => item.embedding);

      // Update results and cache
      embeddings.forEach((embedding: number[], idx: number) => {
        const originalIndex = batchIndices[idx];
        const originalText = uncachedTexts[idx];
        const cacheKey = `${config.EMBEDDING_MODEL}:${originalText}`;

        results[originalIndex] = embedding;
        embeddingCache.set(cacheKey, embedding);
      });
    }

    return results as number[][];
  } catch (error) {
    console.error('Error generating embeddings batch:', error);
    throw error;
  }
}

/**
 * Generate an embedding for an entity by combining its name and type
 * @param entity The entity to generate an embedding for
 * @returns A vector embedding
 */
export async function generateEntityEmbedding(entity: Entity): Promise<number[]> {
  // Combine entity name and type for a more comprehensive embedding
  const text = `${entity.name} ${entity.entityType}`;
  return generateEmbedding(text);
}

/**
 * Calculate cosine similarity between two vectors
 * @param vecA First vector
 * @param vecB Second vector
 * @returns Similarity score between 0 and 1
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
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

/**
 * Clear the embedding cache
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/**
 * Get the size of the embedding cache
 * @returns Number of cached embeddings
 */
export function getEmbeddingCacheSize(): number {
  return embeddingCache.size;
}
