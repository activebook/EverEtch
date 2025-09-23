import sqlite3 from 'sqlite3';
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
  private db: sqlite3.Database | null = null;
  private dbPath: string = '';
  private vectorDb: VectorDatabaseManager | null = null;

  constructor() { }

  // Event callbacks for auto-sync
  private onWordAdded?: (wordDoc: WordDocument) => void;
  private onWordUpdated?: (wordDoc: WordDocument) => void;
  private onWordDeleted?: (wordId: string) => void;

  /**
   * Set callback for when words are added (for auto-sync)
   */
  setWordAddedCallback(callback: (wordDoc: WordDocument) => void): void {
    this.onWordAdded = callback;
  }

  /**
   * Set callback for when words are updated (for auto-sync)
   */
  setWordUpdatedCallback(callback: (wordDoc: WordDocument) => void): void {
    this.onWordUpdated = callback;
  }

  /**
   * Set callback for when words are deleted (for auto-sync)
   */
  setWordDeletedCallback(callback: (wordId: string) => void): void {
    this.onWordDeleted = callback;
  }

  initialize(profileName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Utils.ensureDataDirectory();
      this.dbPath = Utils.getDatabasePath(profileName);
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          await this.createTables();
          await this.initializeVectorDatabase(this.dbPath); // Initialize vector database immediately
          resolve();
        } catch (initError) {
          reject(initError);
        }
      });
    });
  }

  private createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
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

      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          // Handle FTS table creation/updates
          this.createOrUpdateFTSTable().then(resolve).catch(reject);
        }
      });
    });
  }

  private createOrUpdateFTSTable(): Promise<void> {
    if (!this.db) {
      return Promise.resolve();
    }

    const recovery = new DatabaseRecovery(this.db);
    return recovery.createOrUpdateFTSTable();
  }


  getWordsCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(0);
        return;
      }

      this.db.get('SELECT COUNT(*) as total FROM documents WHERE type = ?', ['word'], (err, row: { total: number } | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row?.total || 0);
      });
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
        const totalResult = await new Promise<{ total: number }>((resolveCount, rejectCount) => {
          this.db!.get('SELECT COUNT(*) as total FROM documents WHERE type = ?', ['word'], (err, row: { total: number } | undefined) => {
            if (err) {
              rejectCount(err);
              return;
            }
            resolveCount({ total: row?.total || 0 });
          });
        });

        // Get paginated data using indexes - only fetch required fields for performance
        const dataResult = await new Promise<{ id: string, word: string, one_line_desc: string, remark: string }[]>((resolveData, rejectData) => {
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

          this.db!.all(query, (err, rows: { id: string, word: string, one_line_desc: string, remark: string }[]) => {
            if (err) {
              rejectData(err);
              return;
            }
            resolveData(rows);
          });
        });

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
      const totalResult = await new Promise<{ total: number }>((resolveCount, rejectCount) => {
        this.db!.get('SELECT COUNT(*) as total FROM documents WHERE type = ?', ['word'], (err, row: { total: number } | undefined) => {
          if (err) {
            rejectCount(err);
            return;
          }
          resolveCount({ total: row?.total || 0 });
        });
      });

      // Get paginated data - fetch complete document data
      const dataResult = await new Promise<{ id: string, data: string }[]>((resolveData, rejectData) => {
        const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
        const query = `
          SELECT id, data
          FROM documents
          WHERE type = 'word'
          ORDER BY created_at ${orderDirection}, updated_at ${orderDirection}
          LIMIT ${limit} OFFSET ${offset}
        `;

        this.db!.all(query, (err, rows: { id: string, data: string }[]) => {
          if (err) {
            rejectData(err);
            return;
          }
          resolveData(rows);
        });
      });

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

      this.db.all(sql, [searchPattern, prefixPattern], (err, rows: { id: string, word: string, one_line_desc: string, remark: string }[]) => {
        if (err) {
          reject(err);
          return;
        }

        const words: WordListItem[] = rows.map(row => ({
          id: row.id,
          word: row.word,
          one_line_desc: row.one_line_desc || 'No description',
          remark: row.remark || undefined
        }));
        resolve(words);
      });
    });
  }

  // Get word by ID, retrieve whole document
  getWord(wordId: string): Promise<WordDocument | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      this.db.get('SELECT data FROM documents WHERE id = ? AND type = ?', [wordId, 'word'], (err, row: { data: string } | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        console.debug('Word: ', row?.data);
        resolve(row ? JSON.parse(row.data) : null);
      });
    });
  }

  // Helper method to find word by name
  getWordByName(wordName: string): Promise<WordDocument | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      this.db.get(
        'SELECT data FROM documents WHERE type = ? AND json_extract(data, \'$.word\') = ?',
        ['word', wordName],
        (err, row: { data: string } | undefined) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row ? JSON.parse(row.data) : null);
        }
      );
    });
  }

  addWord(wordData: Omit<WordDocument, 'id' | 'created_at' | 'updated_at'>): Promise<WordDocument> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      try {
        // Check if word already exists
        const existingWord = await this.getWordByName(wordData.word);

        if (existingWord) {
          // Update existing word
          const updatedWord: WordDocument = {
            ...existingWord,
            ...wordData,
            updated_at: Utils.formatDate()
          };

          this.db.run(
            'UPDATE documents SET data = ?, updated_at = ? WHERE id = ?',
            [JSON.stringify(updatedWord), updatedWord.updated_at, existingWord.id],
            (err: any) => {
              if (err) {
                reject(err);
              } else {
                // Trigger word updated callback for auto-sync
                if (this.onWordUpdated) {
                  this.onWordUpdated(updatedWord);
                }
                resolve(updatedWord);
              }
            }
          );
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

          this.db.run(
            'INSERT INTO documents (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [id, 'word', JSON.stringify(wordDoc), now, now],
            (err: any) => {
              if (err) {
                reject(err);
              } else {
                // Trigger word added callback for auto-sync
                if (this.onWordAdded) {
                  this.onWordAdded(wordDoc);
                }
                resolve(wordDoc);
              }
            }
          );
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  updateWord(wordId: string, wordData: Partial<WordDocument>): Promise<WordDocument | null> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      try {
        const existing = await this.getWord(wordId);
        if (!existing) {
          resolve(null);
          return;
        }

        const updated: WordDocument = {
          ...existing,
          ...wordData,
          updated_at: new Date().toISOString()
        };

        // debug only the changed part:
        console.debug('Updating word: ', {
          ...wordData,
          updated_at: new Date().toISOString()
        });

        this.db.run(
          'UPDATE documents SET data = ?, updated_at = ? WHERE id = ?',
          [JSON.stringify(updated), updated.updated_at, wordId],
          (err: any) => {
            if (err) {
              reject(err);
            } else {
              // Trigger word updated callback for auto-sync
              if (this.onWordUpdated) {
                this.onWordUpdated(updated);
              }
              resolve(updated);
            }
          }
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  deleteWord(wordId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(false);
        return;
      }

      this.db.run('DELETE FROM documents WHERE id = ? AND type = ?', [wordId, 'word'], function (this: any, err: any) {
        if (err) {
          reject(err);
        } else {
          // Trigger word deleted callback for auto-sync
          if (this.onWordDeleted) {
            this.onWordDeleted(wordId);
          }
          resolve(this.changes > 0);
        }
      }.bind(this));
    });
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
        const totalResult = await new Promise<{ total: number }>((resolveCount, rejectCount) => {
          const countSql = `
            SELECT COUNT(*) as total
            FROM words_fts f
            WHERE words_fts MATCH ?
          `;

          this.db!.get(countSql, [ftsQuery], (err, row: { total: number } | undefined) => {
            if (err) {
              rejectCount(err);
              return;
            }
            resolveCount({ total: row?.total || 0 });
          });
        });

        // Then get paginated results
        const dataResult = await new Promise<{ id: string, word: string, one_line_desc: string, remark: string }[]>((resolveData, rejectData) => {
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

          this.db!.all(sql, params, (err, rows: { id: string, word: string, one_line_desc: string, remark: string }[]) => {
            if (err) {
              rejectData(err);
              return;
            }
            resolveData(rows);
          });
        });

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
        const totalResult = await new Promise<{ total: number }>((resolveCount, rejectCount) => {
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

          const params = [
            searchPattern, // word
            searchPattern, // tags
            searchPattern, // synonyms
            searchPattern, // antonyms
            searchPattern  // description (no details column anymore)
          ];

          this.db!.get(countSql, params, (err, row: { total: number } | undefined) => {
            if (err) {
              rejectCount(err);
              return;
            }
            resolveCount({ total: row?.total || 0 });
          });
        });

        // Get paginated results
        const dataResult = await new Promise<{ id: string, word: string, one_line_desc: string, remark: string }[]>((resolveData, rejectData) => {
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

          this.db!.all(sql, params, (err, rows: { id: string, word: string, one_line_desc: string, remark: string }[]) => {
            if (err) {
              rejectData(err);
              return;
            }
            resolveData(rows);
          });
        });

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

      this.db.get('SELECT data FROM documents WHERE type = ?', ['profile_config'], (err, row: { data: string } | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row ? JSON.parse(row.data) : null);
      });
    });
  }

  setProfileConfig(config: Omit<ProfileConfig, 'id'>): Promise<ProfileConfig> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const id = 'profile_config';
      const now = new Date().toISOString();

      const configDoc: ProfileConfig = {
        id,
        ...config,
        last_opened: now
      };

      this.db.run(
        'INSERT OR REPLACE INTO documents (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, 'profile_config', JSON.stringify(configDoc), now, now],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(configDoc);
          }
        }
      );
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        // Check if database is already closed or in a bad state
        try {
          this.db.close((err) => {
            this.db = null;
            if (err) {
              // Only log non-misuse errors, as SQLITE_MISUSE often means already closed
              if (!err.message.includes('SQLITE_MISUSE')) {
                console.error('Error closing database:', err);
              }
            }
            resolve();
          });
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
      // Close any existing connection
      if (this.db) {
        this.db.close((closeErr) => {
          if (closeErr) {
            console.error('Error closing existing database:', closeErr);
          }

          // Now open the new database
          this.dbPath = Utils.getDatabasePath(profileName);
          this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      } else {
        // No existing connection, just open the database
        this.dbPath = Utils.getDatabasePath(profileName);
        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
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
  getDatabase(): sqlite3.Database | null {
    return this.db;
  }

  /**
   * Validate if a database file is a valid EverEtch profile database
   * @param dbPath Path to the database file to validate
   * @returns Promise<boolean> True if valid, false otherwise
   */
  static async validateDatabaseFormat(dbPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err: any) => {
          if (err) {
            resolve(false);
            return;
          }

          // Check if required tables exist
          db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'", (err: any, row: any) => {
            if (err || !row) {
              db.close();
              resolve(false);
              return;
            }

            // Check if profile_config exists
            db.get("SELECT data FROM documents WHERE type='profile_config' LIMIT 1", (err: any, row: any) => {
              db.close();
              if (err || !row) {
                resolve(false);
              } else {
                resolve(true);
              }
            });
          });
        });
      } catch (error) {
        console.error('Error validating database:', error);
        resolve(false);
      }
    });
  }
}
