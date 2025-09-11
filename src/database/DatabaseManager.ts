import sqlite3 from 'sqlite3';
import { getDatabasePath, ensureDataDirectory, generateId, formatDate } from '../utils/utils.js';

export interface WordDocument {
  id: string;
  word: string;
  one_line_desc: string;
  details: string;
  tags: string[];
  tag_colors: Record<string, string>;
  synonyms: string[];
  antonyms: string[];
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
  last_opened: string;
}

export class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private dbPath: string = '';

  constructor() {}

  initialize(profileName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ensureDataDirectory();
      this.dbPath = getDatabasePath(profileName);
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.createTables().then(resolve).catch(reject);
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
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      // Check if FTS table exists and get its schema
      this.db.get(`
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='words_fts'
      `, (err, row: { sql: string } | undefined) => {
        if (err) {
          reject(err);
          return;
        }

        const expectedSchema = 'CREATE VIRTUAL TABLE words_fts USING fts5(id UNINDEXED, word, one_line_desc, tags, synonyms, antonyms, tokenize = \'porter unicode61\')';
        const currentSchema = row?.sql;

        // If table doesn't exist or schema doesn't match, recreate it
        if (!row || !this.schemasMatch(currentSchema, expectedSchema)) {
          console.debug('FTS table schema mismatch detected, recreating...');
          console.debug('Current schema:', currentSchema);
          console.debug('Expected schema:', expectedSchema);

          // Drop existing table and triggers
          const dropSql = `
            DROP TRIGGER IF EXISTS words_fts_insert;
            DROP TRIGGER IF EXISTS words_fts_update;
            DROP TRIGGER IF EXISTS words_fts_delete;
            DROP TABLE IF EXISTS words_fts;
          `;

          this.db!.exec(dropSql, (dropErr) => {
            if (dropErr) {
              console.error('Error dropping old FTS table/triggers:', dropErr);
              // Continue anyway - triggers might not exist
            }

            // Create new FTS table with correct schema
            const createSql = `
              CREATE VIRTUAL TABLE words_fts USING fts5(
                id UNINDEXED,
                word,
                one_line_desc,
                tags,
                synonyms,
                antonyms,
                tokenize = 'porter unicode61'
              );

              -- Triggers to keep FTS table in sync
              CREATE TRIGGER words_fts_insert AFTER INSERT ON documents
              WHEN NEW.type = 'word'
              BEGIN
                INSERT INTO words_fts(id, word, one_line_desc, tags, synonyms, antonyms)
                VALUES (
                  NEW.id,
                  json_extract(NEW.data, '$.word'),
                  json_extract(NEW.data, '$.one_line_desc'),
                  json_extract(NEW.data, '$.tags'),
                  json_extract(NEW.data, '$.synonyms'),
                  json_extract(NEW.data, '$.antonyms')
                );
              END;

              CREATE TRIGGER words_fts_update AFTER UPDATE ON documents
              WHEN NEW.type = 'word'
              BEGIN
                UPDATE words_fts SET
                  word = json_extract(NEW.data, '$.word'),
                  one_line_desc = json_extract(NEW.data, '$.one_line_desc'),
                  tags = json_extract(NEW.data, '$.tags'),
                  synonyms = json_extract(NEW.data, '$.synonyms'),
                  antonyms = json_extract(NEW.data, '$.antonyms')
                WHERE id = NEW.id;
              END;

              CREATE TRIGGER words_fts_delete AFTER DELETE ON documents
              WHEN OLD.type = 'word'
              BEGIN
                DELETE FROM words_fts WHERE id = OLD.id;
              END;
            `;

            this.db!.exec(createSql, (createErr) => {
              if (createErr) {
                console.error('Error creating new FTS table:', createErr);
                reject(createErr);
              } else {
                console.debug('FTS table created successfully with correct schema');
                // Populate FTS table with existing data
                this.populateFTSTable().then(() => {
                  console.debug('FTS table populated successfully');
                  resolve();
                }).catch(reject);
              }
            });
          });
        } else {
          console.debug('FTS table schema is correct, no migration needed');
          // Schema matches, just populate if needed
          this.populateFTSTable().then(resolve).catch(reject);
        }
      });
    });
  }

  private schemasMatch(current: string | undefined, expected: string): boolean {
    if (!current) return false;

    // Normalize both schemas for comparison
    const normalize = (sql: string) => {
      return sql
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .replace(/\s*\(\s*/g, '(')  // Remove spaces around parentheses
        .replace(/\s*\)\s*/g, ')')
        .replace(/\s*,\s*/g, ',')  // Remove spaces around commas
        .trim()
        .toLowerCase();
    };

    return normalize(current) === normalize(expected);
  }

  /**
   * Populate FTS table with existing words (for migration)
   */
  private populateFTSTable(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      // Check if FTS table is empty
      this.db.get('SELECT COUNT(*) as count FROM words_fts', (err, row: { count: number } | undefined) => {
        if (err || (row && row.count > 0)) {
          resolve();
          return;
        }

        // Populate FTS table with existing words
        const sql = `
          INSERT INTO words_fts(id, word, one_line_desc, tags, synonyms, antonyms)
          SELECT
            id,
            json_extract(data, '$.word'),
            json_extract(data, '$.one_line_desc'),
            json_extract(data, '$.tags'),
            json_extract(data, '$.synonyms'),
            json_extract(data, '$.antonyms')
          FROM documents
          WHERE type = 'word'
        `;

        this.db!.run(sql, (err) => {
          if (err) {
            console.error('Error populating FTS table:', err);
          }
          resolve();
        });
      });
    });
  }

  // Paginated word loading for lazy loading - optimized to only fetch required fields
  getWordsPaginated(offset: number, limit: number): Promise<{words: WordListItem[], hasMore: boolean, total: number}> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) {
        resolve({words: [], hasMore: false, total: 0});
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
        const dataResult = await new Promise<{ id: string, word: string, one_line_desc: string }[]>((resolveData, rejectData) => {
          const query = `
            SELECT
              id,
              json_extract(data, '$.word') as word,
              json_extract(data, '$.one_line_desc') as one_line_desc
            FROM documents
            WHERE type = 'word'
            ORDER BY created_at DESC, updated_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `;

          this.db!.all(query, (err, rows: { id: string, word: string, one_line_desc: string }[]) => {
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
          one_line_desc: row.one_line_desc || 'No description'
        }));
        const total = totalResult.total;
        const hasMore = offset + limit < total;

        resolve({words, hasMore, total});
      } catch (err) {
        reject(err);
      }
    });
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
          json_extract(data, '$.one_line_desc') as one_line_desc
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

      this.db.all(sql, [searchPattern, prefixPattern], (err, rows: { id: string, word: string, one_line_desc: string }[]) => {
        if (err) {
          reject(err);
          return;
        }

        const words: WordListItem[] = rows.map(row => ({
          id: row.id,
          word: row.word,
          one_line_desc: row.one_line_desc || 'No description'
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
            updated_at: formatDate()
          };

          this.db.run(
            'UPDATE documents SET data = ?, updated_at = ? WHERE id = ?',
            [JSON.stringify(updatedWord), updatedWord.updated_at, existingWord.id],
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve(updatedWord);
              }
            }
          );
        } else {
          // Create new word
          const id = generateId('word');
          const now = formatDate();

          const wordDoc: WordDocument = {
            id,
            ...wordData,
            created_at: now,
            updated_at: now
          };

          this.db.run(
            'INSERT INTO documents (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [id, 'word', JSON.stringify(wordDoc), now, now],
            function(err) {
              if (err) {
                reject(err);
              } else {
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

        this.db.run(
          'UPDATE documents SET data = ?, updated_at = ? WHERE id = ?',
          [JSON.stringify(updated), updated.updated_at, wordId],
          function(err) {
            if (err) {
              reject(err);
            } else {
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

      this.db.run('DELETE FROM documents WHERE id = ? AND type = ?', [wordId, 'word'], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  // Unified paginated related words search using FTS5 - replaces getAssociatedWordsPaginated
  getRelatedWordsPaginated(searchTerm: string, offset: number, limit: number): Promise<{words: WordListItem[], hasMore: boolean, total: number}> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) {
        resolve({words: [], hasMore: false, total: 0});
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
        const dataResult = await new Promise<{ id: string, word: string, one_line_desc: string }[]>((resolveData, rejectData) => {
          const sql = `
            SELECT
              f.id,
              f.word,
              f.one_line_desc
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

          this.db!.all(sql, params, (err, rows: { id: string, word: string, one_line_desc: string }[]) => {
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
          one_line_desc: row.one_line_desc || 'No description'
        }));

        const total = totalResult.total;
        const hasMore = offset + limit < total;

        resolve({words, hasMore, total});

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
  private fallbackGetRelatedWordsPaginated(searchTerm: string, offset: number, limit: number): Promise<{words: WordListItem[], hasMore: boolean, total: number}> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) {
        resolve({words: [], hasMore: false, total: 0});
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
        const dataResult = await new Promise<{ id: string, word: string, one_line_desc: string }[]>((resolveData, rejectData) => {
          const sql = `
            SELECT DISTINCT
              id,
              json_extract(data, '$.word') as word,
              json_extract(data, '$.one_line_desc') as one_line_desc
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

          this.db!.all(sql, params, (err, rows: { id: string, word: string, one_line_desc: string }[]) => {
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
          one_line_desc: row.one_line_desc || 'No description'
        }));

        const total = totalResult.total;
        const hasMore = offset + limit < total;

        resolve({words, hasMore, total});

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
        function(err) {
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
        this.db.close((err) => {
          this.db = null;
          if (err) {
            console.error('Error closing database:', err);
          }
          resolve();
        });
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
          this.dbPath = getDatabasePath(profileName);
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
        this.dbPath = getDatabasePath(profileName);
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
