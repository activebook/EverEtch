import sqlite3 from 'sqlite3';

export class DatabaseRecovery {
  private db: sqlite3.Database | null = null;

  constructor(db: sqlite3.Database) {
    this.db = db;
  }

  /**
   * Create or update FTS table with intelligent migration handling
   */
  async createOrUpdateFTSTable(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Check if FTS table exists and get its schema
      const tableResult = await new Promise<{ sql: string } | undefined>((resolveTable, rejectTable) => {
        this.db!.get(`
          SELECT sql FROM sqlite_master
          WHERE type='table' AND name='words_fts'
        `, (err, row: { sql: string } | undefined) => {
          if (err) {
            rejectTable(err);
            return;
          }
          resolveTable(row);
        });
      });

      // Check if all required triggers exist and have correct schemas
      const triggerResults = await new Promise<{ [key: string]: string }>((resolveTriggers, rejectTriggers) => {
        this.db!.all(`
          SELECT name, sql FROM sqlite_master
          WHERE type='trigger' AND name IN ('words_fts_insert', 'words_fts_update', 'words_fts_delete')
        `, (err, rows: { name: string, sql: string }[]) => {
          if (err) {
            rejectTriggers(err);
            return;
          }

          const triggers: { [key: string]: string } = {};
          rows.forEach(row => {
            triggers[row.name] = row.sql;
          });
          resolveTriggers(triggers);
        });
      });

      const expectedTableSchema = 'CREATE VIRTUAL TABLE words_fts USING fts5(id UNINDEXED, word, one_line_desc, tags, synonyms, antonyms, tokenize = \'porter unicode61\')';

      const expectedTriggers = {
        words_fts_insert: `CREATE TRIGGER words_fts_insert AFTER INSERT ON documents
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
              END`,
        words_fts_update: `CREATE TRIGGER words_fts_update AFTER UPDATE ON documents
              WHEN NEW.type = 'word'
              BEGIN
                UPDATE words_fts SET
                  word = json_extract(NEW.data, '$.word'),
                  one_line_desc = json_extract(NEW.data, '$.one_line_desc'),
                  tags = json_extract(NEW.data, '$.tags'),
                  synonyms = json_extract(NEW.data, '$.synonyms'),
                  antonyms = json_extract(NEW.data, '$.antonyms')
                WHERE id = NEW.id;
              END`,
        words_fts_delete: `CREATE TRIGGER words_fts_delete AFTER DELETE ON documents
              WHEN OLD.type = 'word'
              BEGIN
                DELETE FROM words_fts WHERE id = OLD.id;
              END`
      };

      const currentTableSchema = tableResult?.sql;
      const tableSchemaValid = tableResult && this.schemasMatch(currentTableSchema, expectedTableSchema);

      // Check if all triggers exist and have correct schemas
      const triggersValid = Object.keys(expectedTriggers).every(triggerName => {
        const currentTrigger = triggerResults[triggerName as keyof typeof triggerResults];
        const expectedTrigger = expectedTriggers[triggerName as keyof typeof expectedTriggers];
        return currentTrigger && this.schemasMatch(currentTrigger, expectedTrigger);
      });

      // Handle different migration scenarios intelligently
      if (!tableResult || !tableSchemaValid) {
        // Table exists but schema is incorrect - clean everything and recreate
        await this.recreateFTSTableAndTriggers(); // ✅ Already handles trigger cleanup
        await this.populateFTSTable();
      } else if (Object.keys(triggerResults).length === 0 || !triggersValid) {
        // Triggers exist but have incorrect schemas - fix them
        await this.recreateFTSTriggers();
      } else {
        console.debug('FTS table and trigger schemas are correct, no migration needed');
        await this.populateFTSTable();
      }

    } catch (error) {
      console.error('Error in FTS table migration:', error);
      throw error;
    }
  }

  /**
   * Drop all FTS triggers (safe cleanup)
   */
  private async dropFTSTriggers(): Promise<void> {
    const dropSql = `
      DROP TRIGGER IF EXISTS words_fts_insert;
      DROP TRIGGER IF EXISTS words_fts_update;
      DROP TRIGGER IF EXISTS words_fts_delete;
    `;

    await new Promise<void>((resolveDrop, rejectDrop) => {
      this.db!.exec(dropSql, (dropErr) => {
        if (dropErr) {
          console.error('Error dropping FTS triggers:', dropErr);
          // Continue anyway - triggers might not exist
        }
        resolveDrop();
      });
    });
  }

  /**
   * Create FTS table and triggers for the first time
   */
  private async createFTSTableAndTriggers(): Promise<void> {
    console.debug('FTS table does not exist, creating...');

    // Clean up any orphaned triggers first
    await this.dropFTSTriggers();

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

    await new Promise<void>((resolveCreate, rejectCreate) => {
      this.db!.exec(createSql, (createErr) => {
        if (createErr) {
          console.error('Error creating FTS table:', createErr);
          rejectCreate(createErr);
        } else {
          console.debug('FTS table and triggers created successfully');
          resolveCreate();
        }
      });
    });
  }

  /**
   * Recreate FTS table and triggers when table schema is invalid
   */
  private async recreateFTSTableAndTriggers(): Promise<void> {
    console.debug('FTS table schema mismatch detected, recreating table and triggers...');

    const dropSql = `
      DROP TRIGGER IF EXISTS words_fts_insert;
      DROP TRIGGER IF EXISTS words_fts_update;
      DROP TRIGGER IF EXISTS words_fts_delete;
      DROP TABLE IF EXISTS words_fts;
    `;

    await new Promise<void>((resolveDrop, rejectDrop) => {
      this.db!.exec(dropSql, (dropErr) => {
        if (dropErr) {
          console.error('Error dropping old FTS table/triggers:', dropErr);
          // Continue anyway - triggers might not exist
        }
        resolveDrop();
      });
    });

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

    await new Promise<void>((resolveCreate, rejectCreate) => {
      this.db!.exec(createSql, (createErr) => {
        if (createErr) {
          console.error('Error recreating FTS table:', createErr);
          rejectCreate(createErr);
        } else {
          console.debug('FTS table and triggers recreated successfully');
          resolveCreate();
        }
      });
    });
  }

  /**
   * Recreate only triggers when table is valid but triggers are invalid
   */
  private async recreateFTSTriggers(): Promise<void> {
    console.debug('FTS triggers schema mismatch detected, recreating only triggers...');

    // Drop only the triggers
    const dropTriggersSql = `
      DROP TRIGGER IF EXISTS words_fts_insert;
      DROP TRIGGER IF EXISTS words_fts_update;
      DROP TRIGGER IF EXISTS words_fts_delete;
    `;

    await new Promise<void>((resolveDrop, rejectDrop) => {
      this.db!.exec(dropTriggersSql, (dropErr) => {
        if (dropErr) {
          console.error('Error dropping old triggers:', dropErr);
          // Continue anyway - triggers might not exist
        }
        resolveDrop();
      });
    });

    // Recreate only the triggers
    const createTriggersSql = `
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

    await new Promise<void>((resolveCreate, rejectCreate) => {
      this.db!.exec(createTriggersSql, (createErr) => {
        if (createErr) {
          console.error('Error recreating triggers:', createErr);
          rejectCreate(createErr);
        } else {
          console.debug('FTS triggers recreated successfully');
          resolveCreate();
        }
      });
    });

    // No need to repopulate - table data is already there
    console.debug('FTS triggers fixed, table data preserved');
  }

  /**
   * Populate FTS table with existing words (for migration)
   */
  private async populateFTSTable(): Promise<void> {
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

  /**
   * Check if two SQL schemas match (normalized comparison)
   */
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
}
