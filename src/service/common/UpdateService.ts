import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Utils } from '../../utils/Utils.js';
import { GitHubService, GitHubRelease, VersionInfo } from './GitHubService.js';
import { AtomUpdaterManager, UpdateResult } from './AtomUpdaterManager.js';

export interface DownloadProgress {
  percentage: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number; // bytes per second
}

export interface UpdateConfig {
  enabled: boolean;
  autoCheck: boolean;
  autoDownload: boolean;
  autoInstall: boolean;
  channel: 'stable' | 'beta' | 'alpha';
}

export class UpdateService {
  private githubService: GitHubService;
  private atomUpdaterManager: AtomUpdaterManager;
  private config: UpdateConfig;
  private isInitialized = false;
  private currentDownload: { abort?: () => void } | null = null;

  // Update state
  private pendingUpdatePath: string | null = null;
  private isDownloading = false;
  private downloadProgress: DownloadProgress | null = null;

  constructor() {
    this.githubService = new GitHubService();
    this.atomUpdaterManager = new AtomUpdaterManager();

    // Default configuration
    this.config = {
      enabled: true,
      autoCheck: true,
      autoDownload: false,
      autoInstall: false,
      channel: 'stable'
    };

    Utils.logToFile('🔄 UpdateService: Initialized');
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

      // Load configuration
      await this.loadConfig();

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

    try {
      const currentVersion = this.getCurrentVersion();
      Utils.logToFile(`🔍 UpdateService: Checking for updates (current: ${currentVersion})`);

      const versionInfo = await this.githubService.getRemoteVersionInfo(currentVersion);

      if (versionInfo.hasUpdate) {
        Utils.logToFile(`🎉 UpdateService: Update available: ${currentVersion} → ${versionInfo.latest}`);
      } else {
        Utils.logToFile('✅ UpdateService: No updates available');
      }

      return versionInfo;
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
  async downloadUpdate(release?: GitHubRelease): Promise<DownloadProgress> {
    if (this.isDownloading) {
      throw new Error('Download already in progress');
    }

    try {
      this.isDownloading = true;
      Utils.logToFile('⬇️ UpdateService: Starting download');

      // Get release info if not provided
      if (!release) {
        const versionInfo = await this.checkForUpdates();
        if (!versionInfo.hasUpdate || !versionInfo.release) {
          throw new Error('No update available');
        }
        release = versionInfo.release;
      }

      // Find the appropriate asset
      const asset = this.githubService.findUpdateAsset(release);

      // Set up download progress tracking
      this.downloadProgress = {
        percentage: 0,
        bytesDownloaded: 0,
        totalBytes: asset.size,
        speed: 0
      };

      // Download the asset
      const buffer = await this.githubService.downloadAsset(asset);

      // Save to temporary location
      const tempDir = await this.getTempDirectory();
      const fileName = asset.name;
      const downloadPath = path.join(tempDir, fileName);

      await fs.promises.writeFile(downloadPath, buffer);
      Utils.logToFile(`💾 UpdateService: Saved update to ${downloadPath}`);

      // Verify the download
      const isValid = await this.verifyDownload(downloadPath, asset);
      if (!isValid) {
        throw new Error('Download verification failed');
      }

      this.pendingUpdatePath = downloadPath;
      Utils.logToFile('✅ UpdateService: Download and verification complete');

      // Here we need unzip/7z if necessary based on asset type
      

      return {
        percentage: 100,
        bytesDownloaded: buffer.length,
        totalBytes: buffer.length,
        speed: 0
      };

    } catch (error) {
      Utils.logToFile(`❌ UpdateService: Download failed: ${error}`);
      throw error;
    } finally {
      this.isDownloading = false;
      this.currentDownload = null;
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
    if (this.currentDownload && this.currentDownload.abort) {
      this.currentDownload.abort();
    }
    this.isDownloading = false;
    this.downloadProgress = null;
    Utils.logToFile('🛑 UpdateService: Download cancelled');
  }

  /**
   * Clean up old update files
   */
  async cleanup(): Promise<void> {
    try {
      const tempDir = await this.getTempDirectory();
      const files = await fs.promises.readdir(tempDir);

      for (const file of files) {
        if (file.startsWith('everetch-update-') || file.endsWith('.tmp')) {
          const filePath = path.join(tempDir, file);
          await fs.promises.unlink(filePath);
          Utils.logToFile(`🗑️ UpdateService: Cleaned up ${filePath}`);
        }
      }
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
   * Load update configuration
   */
  private async loadConfig(): Promise<void> {
    try {
      // For now, use default config
      // TODO: Load from user settings or config file
      Utils.logToFile('⚙️ UpdateService: Configuration loaded');
    } catch (error) {
      Utils.logToFile(`⚠️ UpdateService: Could not load config: ${error}`);
    }
  }

  /**
   * Get update configuration
   */
  getConfig(): UpdateConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<UpdateConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    Utils.logToFile('⚙️ UpdateService: Configuration updated');
  }
}