import sqlite3 from 'sqlite3';
import { getDatabasePath, ensureDataDirectory, generateId, formatDate } from '../utils.js';

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
        CREATE INDEX IF NOT EXISTS idx_word_desc ON documents(json_extract(data, '$.one_line_desc')) WHERE type = 'word';
        CREATE INDEX IF NOT EXISTS idx_word_details ON documents(json_extract(data, '$.details')) WHERE type = 'word';

        -- Tag-specific indexes
        CREATE INDEX IF NOT EXISTS idx_tag_lookup ON documents(type, json_extract(data, '$.tag'));

        -- Full-text search virtual table for words
        CREATE VIRTUAL TABLE IF NOT EXISTS words_fts USING fts5(
          id UNINDEXED,
          word,
          one_line_desc,
          details,
          tags,
          tokenize = 'porter unicode61'
        );

        -- Triggers to keep FTS table in sync
        CREATE TRIGGER IF NOT EXISTS words_fts_insert AFTER INSERT ON documents
        WHEN NEW.type = 'word'
        BEGIN
          INSERT INTO words_fts(id, word, one_line_desc, details, tags)
          VALUES (
            NEW.id,
            json_extract(NEW.data, '$.word'),
            json_extract(NEW.data, '$.one_line_desc'),
            json_extract(NEW.data, '$.details'),
            json_extract(NEW.data, '$.tags')
          );
        END;

        CREATE TRIGGER IF NOT EXISTS words_fts_update AFTER UPDATE ON documents
        WHEN NEW.type = 'word'
        BEGIN
          UPDATE words_fts SET
            word = json_extract(NEW.data, '$.word'),
            one_line_desc = json_extract(NEW.data, '$.one_line_desc'),
            details = json_extract(NEW.data, '$.details'),
            tags = json_extract(NEW.data, '$.tags')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS words_fts_delete AFTER DELETE ON documents
        WHEN OLD.type = 'word'
        BEGIN
          DELETE FROM words_fts WHERE id = OLD.id;
        END;
      `;

      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          // Populate FTS table for existing words if it's empty
          this.populateFTSTable().then(resolve).catch(reject);
        }
      });
    });
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
          INSERT INTO words_fts(id, word, one_line_desc, details, tags)
          SELECT
            id,
            json_extract(data, '$.word'),
            json_extract(data, '$.one_line_desc'),
            json_extract(data, '$.details'),
            json_extract(data, '$.tags')
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

  // Word operations
  getWords(): Promise<WordDocument[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      this.db.all('SELECT data FROM documents WHERE type = ?', ['word'], (err, rows: { data: string }[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map(row => JSON.parse(row.data)));
      });
    });
  }

  // Paginated word loading for lazy loading
  getWordsPaginated(offset: number, limit: number): Promise<{words: WordDocument[], hasMore: boolean, total: number}> {
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

        // Get paginated data using indexes (guaranteed optimization)
        const dataResult = await new Promise<{ data: string }[]>((resolveData, rejectData) => {
          const query = `
            SELECT data FROM documents
            WHERE type = 'word'
            ORDER BY updated_at DESC, created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `;

          this.db!.all(query, (err, rows: { data: string }[]) => {
            if (err) {
              rejectData(err);
              return;
            }
            resolveData(rows);
          });
        });

        const words = dataResult.map(row => JSON.parse(row.data));
        const total = totalResult.total;
        const hasMore = offset + limit < total;

        resolve({words, hasMore, total});
      } catch (err) {
        reject(err);
      }
    });
  }

  searchWords(query: string): Promise<WordDocument[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      // Use LIKE for reliable substring search in word field only
      const sql = `
        SELECT data FROM documents
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

      this.db.all(sql, [searchPattern, prefixPattern], (err, rows: { data: string }[]) => {
        if (err) {
          reject(err);
          return;
        }

        const words = rows.map(row => JSON.parse(row.data));
        resolve(words);
      });
    });
  }

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

  // Tag operations
  getAssociatedWords(tag: string): Promise<WordDocument[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      // Use json_each for efficient array searching with case-insensitive comparison
      const sql = `
        SELECT DISTINCT d.data
        FROM documents d, json_each(d.data, '$.tags') as t
        WHERE d.type = 'word' AND LOWER(t.value) = LOWER(?)
        ORDER BY json_extract(d.data, '$.word')
      `;

      this.db.all(sql, [tag], (err, rows: { data: string }[]) => {
        if (err) {
          // Fallback to LIKE search if json_each fails
          console.warn('JSON array search failed, falling back to LIKE search:', err);
          this.fallbackGetAssociatedWords(tag).then(resolve).catch(reject);
          return;
        }
        resolve(rows.map(row => JSON.parse(row.data)));
      });
    });
  }

  /**
   * Fallback method for tag search using LIKE with case-insensitive comparison
   */
  private fallbackGetAssociatedWords(tag: string): Promise<WordDocument[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      this.db.all(
        `SELECT data FROM documents WHERE type = 'word' AND LOWER(json_extract(data, '$.tags')) LIKE LOWER(?) ORDER BY json_extract(data, '$.word')`,
        [`%${tag}%`],
        (err, rows: { data: string }[]) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows.map(row => JSON.parse(row.data)));
        }
      );
    });
  }

  // Paginated associated words loading for lazy loading
  getAssociatedWordsPaginated(tag: string, offset: number, limit: number): Promise<{words: WordDocument[], hasMore: boolean, total: number}> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve({words: [], hasMore: false, total: 0});
        return;
      }

      // Use json_each for efficient array searching with pagination and case-insensitive comparison
      const query = `
        SELECT DISTINCT d.data, COUNT(*) OVER() as total_count
        FROM documents d, json_each(d.data, '$.tags') as t
        WHERE d.type = 'word' AND LOWER(t.value) = LOWER(?)
        ORDER BY json_extract(d.data, '$.word')
        LIMIT ${limit} OFFSET ${offset}
      `;

      this.db!.all(query, [tag], (err, rows: { data: string, total_count: number }[]) => {
        if (err) {
          // Fallback to LIKE search if json_each fails
          console.warn('JSON array search failed, falling back to LIKE search:', err);
          this.fallbackGetAssociatedWordsPaginated(tag, offset, limit).then(resolve).catch(reject);
          return;
        }

        const words = rows.map(row => JSON.parse(row.data));
        const total = rows.length > 0 ? rows[0].total_count : 0;
        const hasMore = offset + limit < total;

        resolve({words, hasMore, total});
      });
    });
  }

  /**
   * Fallback method for paginated tag search using LIKE with case-insensitive comparison
   */
  private fallbackGetAssociatedWordsPaginated(tag: string, offset: number, limit: number): Promise<{words: WordDocument[], hasMore: boolean, total: number}> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve({words: [], hasMore: false, total: 0});
        return;
      }

      // Get paginated results with total count in one query
      const query = `
        SELECT data, COUNT(*) OVER() as total_count
        FROM documents
        WHERE type = 'word' AND LOWER(json_extract(data, '$.tags')) LIKE LOWER(?)
        ORDER BY json_extract(data, '$.word')
        LIMIT ${limit} OFFSET ${offset}
      `;

      this.db!.all(query, [`%${tag}%`], (err, rows: { data: string, total_count: number }[]) => {
        if (err) {
          reject(err);
          return;
        }

        const words = rows.map(row => JSON.parse(row.data));
        const total = rows.length > 0 ? rows[0].total_count : 0;
        const hasMore = offset + limit < total;

        resolve({words, hasMore, total});
      });
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
