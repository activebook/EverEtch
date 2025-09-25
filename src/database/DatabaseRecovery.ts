import Database from 'better-sqlite3';

export class DatabaseRecovery {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create or update FTS table with intelligent migration handling
   */
  createOrUpdateFTSTable(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Check if FTS table exists and get its schema
      const tableResult = this.db.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='words_fts'
      `).get() as { sql: string } | undefined;

      // Check if all required triggers exist and have correct schemas
      const triggerRows = this.db.prepare(`
        SELECT name, sql FROM sqlite_master
        WHERE type='trigger' AND name IN ('words_fts_insert', 'words_fts_update', 'words_fts_delete')
      `).all() as { name: string, sql: string }[];

      const triggerResults: { [key: string]: string } = {};
      triggerRows.forEach(row => {
        triggerResults[row.name] = row.sql;
      });

      const expectedTableSchema = 'CREATE VIRTUAL TABLE words_fts USING fts5(id UNINDEXED, word, one_line_desc, tags, synonyms, antonyms, remark, tokenize = \'porter unicode61\')';

      const expectedTriggers = {
        words_fts_insert: `CREATE TRIGGER words_fts_insert AFTER INSERT ON documents
              WHEN NEW.type = 'word'
              BEGIN
                INSERT INTO words_fts(id, word, one_line_desc, tags, synonyms, antonyms, remark)
                VALUES (
                  NEW.id,
                  json_extract(NEW.data, '$.word'),
                  json_extract(NEW.data, '$.one_line_desc'),
                  json_extract(NEW.data, '$.tags'),
                  json_extract(NEW.data, '$.synonyms'),
                  json_extract(NEW.data, '$.antonyms'),
                  json_extract(NEW.data, '$.remark')
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
                  antonyms = json_extract(NEW.data, '$.antonyms'),
                  remark = json_extract(NEW.data, '$.remark')
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
        this.recreateFTSTableAndTriggers(); // ✅ Already handles trigger cleanup
        this.populateFTSTable();
      } else if (Object.keys(triggerResults).length === 0 || !triggersValid) {
        // Triggers exist but have incorrect schemas - fix them
        this.recreateFTSTriggers();
      } else {
        console.debug('FTS table and trigger schemas are correct, no migration needed');
        this.populateFTSTable();
      }

    } catch (error) {
      console.error('Error in FTS table migration:', error);
      throw error;
    }
  }

  /**
   * Drop all FTS triggers (safe cleanup)
   */
  private dropFTSTriggers(): void {
    const dropSql = `
      DROP TRIGGER IF EXISTS words_fts_insert;
      DROP TRIGGER IF EXISTS words_fts_update;
      DROP TRIGGER IF EXISTS words_fts_delete;
    `;

    try {
      this.db.exec(dropSql);
    } catch (error) {
      console.error('Error dropping FTS triggers:', error);
      // Continue anyway - triggers might not exist
    }
  }

  /**
   * Recreate FTS table and triggers when table schema is invalid
   */
  private recreateFTSTableAndTriggers(): void {
    console.debug('FTS table schema mismatch detected, recreating table and triggers...');

    const dropSql = `
      DROP TRIGGER IF EXISTS words_fts_insert;
      DROP TRIGGER IF EXISTS words_fts_update;
      DROP TRIGGER IF EXISTS words_fts_delete;
      DROP TABLE IF EXISTS words_fts;
    `;

    try {
      this.db.exec(dropSql);
    } catch (error) {
      console.error('Error dropping old FTS table/triggers:', error);
      // Continue anyway - triggers might not exist
    }

    const createSql = `
      CREATE VIRTUAL TABLE words_fts USING fts5(
        id UNINDEXED,
        word,
        one_line_desc,
        tags,
        synonyms,
        antonyms,
        remark,
        tokenize = 'porter unicode61'
      );

      -- Triggers to keep FTS table in sync
      CREATE TRIGGER words_fts_insert AFTER INSERT ON documents
      WHEN NEW.type = 'word'
      BEGIN
        INSERT INTO words_fts(id, word, one_line_desc, tags, synonyms, antonyms, remark)
        VALUES (
          NEW.id,
          json_extract(NEW.data, '$.word'),
          json_extract(NEW.data, '$.one_line_desc'),
          json_extract(NEW.data, '$.tags'),
          json_extract(NEW.data, '$.synonyms'),
          json_extract(NEW.data, '$.antonyms'),
          json_extract(NEW.data, '$.remark')
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
          antonyms = json_extract(NEW.data, '$.antonyms'),
          remark = json_extract(NEW.data, '$.remark')
        WHERE id = NEW.id;
      END;

      CREATE TRIGGER words_fts_delete AFTER DELETE ON documents
      WHEN OLD.type = 'word'
      BEGIN
        DELETE FROM words_fts WHERE id = OLD.id;
      END;
    `;

    try {
      this.db.exec(createSql);
      console.debug('FTS table and triggers recreated successfully');
    } catch (error) {
      console.error('Error recreating FTS table:', error);
      throw error;
    }
  }

  /**
   * Recreate only triggers when table is valid but triggers are invalid
   */
  private recreateFTSTriggers(): void {
    console.debug('FTS triggers schema mismatch detected, recreating only triggers...');

    // Drop only the triggers
    const dropTriggersSql = `
      DROP TRIGGER IF EXISTS words_fts_insert;
      DROP TRIGGER IF EXISTS words_fts_update;
      DROP TRIGGER IF EXISTS words_fts_delete;
    `;

    try {
      this.db.exec(dropTriggersSql);
    } catch (error) {
      console.error('Error dropping old triggers:', error);
      // Continue anyway - triggers might not exist
    }

    // Recreate only the triggers
    const createTriggersSql = `
      -- Triggers to keep FTS table in sync
      CREATE TRIGGER words_fts_insert AFTER INSERT ON documents
      WHEN NEW.type = 'word'
      BEGIN
        INSERT INTO words_fts(id, word, one_line_desc, tags, synonyms, antonyms, remark)
        VALUES (
          NEW.id,
          json_extract(NEW.data, '$.word'),
          json_extract(NEW.data, '$.one_line_desc'),
          json_extract(NEW.data, '$.tags'),
          json_extract(NEW.data, '$.synonyms'),
          json_extract(NEW.data, '$.antonyms'),
          json_extract(NEW.data, '$.remark')
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
          antonyms = json_extract(NEW.data, '$.antonyms'),
          remark = json_extract(NEW.data, '$.remark')
        WHERE id = NEW.id;
      END;

      CREATE TRIGGER words_fts_delete AFTER DELETE ON documents
      WHEN OLD.type = 'word'
      BEGIN
        DELETE FROM words_fts WHERE id = OLD.id;
      END;
    `;

    try {
      this.db.exec(createTriggersSql);
      console.debug('FTS triggers recreated successfully');
    } catch (error) {
      console.error('Error recreating triggers:', error);
      throw error;
    }

    // No need to repopulate - table data is already there
    console.debug('FTS triggers fixed, table data preserved');
  }

  /**
   * Populate FTS table with existing words (for migration)
   */
  private populateFTSTable(): void {
    if (!this.db) {
      return;
    }

    // Check if FTS table is empty
    const countResult = this.db.prepare('SELECT COUNT(*) as count FROM words_fts').get() as { count: number } | undefined;
    if (!countResult || countResult.count > 0) {
      return;
    }

    // Populate FTS table with existing words
    const sql = `
      INSERT INTO words_fts(id, word, one_line_desc, tags, synonyms, antonyms, remark)
      SELECT
        id,
        json_extract(data, '$.word'),
        json_extract(data, '$.one_line_desc'),
        json_extract(data, '$.tags'),
        json_extract(data, '$.synonyms'),
        json_extract(data, '$.antonyms'),
        json_extract(data, '$.remark')
      FROM documents
      WHERE type = 'word'
    `;

    try {
      this.db.exec(sql);
    } catch (error) {
      console.error('Error populating FTS table:', error);
    }
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
