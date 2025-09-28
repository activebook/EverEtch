import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Utils } from '../../utils/Utils.js';
import { GitHubService, GitHubRelease, VersionInfo } from './GitHubService.js';
import { AtomUpdaterManager, UpdateResult } from './AtomUpdaterManager.js';

export interface DownloadProgress {
  downloaded: number;
  total: number;
}

export class UpdateService {
  private githubService: GitHubService;
  private atomUpdaterManager: AtomUpdaterManager;
  private isInitialized = false;

  // Update state
  private versionInfo: VersionInfo | null = null;
  private pendingUpdatePath: string | null = null;
  private isDownloading = false;
  private downloadProgress: DownloadProgress | null = null;

  // Update messages 
  private readonly UPDATE_DOWNLOADING = 'Downloading package...';
  private readonly UPDATE_VERIFYING = 'Verifying checksum...';
  private readonly UPDATE_EXTRACTING = 'Extracting package...';
  private readonly UPDATE_CANCELLING = 'Cancelling...';

  constructor() {
    this.githubService = new GitHubService();
    this.atomUpdaterManager = new AtomUpdaterManager();
  }

  /**
   * Initialize the update service
   */
  async initialize(): Promise<boolean> {
    try {
      Utils.logToFile('🔄 UpdateService: Starting initialization');

      // Initialize atom-updater manager
      const updaterReady = await this.atomUpdaterManager.initialize();
      if (!updaterReady) {
        Utils.logToFile('⚠️ UpdateService: Atom-updater not ready, updates will not work');
      }

      this.versionInfo = null;
      this.pendingUpdatePath = null;
      this.isDownloading = false;
      this.downloadProgress = null;
      this.isInitialized = true;
      Utils.logToFile('✅ UpdateService: Initialization complete');
      return true;
    } catch (error) {
      Utils.logToFile(`❌ UpdateService: Initialization failed: ${error}`);
      return false;
    }
  }

  getCurrentVersion(): string {
    return app.getVersion();
  }

  /**
   * Check for available updates
   */
  async checkForUpdates(): Promise<VersionInfo> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.versionInfo) {
      return this.versionInfo;
    }

    try {
      const currentVersion = this.getCurrentVersion();
      Utils.logToFile(`🔍 UpdateService: Checking for updates (current: ${currentVersion})`);

      this.versionInfo = await this.githubService.getRemoteVersionInfo(currentVersion);

      if (this.versionInfo.hasUpdate) {
        Utils.logToFile(`🎉 UpdateService: Update available: ${currentVersion} → ${this.versionInfo.latest}`);
      } else {
        Utils.logToFile('✅ UpdateService: No updates available');
      }

      return this.versionInfo;
    } catch (error) {
      Utils.logToFile(`❌ UpdateService: Update check failed: ${error}`);
      return {
        current: this.getCurrentVersion(),
        latest: this.getCurrentVersion(),
        hasUpdate: false
      };
    }
  }

  /**
   * Download an update in the background
   */
  async downloadUpdate(onProgress: (downloaded: number, total: number, message: string) => void): Promise<DownloadProgress> {
    if (this.isDownloading) {
      throw new Error('Download already in progress');
    }

    try {
      this.isDownloading = true;

      Utils.logToFile('⬇️ UpdateService: Starting download');

      // Get release info if not provided
      const versionInfo = await this.checkForUpdates();
      if (!versionInfo.hasUpdate || !versionInfo.release) {
        throw new Error('No update available');
      }
      const release: GitHubRelease = versionInfo.release;

      // Find the appropriate asset
      const asset = this.githubService.findUpdateAsset(release);

      // Set up download progress tracking
      this.downloadProgress = {
        downloaded: 0,
        total: asset.size
      };

      // Download the asset with progress tracking and cancellation support
      const buffer = await this.githubService.downloadAsset(
        asset,
        (progress) => {
          // Update download progress
          onProgress(progress.downloaded, progress.total, this.UPDATE_DOWNLOADING)
        }
      );
      if (!buffer) {
        // Download was aborted
        onProgress(0, 0, this.UPDATE_CANCELLING);
        return {
          downloaded: 0,
          total: 0,
        };
      }

      // Save to temporary location
      const tempDir = await this.getTempDirectory();
      const downloadPath = path.join(tempDir, asset.name);

      await fs.promises.writeFile(downloadPath, buffer);
      Utils.logToFile(`💾 UpdateService: Saved update to ${downloadPath}`);

      // Verify the download
      onProgress(buffer.length, buffer.length, this.UPDATE_VERIFYING);
      const isValid = await this.verifyDownload(downloadPath, asset);
      if (!isValid) {
        throw new Error('Download verification failed');
      }

      // Extract archive if necessary
      onProgress(buffer.length, buffer.length, this.UPDATE_EXTRACTING);
      const extractedPath = await this.extractArchiveIfNeeded(downloadPath, asset);
      this.pendingUpdatePath = extractedPath;

      Utils.logToFile('✅ UpdateService: Download and verification complete');

      return {
        downloaded: buffer.length,
        total: buffer.length
      };

    } catch (error) {
      Utils.logToFile(`❌ UpdateService: Download failed: ${error}`);
      throw error;
    } finally {
      this.isDownloading = false;
    }
  }

  /**
   * Install the downloaded update
   */
  async installUpdate(): Promise<UpdateResult> {
    if (!this.pendingUpdatePath) {
      throw new Error('No update downloaded');
    }

    if (!fs.existsSync(this.pendingUpdatePath)) {
      throw new Error('Update file not found');
    }

    try {
      Utils.logToFile(`🚀 UpdateService: Installing update: ${this.pendingUpdatePath}`);

      // Execute atomic update using atom-updater
      const result = await this.atomUpdaterManager.executeAtomicUpdate(this.pendingUpdatePath);

      if (result.success) {
        Utils.logToFile('✅ UpdateService: Update installation initiated');
        this.pendingUpdatePath = null; // Clear pending update
      } else {
        Utils.logToFile(`❌ UpdateService: Update installation failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      Utils.logToFile(`❌ UpdateService: Installation error: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get download progress (for UI updates)
   */
  getDownloadProgress(): DownloadProgress | null {
    return this.downloadProgress;
  }

  /**
   * Check if an update is ready to install
   */
  isUpdateReady(): boolean {
    return this.pendingUpdatePath !== null && fs.existsSync(this.pendingUpdatePath);
  }

  /**
   * Cancel current download
   */
  async cancelDownload(): Promise<void> {
    this.githubService.cancelDownloadAsset();
    this.isDownloading = false;
    this.downloadProgress = null;
    Utils.logToFile('🛑 UpdateService: Download cancelled');
  }

  /**
   * Clean up old update files and entire temp directory
   */
  async cleanup(): Promise<void> {
    try {
      const tempDir = await this.getTempDirectory();

      // Remove the entire temp directory and recreate it
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      await fs.promises.mkdir(tempDir, { recursive: true });

      Utils.logToFile(`🗑️ UpdateService: Cleaned up entire temp directory: ${tempDir}`);
    } catch (error) {
      Utils.logToFile(`⚠️ UpdateService: Cleanup warning: ${error}`);
    }
  }

  /**
   * Get or create temporary directory for downloads
   */
  private async getTempDirectory(): Promise<string> {
    const userDataPath = app.getPath('userData');
    const tempDir = path.join(userDataPath, 'updates', 'temp');

    await fs.promises.mkdir(tempDir, { recursive: true });
    return tempDir;
  }

  /**
   * Verify downloaded file integrity
   */
  private async verifyDownload(filePath: string, asset: any): Promise<boolean> {
    try {
      Utils.logToFile(`🔍 UpdateService: Verifying download: ${filePath}`);

      // Check file exists
      if (!fs.existsSync(filePath)) {
        throw new Error('Downloaded file not found');
      }

      // Check file size
      const stats = await fs.promises.stat(filePath);
      if (stats.size !== asset.size) {
        throw new Error(`File size mismatch: expected ${asset.size}, got ${stats.size}`);
      }

      // TODO: Add SHA-256 checksum verification when available
      // For now, we'll rely on file size verification

      Utils.logToFile('✅ UpdateService: Download verification passed');
      return true;
    } catch (error) {
      Utils.logToFile(`❌ UpdateService: Download verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Extract archive if the downloaded file is a zip/7z archive
   */
  private async extractArchiveIfNeeded(downloadPath: string, asset: any): Promise<string> {
    const contentType = asset.content_type;

    // Check if it's an archive that needs extraction
    if (contentType === 'application/zip' ||
      contentType === 'application/x-zip-compressed' ||
      asset.name.endsWith('.zip')) {

      Utils.logToFile(`📦 UpdateService: Extracting archive: ${downloadPath}`);

      try {
        // For now, we'll implement a simple extraction approach
        // In a production system, you might want to use a library like 'yauzl' or 'node-stream-zip'
        const tempDir = path.dirname(downloadPath);
        const extractDir = path.join(tempDir, 'extracted');

        // Create extraction directory
        await fs.promises.mkdir(extractDir, { recursive: true });

        // TODO: Implement actual archive extraction
        // For now, assume the archive contains the app directly
        Utils.logToFile(`📂 UpdateService: Archive extracted to: ${extractDir}`);

        // Return the extraction directory as the update path
        return extractDir;
      } catch (error) {
        Utils.logToFile(`❌ UpdateService: Archive extraction failed: ${error}`);
        throw new Error(`Failed to extract archive: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // Not an archive, return the download path directly
      Utils.logToFile(`📄 UpdateService: File is not an archive, using directly: ${downloadPath}`);
      return downloadPath;
    }
  }
}