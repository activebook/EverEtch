import { DatabaseManager } from '../../database/DatabaseManager.js';
import { getDatabasePath } from '../../utils/utils.js';
import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseFileInfo {
  profileName: string;
  filePath: string;
  fileSize: number;
  lastModified: Date;
}

export class GoogleDriveExportService {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Get information about the current profile's database file
   */
  getCurrentDatabaseFileInfo(profileName: string): DatabaseFileInfo | null {
    try {
      const filePath = getDatabasePath(profileName);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      return {
        profileName: profileName,
        filePath: filePath,
        fileSize: stats.size,
        lastModified: stats.mtime
      };
    } catch (error) {
      console.error('Failed to get database file info:', error);
      return null;
    }
  }

  /**
   * Read the database file as a buffer for upload
   */
  readDatabaseFile(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          reject(new Error(`Failed to read database file: ${err.message}`));
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Write database file from buffer (for download)
   */
  writeDatabaseFile(filePath: string, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, data, (err) => {
        if (err) {
          reject(new Error(`Failed to write database file: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Generate filename for Google Drive upload
   */
  generateFileName(profileName: string): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return `EverEtch_${profileName}_${timestamp}.db`;
  }

  /**
   * Validate if a downloaded file is a valid EverEtch database
   */
  async validateDownloadedDatabase(filePath: string): Promise<boolean> {
    try {
      return await DatabaseManager.validateDatabaseFormat(filePath);
    } catch (error) {
      console.error('Failed to validate downloaded database:', error);
      return false;
    }
  }

  /**
   * Get file size in human readable format
   */
  formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
