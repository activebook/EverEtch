import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { Utils } from '../utils/Utils.js';
import { WordListItem } from "../database/DatabaseManager.js";

export interface WordEmbedding {
  word_id: string;
  embedding: number[];
  model_used: string;
  created_at: string;
  updated_at: string;
}

export interface SemanticEmbedding {
  word_id: string;
  embedding: number[];
  model_used: string;
}

export interface SemanticWordItem {
  word_item: WordListItem,
  similarity: number;
}

export class VectorDatabaseManager {
  private db: Database.Database | null = null;

  constructor(db?: Database.Database) {
    if (db) {
      this.db = db;
    }
  }

  initialize(dbPath: string, existingDb?: Database.Database): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // If we already have a database connection, use it
        if (existingDb) {
          this.db = existingDb;
          this.loadVectorExtension();
          this.createVectorTables();
          resolve();
          return;
        }

        // Otherwise create a new connection
        Utils.ensureDataDirectory();

        // Open database with sqlite-vec support
        this.db = new Database(dbPath);

        // Load the sqlite-vec extension
        this.loadVectorExtension();
        this.createVectorTables();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Load the sqlite-vec extension into the database
   */
  private loadVectorExtension(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Load the sqlite-vec extension using the sqlite-vec package
      sqliteVec.load(this.db);
      console.log('✅ sqlite-vec extension loaded successfully');
    } catch (error) {
      console.error('❌ Error loading sqlite-vec extension:', error);
      throw error;
    }
  }

  private createVectorTables(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Create vector table using vec0 virtual table type
      // This provides efficient similarity search using the match operator
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS word_embeddings USING vec0(
          word_id TEXT,
          embedding float[3072], -- Default embedding dimension, will be adjusted based on model
          model_used TEXT,
          created_at DATETIME,
          updated_at DATETIME,
          distance_metric=cosine   -- set metric
        );
      `);

      // Create index for efficient model-based filtering
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_embedding_model
        ON word_embeddings(model_used, word_id);
      `);

      console.log('✅ Vector database tables created successfully');
    } catch (error) {
      console.error('❌ Error creating vector tables:', error);
      throw error;
    }
  }

  /**
   * Store or update word embedding
   */
  storeEmbedding(se: SemanticEmbedding): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Store embedding in vector table
      // Convert embedding array to JSON string for storage
      this.db.prepare(`
        INSERT OR REPLACE INTO word_embeddings (word_id, embedding, model_used)
        VALUES (?, ?, ?)
      `).run(se.word_id, JSON.stringify(se.embedding), se.model_used);

      console.debug(`✅ Embedding stored for word ${se.word_id} using model ${se.model_used}`);
    } catch (error) {
      console.error('❌ Error storing embedding:', error);
      throw error;
    }
  }

  /**
   * Batch store multiple word embeddings efficiently
   */
  batchStoreEmbeddings(embeddings: Array<SemanticEmbedding>): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    if (embeddings.length === 0) {
      return; // Nothing to do
    }

    try {
      // Use a transaction for better performance and atomicity
      const transaction = this.db.transaction((embeddings: SemanticEmbedding[]) => {
        const embeddingStmt = this.db!.prepare(`
          INSERT OR REPLACE INTO word_embeddings (word_id, embedding, model_used)
          VALUES (?, ?, ?)
        `);

        for (const { word_id, embedding, model_used } of embeddings) {
          embeddingStmt.run(word_id, JSON.stringify(embedding), model_used);
          console.debug(`✅ Embedding stored for word ${word_id}`);
        }
      });

      transaction(embeddings);
      console.log(`✅ Successfully stored ${embeddings.length} embeddings in batch`);
    } catch (error) {
      console.error('❌ Error batch storing embeddings:', error);
      throw error;
    }
  }

  /**
   * Get embedding for a word by model
   */
  getEmbedding(se: SemanticEmbedding): number[] | null {
    if (!this.db) {
      return null;
    }

    try {
      const row = this.db.prepare(`
        SELECT embedding FROM word_embeddings WHERE word_id = ? AND model_used = ?
      `).get(se.word_id, se.model_used) as any;

      return row ? JSON.parse(row.embedding) : null;
    } catch (error) {
      console.error('❌ Error getting embedding:', error);
      return null;
    }
  }

  /**
   * Delete embedding for a word
   * PS. we actually don't need to call it,
   * because foreign key would automatically delete no-use ones
   */
  deleteEmbedding(wordId: string): boolean {
    if (!this.db) {
      return false;
    }

    try {
      const result = this.db.prepare(`
        DELETE FROM word_embeddings WHERE word_id = ?
      `).run(wordId);

      return result.changes > 0;
    } catch (error) {
      console.error('❌ Error deleting embedding:', error);
      return false;
    }
  }

  /**
   * Perform semantic search using vector similarity
   * Uses sqlite-vec's vec0 virtual table with match operator and distance ordering
   */
  semanticSearch(queryEmbedding: number[], limit: number = 50, threshold: number = 0.5): SemanticWordItem[] {
    if (!this.db) {
      return [];
    }

    try {
      // Use sqlite-vec's vec0 virtual table with match operator
      // The match operator performs nearest neighbor search and returns distance
      // Remember, we use cosine [0-2]
      // 0 = identical direction, 1 = orthogonal, 2 = opposite direction.
      const rows = this.db.prepare(`
        SELECT
          we.word_id,
          d.data,
          distance
        FROM word_embeddings we
        JOIN documents d ON we.word_id = d.id
        WHERE d.type = 'word'
        AND we.embedding MATCH ?
        AND distance <= ?
        ORDER BY distance ASC
        LIMIT ?
      `).all(JSON.stringify(queryEmbedding), (1-threshold), limit) as any[];

      const results: SemanticWordItem[] = rows.map((row: any) => {
        const data = JSON.parse(row.data);
        return {
          word_item: {
            id: row.word_id,
            word: data.word,
            one_line_desc: data.one_line_desc || '',
            remark: data.remark
          },
          similarity: 1.0 - row.distance  // Convert distance to similarity (lower distance = higher similarity)
        };
      });

      return results;
    } catch (error) {
      console.error('❌ Error performing semantic search:', error);
      return [];
    }
  }

  /**
   * Get statistics about stored embeddings
   */
  getEmbeddingStats(): {
    totalEmbeddings: number;
    averageEmbeddingSize: number;
  } {
    if (!this.db) {
      return { totalEmbeddings: 0, averageEmbeddingSize: 0 };
    }

    try {
      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          AVG(json_array_length(embedding)) as avg_dimensions
        FROM word_embeddings
      `).get() as any;

      return {
        totalEmbeddings: stats.total || 0,
        averageEmbeddingSize: Math.round(stats.avg_dimensions || 0)
      };
    } catch (error) {
      console.error('❌ Error getting embedding stats:', error);
      return { totalEmbeddings: 0, averageEmbeddingSize: 0 };
    }
  }

}
