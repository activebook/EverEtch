import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { ProfileConfig } from '../database/DatabaseManager.js';
import { WordDocument } from '../database/DatabaseManager.js';

export interface EmbeddingResult {
  embedding: number[];
  model_used: string;
  tokens_used: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  model_used: string;
  tokens_used: number;
}

/**
 * Client for generating text embeddings using various AI models
 */
export class EmbeddingModelClient {

  /**
   * Generate embedding for text using the configured provider (OpenAI or Google)
   * Supports both single text and batch processing
   */
  async generateEmbedding(text: string | string[], profile: ProfileConfig): Promise<EmbeddingResult | BatchEmbeddingResult> {
    if (!profile.embedding_config?.api_key) {
      throw new Error('API key not configured for this profile');
    }

    const provider = profile.embedding_config.provider?.toLowerCase() || 'openai';

    if (provider === 'google') {
      return this.generateGoogleEmbedding(text, profile);
    } else {
      return this.generateOpenAIEmbedding(text, profile);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  private async generateBatchEmbeddings(texts: string[], profile: ProfileConfig): Promise<BatchEmbeddingResult> {
    if (!profile.embedding_config?.api_key) {
      throw new Error('API key not configured for this profile');
    }

    const provider = profile.embedding_config.provider?.toLowerCase() || 'openai';

    if (provider === 'google') {
      return this.generateGoogleBatchEmbedding(texts, profile);
    } else {
      return this.generateOpenAIBatchEmbedding(texts, profile);
    }
  }

  /**
   * Generate embedding using OpenAI
   */
  private async generateOpenAIEmbedding(text: string | string[], profile: ProfileConfig): Promise<EmbeddingResult | BatchEmbeddingResult> {
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: profile.embedding_config!.api_key,
      baseURL: profile.embedding_config!.endpoint,
    });

    try {
      const response = await openai.embeddings.create({
        model: profile.embedding_config!.model,
        input: text,
        encoding_format: 'float',
        dimensions: 2048,
      });

      const tokens_used = response.usage?.total_tokens || 0;

      // Handle both single and batch inputs
      if (Array.isArray(text)) {
        const embeddings = response.data.map(item => item.embedding);
        // Normalize embeddings for accurate cosine similarity
        const normalizedEmbeddings = embeddings.map(emb => EmbeddingModelClient.normalizeEmbeddingOptimized(emb));
        return {
          embeddings: normalizedEmbeddings,
          model_used: profile.embedding_config!.model,
          tokens_used
        };
      } else {
        const embedding = response.data[0].embedding;
        // Normalize embedding for accurate cosine similarity
        const normalizedEmbedding = EmbeddingModelClient.normalizeEmbeddingOptimized(embedding);
        return {
          embedding: normalizedEmbedding,
          model_used: profile.embedding_config!.model,
          tokens_used
        };
      }

    } catch (error) {
      console.error('❌ Error generating OpenAI embedding:', error);
      throw new Error(`Failed to generate OpenAI embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate batch embeddings using OpenAI
   */
  private async generateOpenAIBatchEmbedding(texts: string[], profile: ProfileConfig): Promise<BatchEmbeddingResult> {
    return this.generateOpenAIEmbedding(texts, profile) as Promise<BatchEmbeddingResult>;
  }

  /**
   * Generate embedding using Google GenAI
   */
  private async generateGoogleEmbedding(text: string | string[], profile: ProfileConfig): Promise<EmbeddingResult | BatchEmbeddingResult> {
    // Initialize Google AI client
    const googleAI = new GoogleGenAI({
      apiKey: profile.embedding_config!.api_key,
    });

    try {
      const config = {
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: 2048,
      };

      // Handle both single text and array of texts
      const contents = Array.isArray(text) ? text : [text];
      const response = await googleAI.models.embedContent({
        model: profile.embedding_config!.model,
        contents: contents,
        config: config
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error('No embeddings returned from Google API');
      }

      const tokens_used = response.embeddings.reduce((total, embedding) =>
        total + (embedding.statistics?.tokenCount || 0), 0
      );

      // Handle both single and batch inputs
      if (Array.isArray(text)) {
        const embeddings = response.embeddings.map(item => item.values!);
        // Normalize embeddings for accurate cosine similarity
        const normalizedEmbeddings = embeddings.map(emb => EmbeddingModelClient.normalizeEmbeddingOptimized(emb));
        return {
          embeddings: normalizedEmbeddings,
          model_used: profile.embedding_config!.model,
          tokens_used
        };
      } else {
        const embedding = response.embeddings[0].values;
        if (!embedding) {
          throw new Error('Embedding values are undefined');
        }
        // Normalize embedding for accurate cosine similarity
        const normalizedEmbedding = EmbeddingModelClient.normalizeEmbeddingOptimized(embedding);
        return {
          embedding: normalizedEmbedding,
          model_used: profile.embedding_config!.model,
          tokens_used
        };
      }

    } catch (error) {
      console.error('❌ Error generating Google embedding:', error);
      throw new Error(`Failed to generate Google embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate batch embeddings using Google GenAI
   */
  private async generateGoogleBatchEmbedding(texts: string[], profile: ProfileConfig): Promise<BatchEmbeddingResult> {
    return this.generateGoogleEmbedding(texts, profile) as Promise<BatchEmbeddingResult>;
  }

  /**
   * Generate embedding for word meaning/details
   * This method prepares the text content for embedding by combining
   * the word's meaning and details into a single text block
   */
  async generateWordEmbedding(
    wordDoc: WordDocument,
    profile: ProfileConfig
  ): Promise<EmbeddingResult> {
    // Prepare text for embedding - combine word, description, and details
    const textForEmbedding = this.prepareTextForEmbedding(wordDoc);

    const result = await this.generateEmbedding(textForEmbedding, profile);

    // Since we passed a single string, we should always get back an EmbeddingResult
    if ('embedding' in result) {
      return result;
    } else {
      throw new Error('Unexpected batch result for single word embedding');
    }
  }

  /**
   * Generate embeddings for multiple words in efficient batches
   * This method processes WordDocuments in smaller batches to optimize API usage
   */
  async generateBatchWordEmbeddings(
    wordDocs: WordDocument[],
    profile: ProfileConfig
  ): Promise<BatchEmbeddingResult> {
    if (!profile.embedding_config?.api_key) {
      throw new Error('API key not configured for this profile');
    }

    const allEmbeddings: number[][] = [];
    let totalTokensUsed = 0;

    // Prepare texts for this batch
    const textsForBatch = wordDocs.map(wordDoc => this.prepareTextForEmbedding(wordDoc));

    // Generate embeddings for this batch
    const batchResult = await this.generateBatchEmbeddings(textsForBatch, profile);

    // Add embeddings to our collection
    allEmbeddings.push(...batchResult.embeddings);
    totalTokensUsed += batchResult.tokens_used;

    return {
      embeddings: allEmbeddings,
      model_used: profile.embedding_config.model,
      tokens_used: totalTokensUsed
    };
  }

  /**
   * Prepare text content for embedding generation
   * Combines word information into a coherent text block
   */
  private prepareTextForEmbedding(wordDoc: WordDocument): string {
    // Clean and prepare the text for embedding
    const cleanDetails = wordDoc.details
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();

    // Create a comprehensive text representation
    let textParts = [];

    // Add the word itself
    textParts.push(`Word: ${wordDoc.word}`);

    // Add the one-line description if available
    if (wordDoc.one_line_desc.trim()) {
      textParts.push(`Definition: ${wordDoc.one_line_desc}`);
    }

    // Add the detailed explanation if available
    if (cleanDetails && cleanDetails.length > 0) {
      textParts.push(`Explanation: ${cleanDetails}`);
    }

    if (wordDoc.synonyms && wordDoc.synonyms.length > 0) {
      textParts.push(`Synonyms: ${wordDoc.synonyms.join(', ')}`);
    }

    return textParts.join('\n ');
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate Euclidean distance between two embeddings
   */
  static euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  /**
   * Normalize an embedding vector to unit length
   */
  static normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

    if (magnitude === 0) {
      return embedding;
    }

    return embedding.map(val => val / magnitude);
  }

  /**
   * Normalize an embedding vector to unit length (Optimized version)
   * More efficient for 2048-dimensional vectors with manual loops
   */
  static normalizeEmbeddingOptimized(embedding: number[]): number[] {
    // Use more efficient magnitude calculation
    let sumOfSquares = 0;
    for (let i = 0; i < embedding.length; i++) {
      sumOfSquares += embedding[i] * embedding[i];
    }

    const magnitude = Math.sqrt(sumOfSquares);

    if (magnitude === 0) {
      return embedding;
    }

    // Pre-create result array for better performance
    const normalized: number[] = new Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
      normalized[i] = embedding[i] / magnitude;
    }

    return normalized;
  }

  /**
   * Get embedding dimensions for different models
   */
  static getEmbeddingDimensions(modelName: string): number {
    const dimensions: Record<string, number> = {
      // OpenAI models
      'text-embedding-ada-002': 1536,
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      // Google models
      'gemini-embedding-001': 768,
    };

    return dimensions[modelName] || 768; // Default to Google dimensions
  }
}
