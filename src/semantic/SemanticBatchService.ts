import { DatabaseManager, ProfileConfig, WordDocument } from '../database/DatabaseManager.js';
import { VectorDatabaseManager, SemanticEmbedding } from '../database/VectorDatabaseManager.js';
import { ProfileManager } from '../database/ProfileManager.js';
import { EmbeddingModelClient, EmbeddingResult } from '../ai/EmbeddingModelClient.js';

export interface BatchProcessingOptions {
  batchSize?: number;
  onProgress?: (processed: number, total: number, currentBatch: number, totalBatches: number) => void;
  onComplete?: (results: BatchProcessingResult) => void;
  signal?: AbortSignal;
}

export interface BatchProcessingResult {
  success: boolean;
  totalWords: number;
  processed: number;
  failed: number;
  error: string;
  duration: number;
}

/**
 * Service for batch processing word embeddings with progress tracking and cancellation
 */
export class SemanticBatchService {
  private dbManager: DatabaseManager;
  private profileManager: ProfileManager;
  private vectorManager: VectorDatabaseManager | null = null;
  private embeddingClient: EmbeddingModelClient | null = null;
  private isProcessing: boolean = false;
  private abortController: AbortController | null = null;

  constructor(dbManager: DatabaseManager, profileManager: ProfileManager) {
    this.dbManager = dbManager;
    this.profileManager = profileManager;
  }

  /**
   * Check if batch processing is currently running
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Cancel ongoing batch processing
   */
  cancelProcessing(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isProcessing = false;
  }

  /**
   * Initialize services
   * We must initialize services before starting batch processing
   * but after constructor, because in constructor
   * the db manager is not initialized yet,
   * so the vector database must wait to be initialized
   */
  private initialize(): void {
    if (!this.vectorManager) {
      this.vectorManager = this.dbManager.getVectorDatabase()!;
    }
    if (!this.embeddingClient) {
      this.embeddingClient = new EmbeddingModelClient();
    }
  }

  /**
   * Process a batch of words for embedding generation
   */
  private async processBatch(
    words: WordDocument[],
    profile: ProfileConfig,
    options: BatchProcessingOptions
  ): Promise<{ processed: number; failed: number; error: string }> {
    const result = { processed: 0, failed: 0, error: "" };

    // Check if we have embedding config
    if (!profile.embedding_config) {
      throw new Error('Embedding configuration not found in profile');
    }

    let proceedWords = []
    // Process words in parallel within the batch
    for (const wordData of words) {
      // Check if processing should be cancelled
      if (options.signal?.aborted) {
        throw new Error('Processing cancelled');
      }

      // Check if word needs processing
      const existingEmbedding = await this.vectorManager!.getEmbedding(
        { word_id: wordData.id, embedding: [], model_used: profile.embedding_config!.model });
      if (existingEmbedding) {
        result.processed++;
        continue; // Skip this word
      }

      // Wait for generating embedding
      proceedWords.push(wordData);
    }
    if (proceedWords.length === 0) {
      return result;
    }

    try {
      const batchResult = await this.embeddingClient!.generateBatchWordEmbeddings(proceedWords, profile);
      if (!batchResult.embeddings) {
        throw new Error('Embedding generation failed');
      }

      let batchSE = [] as SemanticEmbedding[];
      await proceedWords.forEach(async (wordData, index) => {
        const embedding = batchResult.embeddings[index];
        batchSE.push({ word_id: wordData.id, embedding, model_used: batchResult.model_used });
      });
      await this.vectorManager!.batchStoreEmbeddings(batchSE);
      result.processed += proceedWords.length;
    } catch (error) {
      result.failed += proceedWords.length;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.error = errorMessage;
    }

    return result;
  }

  /**
   * Start batch processing of all words for semantic search
   */
  async startBatchProcessing(
    options: BatchProcessingOptions = {}
  ): Promise<BatchProcessingResult> {
    if (this.isProcessing) {
      throw new Error('Batch processing already in progress');
    }

    // Initialize services
    this.initialize();

    this.isProcessing = true;
    this.abortController = new AbortController();
    const startTime = Date.now();

    try {
      // Merge options with defaults
      const finalOptions: BatchProcessingOptions = {
        batchSize: 10,
        ...options,
        signal: this.abortController.signal
      };

      // Get current profile config
      const currentProfile = await this.profileManager.getCurrentProfile();
      if (!currentProfile) {
        throw new Error('No profile configured');
      }

      // Check words count
      const totalWords = await this.dbManager.getWordsCount();

      if (totalWords === 0) {
        return {
          success: true,
          totalWords: 0,
          processed: 0,
          failed: 0,
          error: "",
          duration: Date.now() - startTime
        };
      }

      let totalProcessed = 0;
      let totalFailed = 0;
      let error = "";

      // Process words in batches
      const batchSize = finalOptions.batchSize || 10;
      const totalBatches = Math.ceil(totalWords / batchSize);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        // Check if processing should be cancelled
        if (finalOptions.signal?.aborted) {
          throw new Error('Processing cancelled by user');
        }

        const startIndex = batchIndex * batchSize;
        const batch = await this.dbManager.getWordDocumentsPaginated(startIndex, batchSize);

        // Process this batch
        const batchResult = await this.processBatch(batch.words, currentProfile, finalOptions);

        totalProcessed += batchResult.processed;
        totalFailed += batchResult.failed;
        error = batchResult.error;

        if (totalFailed > 0) {
          // Stop at first failure
          break;
        }

        // Report progress
        if (finalOptions.onProgress) {
          finalOptions.onProgress(totalProcessed, totalWords, batchIndex + 1, totalBatches);
        }
      }

      const success = totalFailed === 0;
      const duration = Date.now() - startTime;

      const result: BatchProcessingResult = {
        success,
        totalWords,
        processed: totalProcessed,
        failed: totalFailed,
        error: error,
        duration
      };

      // Call completion callback
      if (finalOptions.onComplete) {
        finalOptions.onComplete(result);
      }

      return result;

    } catch (error) {
      console.error('❌ Batch processing failed:', error);
      throw error;
    } finally {
      this.isProcessing = false;
      this.abortController = null;
    }
  }

  /**
   * Insert or update word embedding in vector database
   * @param word 
   * @param profile 
   * @returns 
   */
  async storeWordEmbedding(
    word: WordDocument,
    profile: ProfileConfig,
  ): Promise<void> {

    // Check if we have embedding config
    if (!profile.embedding_config) {
      throw new Error('Embedding configuration not found in profile');
    }

    // Initialize services
    this.initialize();

    // Generate embedding
    const embeddingResult = await this.embeddingClient!.generateWordEmbedding(word, profile);
    if (!embeddingResult.embedding) {
      throw new Error('Embedding generation failed');
    }

    // Insert or update embedding
    await this.vectorManager!.storeEmbedding({
      word_id: word.id,
      embedding: embeddingResult.embedding,
      model_used: profile.embedding_config.model
    });

  }
}
