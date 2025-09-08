import sqlite3 from 'sqlite3';
import { getDatabasePath, ensureDataDirectory, generateId, formatDate } from '../utils.js';

export interface WordDocument {
  id: string;
  word: string;
  one_line_desc: string;
  details: string;
  tags: string[];
  tag_colors: Record<string, string>;
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

        CREATE INDEX IF NOT EXISTS idx_type ON documents(type);
        CREATE INDEX IF NOT EXISTS idx_word_lookup ON documents(type, json_extract(data, '$.word'));
        CREATE INDEX IF NOT EXISTS idx_tag_lookup ON documents(type, json_extract(data, '$.tag'));
      `;

      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
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

  searchWords(query: string): Promise<WordDocument[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      // First, search for words starting with query
      if (!this.db) {
        resolve([]);
        return;
      }

      this.db.all(
        `SELECT data FROM documents WHERE type = 'word' AND json_extract(data, '$.word') LIKE ? ORDER BY json_extract(data, '$.word') LIMIT 5`,
        [`${query}%`],
        (err, startsWith: { data: string }[]) => {
          if (err) {
            reject(err);
            return;
          }

          if (startsWith.length >= 5) {
            resolve(startsWith.map(row => JSON.parse(row.data)));
            return;
          }

          // If less than 5, also search for words containing the query
          if (!this.db) {
            resolve(startsWith.map(row => JSON.parse(row.data)));
            return;
          }

          this.db.all(
            `SELECT data FROM documents WHERE type = 'word' AND json_extract(data, '$.word') LIKE ? ORDER BY json_extract(data, '$.word') LIMIT ?`,
            [`%${query}%`, 5 - startsWith.length],
            (err, contains: { data: string }[]) => {
              if (err) {
                reject(err);
                return;
              }

              const allResults = [...startsWith, ...contains];
              resolve(allResults.map(row => JSON.parse(row.data)));
            }
          );
        }
      );
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

  addWord(wordData: Omit<WordDocument, 'id' | 'created_at' | 'updated_at'>): Promise<WordDocument> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

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

      this.db.all(
        `SELECT data FROM documents WHERE type = 'word' AND json_extract(data, '$.tags') LIKE ? ORDER BY json_extract(data, '$.word')`,
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
}
