import { SemanticWordItem, SemanticEmbedding } from '../database/VectorDatabaseManager.js';
import { EmbeddingModelClient, EmbeddingResult } from '../ai/EmbeddingModelClient.js';
import { ProfileConfig, DatabaseManager } from '../database/DatabaseManager.js';
import { ProfileManager } from '../database/ProfileManager.js';

export interface SemanticSearchOptions {
  limit?: number;
  threshold?: number;
  includeEmbeddingStats?: boolean; // performance would be slower
}

export interface SemanticSearchResponse {
  words: SemanticWordItem[];
  totalCount: number;
  queryEmbedding?: number[];
  embeddingStats?: {
    totalEmbeddings: number;
    averageEmbeddingSize: number;
  };
  searchTime: number;
}

export interface EmbeddingGenerationResult {
  success: boolean;
  processed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * High-level service for semantic search functionality
 * Coordinates between vector database, embedding generation, and search operations
 */
export class SemanticSearchService {
  private dbManager: DatabaseManager;  
  private profileManager: ProfileManager;
  private embeddingClient: EmbeddingModelClient | null = null;

  constructor(dbManager: DatabaseManager, profileManager: ProfileManager) {
    this.dbManager = dbManager;
    this.profileManager = profileManager;
    this.embeddingClient = new EmbeddingModelClient();
  }

  /**
   * Perform semantic search for a query
   */
  async search(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResponse> {
    const startTime = Date.now();

    if (!query.trim()) {
      return {
        words: [],
        totalCount: 0,
        searchTime: Date.now() - startTime
      };
    }

    try {
      // Generate embedding for the search query
      const currentProfile = await this.profileManager.getCurrentProfile();
      if (!currentProfile) {
        throw new Error('No current profile configured');
      }

      const queryEmbeddingResult = await this.generateQueryEmbedding(query, currentProfile) as EmbeddingResult;

      // Perform semantic search
      const results = this.dbManager.semanticSearch(
        queryEmbeddingResult.embedding,
        options.limit || 50,
        options.threshold || 0.5
      );

      // Get embedding statistics if requested
      let embeddingStats;
      if (options.includeEmbeddingStats) {
        embeddingStats = this.dbManager.getEmbeddingStats();
      }

      return {
        words: results,
        totalCount: results.length,
        queryEmbedding: queryEmbeddingResult.embedding,
        embeddingStats,
        searchTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('❌ Error performing semantic search:', error);
      return {
        words: [],
        totalCount: 0,
        searchTime: Date.now() - startTime
      };
    }
  }

  /**
   * Generate embedding for a search query
   */
  private async generateQueryEmbedding(query: string, profile: ProfileConfig): Promise<EmbeddingResult> {
    // For search queries, we use a simple text preparation
    const textForEmbedding = `${query}`;

    const result = await this.embeddingClient!.generateEmbedding(textForEmbedding, profile);

    // Since we passed a single string, we should always get back an EmbeddingResult
    if ('embedding' in result) {
      return result;
    } else {
      throw new Error('Unexpected batch result for query embedding');
    }
  }
}
