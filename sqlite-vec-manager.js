import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

/**
 * SQLite Vector Database Manager
 * Utility for managing sqlite-vec databases
 */
export class SqliteVecManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Open the database connection and load sqlite-vec extension
   */
  open() {
    if (!this.dbPath) {
      throw new Error('Database path is required');
    }

    try {
      // Open database connection
      this.db = new Database(this.dbPath);

      // Load sqlite-vec extension
      sqliteVec.load(this.db);
      console.log('✅ sqlite-vec extension loaded successfully');
      console.log(`📁 Database opened: ${this.dbPath}`);
    } catch (error) {
      console.error('❌ Error opening database:', error);
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('✅ Database connection closed');
    }
  }

  /**
   * Clear all embeddings from the word_embeddings table
   */
  clearup() {
    if (!this.db) {
      throw new Error('Database not opened. Call open() first.');
    }

    try {
      console.log('🧹 Clearing all embeddings...');

      // Delete all records from word_embeddings table
      const result = this.db.prepare('DELETE FROM word_embeddings').run();

      console.log(`✅ Cleared ${result.changes} embeddings from database`);
      return result.changes;
    } catch (error) {
      console.error('❌ Error clearing embeddings:', error);
      throw error;
    }
  }

  /**
   * Get all word_id and model_used information from word_embeddings table
   */
  allinfo() {
    if (!this.db) {
      throw new Error('Database not opened. Call open() first.');
    }

    try {
      console.log('📋 Getting all embedding information...');

      // Select all word_id and model_used from word_embeddings
      const rows = this.db.prepare('SELECT word_id, model_used FROM word_embeddings').all();

      console.log(`📊 Found ${rows.length} embeddings:`);

      if (rows.length > 0) {
        rows.forEach((row, index) => {
          console.log(`   ${index + 1}. word_id: ${row.word_id}, model: ${row.model_used}`);
        });
      } else {
        console.log('   No embeddings found');
      }

      return rows;
    } catch (error) {
      console.error('❌ Error getting embedding information:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  getStats() {
    if (!this.db) {
      throw new Error('Database not opened. Call open() first.');
    }

    try {
      console.log('📈 Getting database statistics...');

      // Get total count of embeddings
      const totalResult = this.db.prepare('SELECT COUNT(*) as total FROM word_embeddings').get();
      const totalEmbeddings = totalResult.total;

      // Get unique models used
      const modelsResult = this.db.prepare('SELECT DISTINCT model_used FROM word_embeddings').all();
      const uniqueModels = modelsResult.map(row => row.model_used);

      // Get embeddings per model
      const perModelResult = this.db.prepare(`
        SELECT model_used, COUNT(*) as count
        FROM word_embeddings
        GROUP BY model_used
      `).all();

      console.log(`📊 Total embeddings: ${totalEmbeddings}`);
      console.log(`🤖 Unique models: ${uniqueModels.length}`);
      console.log('📋 Embeddings per model:');
      perModelResult.forEach(row => {
        console.log(`   ${row.model_used}: ${row.count}`);
      });

      return {
        totalEmbeddings,
        uniqueModels,
        perModel: perModelResult
      };
    } catch (error) {
      console.error('❌ Error getting database statistics:', error);
      throw error;
    }
  }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node sqlite-vec-manager.js <database-path> <command>');
    console.log('');
    console.log('Commands:');
    console.log('  clearup  - Clear all embeddings from word_embeddings table');
    console.log('  allinfo  - Show all word_id and model_used information');
    console.log('  stats    - Show database statistics');
    console.log('');
    console.log('Example:');
    console.log('  node sqlite-vec-manager.js ./my-vectors.db clearup');
    process.exit(1);
  }

  const dbPath = args[0];
  const command = args[1];

  const manager = new SqliteVecManager(dbPath);

  try {
    manager.open();

    switch (command) {
      case 'clearup':
        manager.clearup();
        break;
      case 'allinfo':
        manager.allinfo();
        break;
      case 'stats':
        manager.getStats();
        break;
      default:
        console.log(`❌ Unknown command: ${command}`);
        console.log('Available commands: clearup, allinfo, stats');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    manager.close();
  }
}

/*

# Clear all embeddings
node sqlite-vec-manager.js ./your-database.db clearup

# Show all information
node sqlite-vec-manager.js ./your-database.db allinfo

# Show statistics
node sqlite-vec-manager.js ./your-database.db stats

# Install sqlite-vec
sqlite3 ./your-database.db
.load /Users/mac/Github/EverEtch/node_modules/sqlite-vec-darwin-x64/vec0.dylib

-- Check vector properties using sqlite-vec functions
SELECT 
  word_id,
  model_used,
  vec_length(embedding) as vector_dimensions
FROM word_embeddings 
LIMIT 5;

-- See the actual float values (sqlite-vec format)
SELECT 
  word_id,
  model_used,
  vec_to_json(embedding) as json_embedding  -- Convert to JSON for viewing
FROM word_embeddings 
ORDER BY word_id
LIMIT 1;

-- Get vector statistics
SELECT 
  COUNT(*) as total_vectors,
  AVG(vec_length(embedding)) as avg_dimensions,
  MIN(vec_length(embedding)) as min_dimensions,
  MAX(vec_length(embedding)) as max_dimensions
FROM word_embeddings;

*The key insight: sqlite-vec stores embeddings in optimized binary format,
not JSON strings. Use vec_to_json() to convert them to readable format!

-- Export to a file for analysis
.output embeddings_dump.txt -- output to file

SELECT word_id, model_used, vec_to_json(embedding) as json_embedding FROM word_embeddings LIMIT 10;

.output stdout -- redirect back to stdout



sqlite3 compile error:
NODE_MODULE_VERSION 127. This version of Node.js requires
NODE_MODULE_VERSION 136. Please try re-compiling or re-installing
the module (for instance, using `npm rebuild` or `npm install`).

npm rebuild better-sqlite3 --runtime=electron --target=37.6.0 --dist-url=https://electronjs.org/headers


*/