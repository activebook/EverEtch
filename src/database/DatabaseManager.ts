import Database from 'better-sqlite3';
import { Utils } from '../utils/Utils.js';
import { DatabaseRecovery } from './DatabaseRecovery.js';
import { VectorDatabaseManager } from './VectorDatabaseManager.js';

export interface WordDocument {
  id: string;
  word: string;
  one_line_desc: string;
  details: string;
  tags: string[];
  tag_colors: Record<string, string>;
  synonyms: string[];
  antonyms: string[];
  remark?: string;
  created_at: string;
  updated_at: string;
}

export interface TagDocument {
  id: string;
  tag: string;
  related_words: string[];
  color: string;
  usage_count: number;
}

export interface WordListItem {
  id: string;
  word: string;
  one_line_desc: string;
  remark?: string;
}

export interface ProfileConfig {
  id: string;
  name: string;
  system_prompt: string;
  model_config: {
    provider: string;
    model: string;
    endpoint: string;
    api_key: string;
  };
  embedding_config?: {
    provider: string;
    model: string;
    endpoint: string;
    api_key: string;
    batch_size: number;
    similarity_threshold: number;
    enabled: boolean;
  };
  last_opened: string;
}

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string = '';
  private vectorDb: VectorDatabaseManager | null = null;

  constructor() { }

  initialize(profileName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        Utils.ensureDataDirectory();
        this.dbPath = Utils.getDatabasePath(profileName);
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.createTables();
        this.initializeVectorDatabase(this.dbPath); // Initialize vector database immediately
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private createTables(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Create documents table for NoSQL-style storage
    const sql = `
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Basic indexes
      CREATE INDEX IF NOT EXISTS idx_type ON documents(type);
      CREATE INDEX IF NOT EXISTS idx_created_at ON documents(created_at);
      CREATE INDEX IF NOT EXISTS idx_updated_at ON documents(updated_at);

      -- Word-specific indexes
      CREATE INDEX IF NOT EXISTS idx_word_lookup ON documents(type, json_extract(data, '$.word'));
    `;

    this.db.exec(sql);

    // Handle FTS table creation/updates
    this.createOrUpdateFTSTable();
  }

  private createOrUpdateFTSTable(): void {
    if (!this.db) {
      return;
    }

    const recovery = new DatabaseRecovery(this.db);
    recovery.createOrUpdateFTSTable();
  }


  getWordsCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(0);
        return;
      }

      try {
        const row = this.db.prepare('SELECT COUNT(*) as total FROM documents WHERE type = ?').get('word') as { total: number } | undefined;
        resolve(row?.total || 0);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Paginated word loading for lazy loading - optimized to only fetch required fields
  getWordsPaginated(offset: number, limit: number, sortOrder: 'asc' | 'desc' = 'desc'): Promise<{ words: WordListItem[], hasMore: boolean, total: number }> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) {
        resolve({ words: [], hasMore: false, total: 0 });
        return;
      }

      try {
        // Get total count using index (guaranteed optimization)
        const totalRow = this.db!.prepare('SELECT COUNT(*) as total FROM documents WHERE type = ?').get('word') as { total: number } | undefined;
        const totalResult = { total: totalRow?.total || 0 };

        // Get paginated data using indexes - only fetch required fields for performance
        const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
        const query = `
          SELECT
            id,
            json_extract(data, '$.word') as word,
            json_extract(data, '$.one_line_desc') as one_line_desc,
            json_extract(data, '$.remark') as remark
          FROM documents
          WHERE type = 'word'
          ORDER BY created_at ${orderDirection}, updated_at ${orderDirection}
          LIMIT ${limit} OFFSET ${offset}
        `;

        const dataResult = this.db!.prepare(query).all() as { id: string, word: string, one_line_desc: string, remark: string }[];

        const words: WordListItem[] = dataResult.map(row => ({
          id: row.id,
          word: row.word,
          one_line_desc: row.one_line_desc || '',
          remark: row.remark || undefined
        }));
        const total = totalResult.total;
        const hasMore = offset + limit < total;

        resolve({ words, hasMore, total });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Paginated word documents loading - returns full WordDocument objects
  async getWordDocumentsPaginated(offset: number, limit: number, sortOrder: 'asc' | 'desc' = 'desc'): Promise<{ words: WordDocument[], hasMore: boolean, total: number }> {
    if (!this.db) {
      return { words: [], hasMore: false, total: 0 };
    }

    try {
      // Get total count using index (guaranteed optimization)
      const totalRow = this.db!.prepare('SELECT COUNT(*) as total FROM documents WHERE type = ?').get('word') as { total: number } | undefined;
      const totalResult = { total: totalRow?.total || 0 };

      // Get paginated data - fetch complete document data
      const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
      const query = `
        SELECT id, data
        FROM documents
        WHERE type = 'word'
        ORDER BY created_at ${orderDirection}, updated_at ${orderDirection}
        LIMIT ${limit} OFFSET ${offset}
      `;

      const dataResult = this.db!.prepare(query).all() as { id: string, data: string }[];

      const words: WordDocument[] = dataResult.map(row => {
        const wordDoc = JSON.parse(row.data) as WordDocument;
        return wordDoc;
      });

      const total = totalResult.total;
      const hasMore = offset + limit < total;

      return { words, hasMore, total };
    } catch (err) {
      console.error('Error in getWordDocumentsPaginated:', err);
      return { words: [], hasMore: false, total: 0 };
    }
  }

  // Optimized search method that only returns necessary fields for suggestions
  // Only returns 10 results
  searchWords(query: string): Promise<WordListItem[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      try {
        // Use LIKE for reliable substring search in word field only - optimized to only fetch required fields
        const sql = `
          SELECT
            id,
            json_extract(data, '$.word') as word,
            json_extract(data, '$.one_line_desc') as one_line_desc,
            json_extract(data, '$.remark') as remark
          FROM documents
          WHERE type = 'word'
          AND json_extract(data, '$.word') LIKE ?
          ORDER BY
            CASE WHEN json_extract(data, '$.word') LIKE ? THEN 1 ELSE 2 END,
            json_extract(data, '$.word')
          LIMIT 10
        `;

        // Search for substring anywhere in word
        const searchPattern = `%${query}%`;
        // Prioritize words that start with the query
        const prefixPattern = `${query}%`;

        const rows = this.db.prepare(sql).all(searchPattern, prefixPattern) as { id: string, word: string, one_line_desc: string, remark: string }[];

        const words: WordListItem[] = rows.map(row => ({
          id: row.id,
          word: row.word,
          one_line_desc: row.one_line_desc || 'No description',
          remark: row.remark || undefined
        }));
        resolve(words);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Get word by ID, retrieve whole document
  getWord(wordId: string): Promise<WordDocument | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      try {
        const row = this.db.prepare('SELECT data FROM documents WHERE id = ? AND type = ?').get(wordId, 'word') as { data: string } | undefined;
        console.debug('Word: ', row?.data);
        resolve(row ? JSON.parse(row.data) : null);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Helper method to find word by name
  getWordByName(wordName: string): Promise<WordDocument | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      try {
        const row = this.db.prepare('SELECT data FROM documents WHERE type = ? AND json_extract(data, \'$.word\') = ?').get('word', wordName) as { data: string } | undefined;
        resolve(row ? JSON.parse(row.data) : null);
      } catch (error) {
        reject(error);
      }
    });
  }

  addWord(wordData: Omit<WordDocument, 'id' | 'created_at' | 'updated_at'>): WordDocument {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Check if word already exists (synchronous version)
    const existingRow = this.db.prepare('SELECT data FROM documents WHERE type = ? AND json_extract(data, \'$.word\') = ?').get('word', wordData.word) as { data: string } | undefined;
    const existingWord = existingRow ? JSON.parse(existingRow.data) as WordDocument : null;

    if (existingWord) {
      // Update existing word
      const updatedWord: WordDocument = {
        ...existingWord,
        ...wordData,
        updated_at: Utils.formatDate()
      };

      this.db.prepare('UPDATE documents SET data = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(updatedWord),
        updatedWord.updated_at,
        existingWord.id
      );

      return updatedWord;
    } else {
      // Create new word
      const id = Utils.generateId('word');
      const now = Utils.formatDate();

      const wordDoc: WordDocument = {
        id,
        ...wordData,
        created_at: now,
        updated_at: now
      };

      this.db.prepare('INSERT INTO documents (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        id,
        'word',
        JSON.stringify(wordDoc),
        now,
        now
      );

      return wordDoc;
    }
  }

  updateWord(wordId: string, wordData: Partial<WordDocument>): WordDocument | null {
    if (!this.db) {
      return null;
    }

    try {
      // Get existing word synchronously
      const existingRow = this.db.prepare('SELECT data FROM documents WHERE id = ? AND type = ?').get(wordId, 'word') as { data: string } | undefined;
      if (!existingRow) {
        return null;
      }

      const existing = JSON.parse(existingRow.data) as WordDocument;
      const updated: WordDocument = {
        ...existing,
        ...wordData,
        updated_at: Utils.formatDate()
      };

      // debug only the changed part:
      console.debug('Updating word: ', {
        ...wordData,
        updated_at: Utils.formatDate()
      });

      this.db.prepare('UPDATE documents SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updated), updated.updated_at, wordId);

      return updated;
    } catch (err) {
      console.error('Error updating word:', err);
      return null;
    }
  }

  deleteWord(wordId: string): boolean {
    if (!this.db) {
      return false;
    }

    try {
      const result = this.db.prepare('DELETE FROM documents WHERE id = ? AND type = ?').run(wordId, 'word');
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting word:', error);
      return false;
    }
  }

  // Unified paginated related words search using FTS5 - replaces getAssociatedWordsPaginated
  getRelatedWordsPaginated(searchTerm: string, offset: number, limit: number): Promise<{ words: WordListItem[], hasMore: boolean, total: number }> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) {
        resolve({ words: [], hasMore: false, total: 0 });
        return;
      }

      try {
        // Use FTS5 for fast full-text search across all relevant fields
        const ftsQuery = `"${searchTerm}" OR "${searchTerm}"*`;

        // First get total count
        const countSql = `
          SELECT COUNT(*) as total
          FROM words_fts f
          WHERE words_fts MATCH ?
        `;

        const totalRow = this.db!.prepare(countSql).get(ftsQuery) as { total: number } | undefined;
        const totalResult = { total: totalRow?.total || 0 };

        // Then get paginated results
        const sql = `
          SELECT
            f.id,
            f.word,
            f.one_line_desc,
            f.remark
          FROM words_fts f
          WHERE words_fts MATCH ?
          ORDER BY
            CASE
              WHEN LOWER(f.word) = LOWER(?) THEN 1  -- Exact word match (highest priority)
              WHEN LOWER(f.word) LIKE LOWER(?) THEN 2  -- Word starts with term
              ELSE 3  -- Other matches
            END,
            bm25(words_fts),
            f.word
          LIMIT ${limit} OFFSET ${offset}
        `;

        const params = [
          ftsQuery,         // FTS5 search query
          searchTerm,       // exact word match priority
          `${searchTerm}%`  // word starts with priority
        ];

        const dataResult = this.db!.prepare(sql).all(...params) as { id: string, word: string, one_line_desc: string, remark: string }[];

        const words: WordListItem[] = dataResult.map(row => ({
          id: row.id,
          word: row.word,
          one_line_desc: row.one_line_desc || 'No description',
          remark: row.remark || undefined
        }));

        const total = totalResult.total;
        const hasMore = offset + limit < total;

        resolve({ words, hasMore, total });

      } catch (err) {
        // Fallback to LIKE-based pagination if FTS5 fails
        console.warn('FTS5 paginated search failed, falling back to LIKE search:', err);
        this.fallbackGetRelatedWordsPaginated(searchTerm, offset, limit).then(resolve).catch(reject);
      }
    });
  }

  /**
   * Fallback method for paginated comprehensive search using LIKE queries
   */
  private fallbackGetRelatedWordsPaginated(searchTerm: string, offset: number, limit: number): Promise<{ words: WordListItem[], hasMore: boolean, total: number }> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) {
        resolve({ words: [], hasMore: false, total: 0 });
        return;
      }

      try {
        const searchPattern = `%${searchTerm}%`;

        // Get total count first
        const countSql = `
          SELECT COUNT(DISTINCT id) as total
          FROM documents
          WHERE type = 'word' AND (
            LOWER(json_extract(data, '$.word')) LIKE LOWER(?)
            OR LOWER(json_extract(data, '$.tags')) LIKE LOWER(?)
            OR LOWER(json_extract(data, '$.synonyms')) LIKE LOWER(?)
            OR LOWER(json_extract(data, '$.antonyms')) LIKE LOWER(?)
            OR LOWER(json_extract(data, '$.one_line_desc')) LIKE LOWER(?)
          )
        `;

        const countParams = [
          searchPattern, // word
          searchPattern, // tags
          searchPattern, // synonyms
          searchPattern, // antonyms
          searchPattern  // description (no details column anymore)
        ];

        const totalRow = this.db!.prepare(countSql).get(...countParams) as { total: number } | undefined;
        const totalResult = { total: totalRow?.total || 0 };

        // Get paginated results
        const sql = `
          SELECT DISTINCT
            id,
            json_extract(data, '$.word') as word,
            json_extract(data, '$.one_line_desc') as one_line_desc,
            json_extract(data, '$.remark') as remark
          FROM documents
          WHERE type = 'word' AND (
            LOWER(json_extract(data, '$.word')) LIKE LOWER(?)
            OR LOWER(json_extract(data, '$.tags')) LIKE LOWER(?)
            OR LOWER(json_extract(data, '$.synonyms')) LIKE LOWER(?)
            OR LOWER(json_extract(data, '$.antonyms')) LIKE LOWER(?)
            OR LOWER(json_extract(data, '$.one_line_desc')) LIKE LOWER(?)
          )
          ORDER BY
            CASE
              WHEN LOWER(json_extract(data, '$.word')) = LOWER(?) THEN 1
              WHEN LOWER(json_extract(data, '$.word')) LIKE LOWER(?) THEN 2
              ELSE 3
            END,
            json_extract(data, '$.word')
          LIMIT ${limit} OFFSET ${offset}
        `;

        const params = [
          searchPattern, // word
          searchPattern, // tags
          searchPattern, // synonyms
          searchPattern, // antonyms
          searchPattern, // description (no details column anymore)
          searchTerm,     // exact match priority
          `${searchTerm}%` // starts with priority
        ];

        const dataResult = this.db!.prepare(sql).all(...params) as { id: string, word: string, one_line_desc: string, remark: string }[];

        const words: WordListItem[] = dataResult.map(row => ({
          id: row.id,
          word: row.word,
          one_line_desc: row.one_line_desc || 'No description',
          remark: row.remark || undefined
        }));

        const total = totalResult.total;
        const hasMore = offset + limit < total;

        resolve({ words, hasMore, total });

      } catch (err) {
        reject(err);
      }
    });
  }

  // Profile config operations
  getProfileConfig(): Promise<ProfileConfig | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      try {
        const row = this.db.prepare('SELECT data FROM documents WHERE type = ?').get('profile_config') as { data: string } | undefined;
        resolve(row ? JSON.parse(row.data) : null);
      } catch (error) {
        reject(error);
      }
    });
  }

  setProfileConfig(config: Omit<ProfileConfig, 'id'>): Promise<ProfileConfig> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      try {
        const id = 'profile_config';
        const now = new Date().toISOString();

        const configDoc: ProfileConfig = {
          id,
          ...config,
          last_opened: now
        };

        this.db.prepare('INSERT OR REPLACE INTO documents (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, 'profile_config', JSON.stringify(configDoc), now, now);
        resolve(configDoc);
      } catch (error) {
        reject(error);
      }
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        // Check if database is already closed or in a bad state
        try {
          this.db.close();
          this.db = null;
          resolve();
        } catch (error) {
          // Database might already be closed
          this.db = null;
          console.debug('Database close attempted on already closed connection');
          resolve();
        }
      } else {
        resolve();
      }
    });
  }

  /**
   * Reconnect to an existing database file (used after renaming)
   * This bypasses the table creation logic and directly opens the existing database
   */
  reconnectToDatabase(profileName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Close any existing connection
        if (this.db) {
          this.db.close();
        }

        // Now open the new database
        this.dbPath = Utils.getDatabasePath(profileName);
        this.db = new Database(this.dbPath);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Initialize vector database for semantic search
   */
  private async initializeVectorDatabase(dbPath: string): Promise<void> {
    if (!this.vectorDb) {
      this.vectorDb = new VectorDatabaseManager(this.db!);
      await this.vectorDb.initialize(dbPath, this.db!);
      console.log('✅ Vector database initialized with shared connection');
    }
  }

  /**
   * Get vector database instance
   */
  getVectorDatabase(): VectorDatabaseManager | null {
    return this.vectorDb;
  }

  /**
   * Get database instance for direct access (for batch processing)
   */
  getDatabase(): Database.Database | null {
    return this.db;
  }

  /**
  * Insert or update word embedding in vector database
  * @param word 
  * @param profile 
  * @returns 
  */
  async storeWordEmbedding(
    id: string,
    embedding: number[],
    profile: ProfileConfig,
  ): Promise<void> {

    // Check if we have embedding config
    if (!profile.embedding_config) {
      throw new Error('Embedding configuration not found in profile');
    }

    // Insert or update embedding
    await this.vectorDb!.storeEmbedding({
      word_id: id,
      embedding: embedding,
      model_used: profile.embedding_config.model
    });

  }

  /**
   * Delete word embedding from vector database
   * @param wordId
   * @param profile
   */
  async deleteWordEmbedding(
    wordId: string
  ): Promise<void> {

    // Delete embedding
    await this.vectorDb!.deleteEmbedding(wordId);
  }

  /**
   * Transactional word deletion with embedding cleanup
   * Ensures atomicity between word deletion and embedding cleanup
   * @param wordId Word ID to delete
   * @param profile Profile configuration for embedding validation
   * @returns boolean True if word was deleted successfully
   */
  transactionDeleteWord(
    wordId: string,
    profile: ProfileConfig
  ): boolean {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      console.log(`🔄 Starting transaction: Delete word "${wordId}"`);

      // Execute transaction
      const result = this.db.transaction(() => {
        // Step 1: Delete word document using existing synchronous method
        console.log(`🔄 Transaction: Deleting word "${wordId}"`);

        const deleteResult = this.deleteWord(wordId);
        if (!deleteResult) {
          throw new Error(`Word with ID ${wordId} not found`);
        }

        console.log(`✅ Word deleted: ${wordId}`);

        // Step 2: Clean up embedding in vector database if enabled
        if (this.vectorDb) {
          console.log(`💾 Cleaning up embedding for word: ${wordId}`);
          // We don't need to check whether embedding exists or not
          // bacause the word can be added without embedding
          // so just delete related word if existed
          this.vectorDb.deleteEmbedding(wordId);
          console.log(`✅ Embedding cleaned up for word: ${wordId}`);
        }

        return deleteResult;
      })();

      console.log(`🎉 Transaction completed successfully for word deletion: ${wordId}`);
      return result;

    } catch (error) {
      console.error(`❌ Transaction failed for word deletion "${wordId}":`, error);
      throw new Error(`Failed to delete word "${wordId}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }



  /**
   * Transactional word addition with embedding storage
   * Ensures atomicity between word creation/update and embedding storage
   * @param wordData Word data without id, created_at, updated_at
   * @param embedding Word embedding vector
   * @param profile Profile configuration for embedding validation
   * @returns WordDocument The created or updated word document
   */
  transactionAddWord(
    wordData: Omit<WordDocument, 'id' | 'created_at' | 'updated_at'>,
    embedding: number[],
    profile: ProfileConfig
  ): WordDocument {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Validate embedding configuration
    if (!profile || !profile.embedding_config) {
      throw new Error('Embedding configuration not found in profile');
    }

    if (!profile.embedding_config.enabled) {
      throw new Error('Embedding not enabled for current profile');
    }

    // Validate embedding data
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid embedding data provided');
    }

    let wordDoc: WordDocument | null = null;

    try {
      console.log(`🔄 Starting transaction: Add word "${wordData.word}" with embedding`);

      // Execute transaction
      const result = this.db.transaction(() => {
        // Step 1: Use synchronous addWord logic within transaction
        console.log(`🔄 Transaction: Adding/updating word "${wordData.word}"`);

        // Use the synchronous addWord method (handles both create and update)
        wordDoc = this.addWord(wordData);

        // Step 2: Store embedding in vector database
        if (wordDoc && this.vectorDb) {
          console.log(`💾 Storing embedding for word: ${wordDoc.word}`);
          this.vectorDb!.storeEmbedding({
            word_id: wordDoc.id,
            embedding: embedding,
            model_used: profile.embedding_config!.model
          });
          console.log(`✅ Embedding stored for word: ${wordDoc.word}`);
        }

        return wordDoc;
      })();

      console.log(`🎉 Transaction completed successfully for word: ${wordData.word}`);
      return result;

    } catch (error) {
      console.error(`❌ Transaction failed for word "${wordData.word}":`, error);
      throw new Error(`Failed to add word "${wordData.word}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transactional word update with embedding storage
   * Ensures atomicity between word update and embedding storage
   * @param wordId Word ID to update
   * @param wordData Word data to update
   * @param embedding Word embedding vector
   * @param profile Profile configuration for embedding validation
   * @returns WordDocument The updated word document
   */
  transactionUpdateWord(
    wordId: string,
    wordData: Partial<WordDocument>,
    embedding: number[],
    profile: ProfileConfig
  ): WordDocument {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Validate embedding configuration (required for transactional update)
    if (!profile || !profile.embedding_config) {
      throw new Error('Embedding configuration not found in profile');
    }

    if (!profile.embedding_config.enabled) {
      throw new Error('Embedding not enabled for current profile');
    }

    // Validate embedding data
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid embedding data provided');
    }

    let wordDoc: WordDocument | null = null;

    try {
      console.log(`🔄 Starting transaction: Update word "${wordId}"`);

      // Execute transaction
      const result = this.db.transaction(() => {
        // Step 1: Update word document using existing synchronous method
        console.log(`🔄 Transaction: Updating word "${wordId}"`);

        // Use the synchronous updateWord method
        wordDoc = this.updateWord(wordId, wordData);
        if (!wordDoc) {
          throw new Error(`Word with ID ${wordId} not found`);
        }

        console.log(`✅ Word updated: ${wordId}`);

        // Step 2: Update embedding in vector database (always done in transaction)
        if (wordDoc && this.vectorDb) {
          console.log(`💾 Updating embedding for word: ${wordDoc.word}`);
          this.vectorDb.storeEmbedding({
            word_id: wordId,
            embedding: embedding,
            model_used: profile.embedding_config!.model
          });
          console.log(`✅ Embedding updated for word: ${wordDoc.word}`);
        }

        return wordDoc;
      })();

      console.log(`🎉 Transaction completed successfully for word: ${wordId}`);
      return result;

    } catch (error) {
      console.error(`❌ Transaction failed for word "${wordId}":`, error);
      throw new Error(`Failed to update word "${wordId}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate if a database file is a valid EverEtch profile database
   * @param dbPath Path to the database file to validate
   * @returns Promise<boolean> True if valid, false otherwise
   */
  static async validateDatabaseFormat(dbPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const db = new Database(dbPath, { readonly: true });

        // Check if required tables exist
        const tableRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").get() as any;
        if (!tableRow) {
          db.close();
          resolve(false);
          return;
        }

        // Check if profile_config exists
        const configRow = db.prepare("SELECT data FROM documents WHERE type='profile_config' LIMIT 1").get() as any;
        db.close();
        resolve(!!configRow);
      } catch (error) {
        console.error('Error validating database:', error);
        resolve(false);
      }
    });
  }
}
