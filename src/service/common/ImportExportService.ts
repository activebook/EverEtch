import { DatabaseManager } from '../../database/DatabaseManager.js';
import { ProfileManager } from '../../database/ProfileManager.js';
import { Utils } from '../../utils/Utils.js';
import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseFileInfo {
  profileName: string;
  filePath: string;
  fileSize: number;
  lastModified: Date;
}

export interface ExportResult {
  success: boolean;
  message: string;
  filePath?: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  profileName?: string;
}

export interface UploadData {
  success: boolean;
  fileBuffer?: Buffer;
  fileName?: string;
  message: string;
}

export class ImportExportService {
  private dbManager: DatabaseManager;
  private profileManager: ProfileManager;

  constructor(dbManager: DatabaseManager, profileManager: ProfileManager) {
    this.dbManager = dbManager;
    this.profileManager = profileManager;
  }

  /**
   * Get information about the current profile's database file
   */
  getCurrentDatabaseFileInfo(profileName: string): DatabaseFileInfo | null {
    try {
      const filePath = Utils.getDatabasePath(profileName);

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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;
    return `${profileName}_${timestamp}.db`;
  }

  /**
   * Extract profile name from EverEtch database filename
   */
  parseProfileName(fileName: string): string {
    // Match pattern: {profileName}_{YYYYMMDD-hhmmss}.db
    const profileNameMatch = fileName.match(/^(.+?)_\d{8}-\d{6}\.db$/);
    return profileNameMatch ? profileNameMatch[1] : 'Default';
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

  /**
    * Export current profile to a file
    */
  exportProfileToLocal(targetPath: string): ExportResult {
    try {
      const currentProfile = this.profileManager.getLastOpenedProfile();
      if (!currentProfile) {
        throw new Error('No current profile selected');
      }

      // Get source database path
      const sourcePath = Utils.getDatabasePath(currentProfile);

      // Ensure source database exists
      if (!fs.existsSync(sourcePath)) {
        throw new Error('Current profile database not found');
      }

      console.debug(`📁 Source path: ${sourcePath}`);
      console.debug(`📁 Target path: ${targetPath}`);

      // Flush database to disk to ensure all changes are persisted before export
      console.debug(`🔄 Flushing database to disk before export...`);
      this.dbManager.flushToDisk();

      // Copy the database file
      fs.copyFileSync(sourcePath, targetPath);
      return {
        success: true,
        message: `Profile "${currentProfile}" exported successfully to ${targetPath}`,
        filePath: targetPath
      };

    } catch (error) {
      console.error('❌ Error exporting profile:', error);
      return {
        success: false,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Update profile configuration inside the current database
   */
  private updateProfileConfigInDatabase(profileName: string, originalName: string): void {
    if (profileName !== originalName) {
      console.log(`🔄 Updating profile config inside database: "${originalName}" → "${profileName}"`);

      try {
        // Get the current profile config from the active database
        const currentConfig = this.dbManager.getProfileConfig();
        if (currentConfig) {
          // Update the profile name in the config
          currentConfig.name = profileName;
          currentConfig.last_opened = new Date().toISOString();

          // Save the updated config back to the database
          this.dbManager.setProfileConfig(currentConfig);
          console.log(`✅ Profile config updated inside database to: "${profileName}"`);
        }
      } catch (error) {
        console.error('Error updating profile config in database:', error);
        throw error;
      }
    }
  }

  /**
   * Import profile from a file
   */
  async importProfileFromLocal(sourcePath: string): Promise<ImportResult> {
    try {
      const fileName = path.basename(sourcePath, '.db');

      // Validate the database format
      const isValid = DatabaseManager.validateDatabaseFormat(sourcePath);
      if (!isValid) {
        return {
          success: false,
          message: 'Invalid database format. The selected file is not a valid EverEtch profile database.'
        };
      }

      // Generate unique profile name if needed
      let profileName = fileName;
      const existingProfiles = this.profileManager.getProfiles();
      let counter = 1;

      while (existingProfiles.includes(profileName)) {
        profileName = `${fileName}_${counter}`;
        counter++;
      }

      // Copy database to profile directory
      const targetPath = Utils.getDatabasePath(profileName);
      Utils.ensureDataDirectory();
      fs.copyFileSync(sourcePath, targetPath);

      // Add new profile to profiles
      const importSuccess = this.profileManager.importProfile(profileName);
      if (!importSuccess) {
        // Clean up the copied file if profile creation failed
        try {
          fs.unlinkSync(targetPath);
        } catch (cleanupError) {
          console.error('Error cleaning up failed import:', cleanupError);
        }
        return { success: false, message: 'Failed to create new profile' };
      }

      // Switch to the imported profile to ensure it's properly initialized
      const switchSuccess = await this.profileManager.switchProfile(profileName);
      if (!switchSuccess) {
        // Clean up the copied file if switch failed
        try {
          fs.unlinkSync(targetPath);
        } catch (cleanupError) {
          console.error('Error cleaning up failed switch:', cleanupError);
        }
        return { success: false, message: 'Failed to switch to imported profile' };
      }

      // Update the profile config inside the database to reflect the new name
      // (Now this.dbManager is connected to the imported database)
      this.updateProfileConfigInDatabase(profileName, fileName);

      return {
        success: true,
        message: `Profile "${profileName}" imported successfully`,
        profileName
      };

    } catch (error) {
      console.error('Error importing profile:', error);
      return {
        success: false,
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Prepare current profile data for Google Drive upload
   */
  async exportProfileForUpload(): Promise<UploadData> {
    try {
      const currentProfile = this.profileManager.getLastOpenedProfile();
      if (!currentProfile) {
        throw new Error('No current profile selected');
      }

      const fileInfo = this.getCurrentDatabaseFileInfo(currentProfile);
      if (!fileInfo) {
        throw new Error('Database file not found');
      }

      // Flush database to disk to ensure all changes are persisted before export
      console.debug(`🔄 Flushing database to disk before export...`);
      this.dbManager.flushToDisk();

      const fileBuffer = await this.readDatabaseFile(fileInfo.filePath);
      const fileName = this.generateFileName(currentProfile);

      return {
        success: true,
        fileBuffer: fileBuffer,
        fileName: fileName,
        message: 'Profile data prepared for upload'
      };

    } catch (error) {
      console.error('Error preparing profile for upload:', error);
      return {
        success: false,
        message: `Failed to prepare upload: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Import profile from Google Drive download data
   */
  async importProfileFromGoogleDrive(fileName: string, fileContent: string): Promise<ImportResult> {
    try {
      // Extract profile name from filename using the export service
      const profileName = this.parseProfileName(fileName);

      // Generate unique profile name if needed
      const existingProfiles = this.profileManager.getProfiles();
      let finalProfileName = profileName;
      let counter = 1;

      while (existingProfiles.includes(finalProfileName)) {
        finalProfileName = `${profileName}_${counter}`;
        counter++;
      }

      // Save the downloaded file
      const targetPath = Utils.getDatabasePath(finalProfileName);
      Utils.ensureDataDirectory();
      const fileBuffer = Buffer.from(fileContent, 'base64');
      await this.writeDatabaseFile(targetPath, fileBuffer);

      // Validate the downloaded database
      const isValid = DatabaseManager.validateDatabaseFormat(targetPath);
      if (!isValid) {
        // Clean up invalid file
        try {
          fs.unlinkSync(targetPath);
        } catch (cleanupError) {
          console.error('Error cleaning up invalid download:', cleanupError);
        }
        return { success: false, message: 'Downloaded file is not a valid EverEtch database' };
      }

      // Import the profile
      const importSuccess = this.profileManager.importProfile(finalProfileName);
      if (!importSuccess) {
        // Clean up if import failed
        try {
          fs.unlinkSync(targetPath);
        } catch (cleanupError) {
          console.error('Error cleaning up failed import:', cleanupError);
        }
        return { success: false, message: 'Failed to import profile' };
      }

      // Switch to the imported profile to ensure it's properly initialized
      const switchSuccess = await this.profileManager.switchProfile(finalProfileName);
      if (!switchSuccess) {
        // Clean up if switch failed
        try {
          fs.unlinkSync(targetPath);
        } catch (cleanupError) {
          console.error('Error cleaning up failed switch:', cleanupError);
        }
        return { success: false, message: 'Failed to switch to imported profile' };
      }

      // Update the profile config inside the database to reflect the new name
      // (Now this.dbManager is connected to the imported database)
      this.updateProfileConfigInDatabase(finalProfileName, profileName);

      return {
        success: true,
        message: `Profile "${finalProfileName}" imported successfully from Google Drive`,
        profileName: finalProfileName
      };

    } catch (error) {
      console.error('Error importing profile from Google Drive:', error);
      return {
        success: false,
        message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
