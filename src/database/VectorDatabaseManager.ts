import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { Utils } from '../utils/Utils.js';
import { WordListItem } from "../database/DatabaseManager.js";
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface WordEmbedding {
  word_id: string;
  embedding: number[];
  model_used: string;
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
  private cachedDylibPath: string | null = null;

  constructor(db?: Database.Database) {
    if (db) {
      this.db = db;
    }
  }

  initialize(dbPath: string, existingDb?: Database.Database): void {    
      try {
        // If we already have a database connection, use it
        if (existingDb) {
          this.db = existingDb;
          this.loadVectorExtension();
          this.createVectorTables();
          return;
        }

        // Otherwise create a new connection
        Utils.ensureDataDirectory();

        // Open database with sqlite-vec support
        this.db = new Database(dbPath);

        // Load the sqlite-vec extension
        this.loadVectorExtension();
        this.createVectorTables();
      } catch (error) {
        throw error;
      }
  }

  /**
   * Load the sqlite-vec extension into the database
   */
  private loadVectorExtension(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const dylibName = 'vec0.dylib';
      const dylibPath = this.findDylibFile(dylibName);

      if (!dylibPath) {
        console.log('⚠️ sqlite-vec dylib not found in standard locations, trying sqlite-vec package method...');
        sqliteVec.load(this.db);
        console.log('✅ sqlite-vec extension loaded successfully using package method');
        return;
      }

      console.log(`📋 Loading sqlite-vec extension from: ${dylibPath}`);

      // Try to load using better-sqlite3's loadExtension method with full path
      try {
        (this.db as any).loadExtension(dylibPath);
        console.log('✅ sqlite-vec extension loaded successfully using loadExtension');
        return;
      } catch (loadExtError) {
        console.log('⚠️ loadExtension failed, trying sqlite-vec package method:', loadExtError);
      }

      // Fallback to sqlite-vec package method
      sqliteVec.load(this.db);
      console.log('✅ sqlite-vec extension loaded successfully using package method');
    } catch (error) {
      console.error('❌ Error loading sqlite-vec extension:', error);
      throw error;
    }
  }

  /**
   * Find the sqlite-vec dylib file in various possible locations
   * Uses the same pattern as GoogleAuthService for consistency
   * Note: Only searches unpacked locations since dylib files cannot be loaded from ASAR
   */
  private findDylibFile(filename: string): string | null {
    // Return cached path if available
    if (this.cachedDylibPath) {
      console.log(`📋 Using cached dylib path: ${this.cachedDylibPath}`);
      return this.cachedDylibPath;
    }

    const appPath = app.getAppPath();
    const possiblePaths: string[] = [];

    // 1. Resources directory (asarUnpack location) - primary location for dylib files
    if (appPath.includes('.asar')) {
      const resourcesPath = path.dirname(appPath);
      possiblePaths.push(path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'sqlite-vec-darwin-x64', filename));
    }

    // 2. Direct app directory (development fallback)
    if (!appPath.includes('.asar')) {
      possiblePaths.push(path.join(appPath, 'node_modules', 'sqlite-vec-darwin-x64', filename));
    }

    // Note: Skip ASAR location entirely for dylib files since they cannot be loaded from ASAR

    console.log(`🔍 Searching for ${filename} in: ${possiblePaths.join(', ')}`);

    // Try each path
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        console.log(`✅ Found ${filename} at: ${filePath}`);
        this.cachedDylibPath = filePath; // Cache the found path
        return filePath;
      }
    }

    console.log(`❌ ${filename} not found in any location`);
    return null;
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
          embedding float[2048], -- Default embedding dimension, will be adjusted based on model
          model_used TEXT
        );
      `);

      // Create index for efficient model-based filtering
      // Sqlite-vec doesn't support create index
      // this.db.exec(`
      //   CREATE INDEX IF NOT EXISTS idx_embedding_model
      //   ON word_embeddings(model_used, word_id);
      // `);

      console.log('✅ Vector database tables created successfully');
    } catch (error) {
      console.error('❌ Error creating vector tables:', error);
      throw error;
    }
  }

  /**
   * Check if database connection is still valid
   */
  isConnectionValid(): boolean {
    try {
      // better-sqlite3 has an 'open' property that indicates if connection is active
      return this.db !== null && (this.db as any).open === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if embedding exists for a word and model
   */
  embeddingExists(wordId: string, modelUsed: string): boolean {
    if (!this.db || !this.isConnectionValid()) {
      console.log('❌ Database not initialized or connection closed in embeddingExists');
      return false;
    }

    try {
      console.log(`🔍 Checking existence: word_id=${wordId}, model=${modelUsed}`);
      const row = this.db.prepare(`
        SELECT 1 FROM word_embeddings WHERE word_id = ? AND model_used = ?
      `).get(wordId, modelUsed) as any;

      const exists = !!row;
      console.log(`📋 Existence check result for word_id=${wordId}, model=${modelUsed}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
      return exists;
    } catch (error) {
      console.error('❌ Error checking if embedding exists:', error);
      return false;
    }
  }

  /**
   * Store or update word embedding
   */
  storeEmbedding(se: SemanticEmbedding): void {
    if (!this.db || !this.isConnectionValid()) {
      throw new Error('Database not initialized or connection closed');
    }

    try {
      const exists = this.embeddingExists(se.word_id, se.model_used);

      if (exists) {
        // Update existing embedding
        this.db.prepare(`
          UPDATE word_embeddings
          SET embedding = ?
          WHERE word_id = ? AND model_used = ?
        `).run(JSON.stringify(se.embedding), se.word_id, se.model_used);

        console.debug(`✅ Embedding updated for word ${se.word_id} using model ${se.model_used}`);
      } else {
        // Insert new embedding
        this.db.prepare(`
          INSERT INTO word_embeddings (word_id, embedding, model_used)
          VALUES (?, ?, ?)
        `).run(se.word_id, JSON.stringify(se.embedding), se.model_used);

        console.debug(`✅ Embedding inserted for word ${se.word_id} using model ${se.model_used}`);
      }
    } catch (error) {
      console.error('❌ Error storing embedding:', error);
      throw error;
    }
  }

  /**
   * Batch store multiple word embeddings efficiently
   */
  batchStoreEmbeddings(embeddings: Array<SemanticEmbedding>): void {
    if (!this.db || !this.isConnectionValid()) {
      throw new Error('Database not initialized or connection closed');
    }

    if (embeddings.length === 0) {
      console.log('ℹ️ No embeddings to store in batch');
      return; // Nothing to do
    }

    try {
      console.log(`💾 Starting batch store of ${embeddings.length} embeddings`);
      console.log(`📋 Word IDs: ${embeddings.map(e => e.word_id).join(', ')}`);

      // Use a transaction for better performance and atomicity
      const transaction = this.db.transaction((embeddings: SemanticEmbedding[]) => {
        const embeddingStmt = this.db!.prepare(`
          INSERT OR REPLACE INTO word_embeddings (word_id, embedding, model_used)
          VALUES (?, ?, ?)
        `);

        for (const { word_id, embedding, model_used } of embeddings) {
          embeddingStmt.run(word_id, JSON.stringify(embedding), model_used);
          console.debug(`✅ Embedding stored for word ${word_id} using model ${model_used}`);
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
    if (!this.db || !this.isConnectionValid()) {
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
   * @param wordId
   */
  deleteEmbedding(wordId: string): boolean {
    if (!this.db || !this.isConnectionValid()) {
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
     console.log('🔍 Starting semantic search with parameters:');
     console.log(`   - Query embedding dimensions: ${queryEmbedding.length}`);
     console.log(`   - Limit: ${limit}`);
     console.log(`   - Threshold: ${threshold}`);
     console.log(`   - Max distance allowed: ${1-threshold}`);

     if (!this.db || !this.isConnectionValid()) {
       console.error('❌ Database not initialized or connection closed, returning empty results');
       return [];
     }

     try {
       // Use sqlite-vec's vec_distance_cosine function for explicit cosine distance calculation
       // Cosine distance ranges from 0 to 2:
       // 0 = identical direction, 1 = orthogonal, 2 = opposite direction
       const sqlQuery = `
         SELECT
           we.word_id,
           d.data,
           vec_distance_cosine(we.embedding, ?) AS distance
         FROM word_embeddings we
         JOIN documents d ON we.word_id = d.id
         WHERE d.type = 'word'
         AND vec_distance_cosine(we.embedding, ?) <= ?
         ORDER BY distance ASC
         LIMIT ?
       `;

       console.log('🔍 Executing SQL query:');
       console.log(sqlQuery);
       console.log('🔍 Query parameters [threshold, limit]:', [(1-threshold), limit]);

       const startTime = Date.now();
       const rows = this.db.prepare(sqlQuery).all(JSON.stringify(queryEmbedding), JSON.stringify(queryEmbedding), (1-threshold), limit) as any[];
       const queryTime = Date.now() - startTime;

       console.log(`✅ Query completed in ${queryTime}ms`);
       console.log(`📊 Found ${rows.length} potential matches from database`);

       if (rows.length > 0) {
         console.log('📋 Top 5 results preview:');
         rows.slice(0, 5).forEach((row, index) => {
           console.log(`   ${index + 1}. Word ID: ${row.word_id}, Distance: ${row.distance.toFixed(4)}`);
         });
       }

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

       console.log(`✅ Successfully processed ${results.length} semantic search results`);
       if (results.length > 0) {
         console.log(`📈 Similarity range: ${results[results.length - 1].similarity.toFixed(4)} - ${results[0].similarity.toFixed(4)}`);
         console.log(`📝 Top result: "${results[0].word_item.word}" with similarity ${results[0].similarity.toFixed(4)}`);
       }

       return results;
     } catch (error) {
       console.error('❌ Error performing semantic search:', error);
       console.error('❌ Error details:', {
         queryEmbeddingLength: queryEmbedding.length,
         limit,
         threshold,
         errorMessage: error instanceof Error ? error.message : String(error)
       });
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
    if (!this.db || !this.isConnectionValid()) {
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
