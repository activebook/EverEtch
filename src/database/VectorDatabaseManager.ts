import sqlite3 from 'sqlite3';
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
  private db: sqlite3.Database | null = null;

  constructor(db?: sqlite3.Database) {
    if (db) {
      this.db = db;
    }
  }

  initialize(dbPath: string, existingDb?: sqlite3.Database): Promise<void> {
    return new Promise((resolve, reject) => {
      // If we already have a database connection, use it
      if (existingDb) {
        this.db = existingDb;
        this.createVectorTables().then(resolve).catch(reject);
        return;
      }

      // Otherwise create a new connection
      Utils.ensureDataDirectory();

      // Open database with sqlite-vec support
      this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err: any) => {
        if (err) {
          reject(err);
          return;
        }
        this.createVectorTables().then(resolve).catch(reject);
      });
    });
  }

  private async createVectorTables(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Create vector table for storing embeddings
      // The key part is ON DELETE CASCADE, it WOULD automatically delete
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS word_embeddings (
          word_id TEXT PRIMARY KEY,
          embedding BLOB NOT NULL,
          model_used TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (word_id) REFERENCES documents(id) ON DELETE CASCADE
        );
      `);

      // Create index for efficient vector similarity search
      // Note: We can't use parameters in index expressions, so we create a basic index
      // The actual similarity search will be done in the WHERE clause of queries
      await this.db.exec(`
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
  async storeEmbedding(se: SemanticEmbedding): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const now = Utils.formatDate();

      this.db!.run(`
        INSERT OR REPLACE INTO word_embeddings (word_id, embedding, model_used, updated_at)
        VALUES (?, ?, ?, ?)
      `, [se.word_id, JSON.stringify(se.embedding), se.model_used, now], function (err) {
        if (err) {
          console.error('❌ Error storing embedding:', err);
          reject(err);
        } else {
          console.debug(`✅ Embedding stored for word ${se.word_id} using model ${se.model_used}`);
          resolve();
        }
      });
    });
  }

  /**
   * Batch store multiple word embeddings efficiently
   */
  async batchStoreEmbeddings(embeddings: Array<SemanticEmbedding>): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    if (embeddings.length === 0) {
      return; // Nothing to do
    }

    return new Promise((resolve, reject) => {
      const now = Utils.formatDate();

      // Use a transaction for better performance and atomicity
      this.db!.serialize(() => {
        this.db!.run('BEGIN TRANSACTION', (err: any) => {
          if (err) {
            console.error('❌ Error beginning transaction:', err);
            reject(err);
            return;
          }

          let completed = 0;
          let hasError = false;

          // Process each embedding
          embeddings.forEach(({ word_id, embedding, model_used }) => {
            if (hasError) return; // Stop if there's already an error

            this.db!.run(`
              INSERT OR REPLACE INTO word_embeddings (word_id, embedding, model_used, updated_at)
              VALUES (?, ?, ?, ?)
            `, [word_id, JSON.stringify(embedding), model_used, now], (err: any) => {
              if (err) {
                console.error(`❌ Error storing embedding for word ${word_id}:`, err);
                hasError = true;
                reject(err);
                return;
              }

              completed++;
              console.debug(`✅ Embedding stored for word ${word_id}`);

              // Commit transaction when all embeddings are processed
              if (completed === embeddings.length && !hasError) {
                this.db!.run('COMMIT', (err: any) => {
                  if (err) {
                    console.error('❌ Error committing transaction:', err);
                    reject(err);
                  } else {
                    console.log(`✅ Successfully stored ${embeddings.length} embeddings in batch`);
                    resolve();
                  }
                });
              }
            });
          });
        });
      });
    });
  }

  /**
   * Get embedding for a word by model
   */
  async getEmbedding(se: SemanticEmbedding): Promise<number[] | null> {
    if (!this.db) {
      return null;
    }

    return new Promise((resolve, reject) => {
      this.db!.get(`
        SELECT embedding FROM word_embeddings WHERE word_id = ? AND model_used = ?
      `, [se.word_id, se.model_used], (err, row: any) => {
        if (err) {
          console.error('❌ Error getting embedding:', err);
          resolve(null);
        } else {
          resolve(row ? JSON.parse(row.embedding) : null);
        }
      });
    });
  }

  /**
   * Delete embedding for a word
   * PS. we actually don't need to call it,
   * because foreign key would automatically delete no-use ones
   */
  async deleteEmbedding(wordId: string): Promise<boolean> {
    if (!this.db) {
      return false;
    }

    return new Promise((resolve, reject) => {
      this.db!.run(`
        DELETE FROM word_embeddings WHERE word_id = ?
      `, [wordId], function (err) {
        if (err) {
          console.error('❌ Error deleting embedding:', err);
          resolve(false);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  /**
   * Perform semantic search using vector similarity
   */
  async semanticSearch(queryEmbedding: number[], limit: number = 50, threshold: number = 0.5): Promise<SemanticWordItem[]> {
    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      this.db!.all(`
        SELECT
          we.word_id,
          d.data,
          sqlite_vec_cosine_similarity(we.embedding, ?) as similarity
        FROM word_embeddings we
        JOIN documents d ON we.word_id = d.id
        WHERE d.type = 'word'
        AND sqlite_vec_cosine_similarity(we.embedding, ?) >= ?
        ORDER BY similarity DESC
        LIMIT ?
      `, [JSON.stringify(queryEmbedding), JSON.stringify(queryEmbedding), threshold, limit], (err, rows: any[]) => {
        if (err) {
          console.error('❌ Error performing semantic search:', err);
          resolve([]);
        } else {
          const results: SemanticWordItem[] = rows.map((row: any) => {
            const data = JSON.parse(row.data);
            return {
              word_item: {
                id: row.word_id,
                word: data.word,
                one_line_desc: data.one_line_desc || '',
                remark: data.remark
              },
              similarity: row.similarity
            };
          });
          resolve(results);
        }
      });
    });
  }

  /**
   * Get statistics about stored embeddings
   */
  async getEmbeddingStats(): Promise<{
    totalEmbeddings: number;
    uniqueModels: string[];
    averageEmbeddingSize: number;
  }> {
    if (!this.db) {
      return { totalEmbeddings: 0, uniqueModels: [], averageEmbeddingSize: 0 };
    }

    return new Promise((resolve, reject) => {
      this.db!.get(`
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT model_used) as model_count,
          AVG(LENGTH(embedding)) as avg_size
        FROM word_embeddings
      `, (err, stats: any) => {
        if (err) {
          console.error('❌ Error getting embedding stats:', err);
          resolve({ totalEmbeddings: 0, uniqueModels: [], averageEmbeddingSize: 0 });
          return;
        }

        this.db!.all(`
          SELECT DISTINCT model_used
          FROM word_embeddings
          ORDER BY model_used
        `, (err2, models: any[]) => {
          if (err2) {
            console.error('❌ Error getting models:', err2);
            resolve({ totalEmbeddings: 0, uniqueModels: [], averageEmbeddingSize: 0 });
            return;
          }

          resolve({
            totalEmbeddings: stats.total || 0,
            uniqueModels: models.map((m: any) => m.model_used),
            averageEmbeddingSize: Math.round(stats.avg_size || 0)
          });
        });
      });
    });
  }

}
