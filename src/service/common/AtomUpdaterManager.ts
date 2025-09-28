import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { Utils } from '../../utils/Utils.js';

export interface UpdateResult {
  success: boolean;
  error?: string;
  action?: string;
}

export interface AtomUpdaterConfig {
  version: string;
  binaryName: string;
  userDataPath: string;
}

export class AtomUpdaterManager {
  private readonly UPDATER_DIR = 'updater';
  private readonly BINARY_NAME = 'atom-updater';
  private updaterPath: string | null = null;
  private isInitialized = false;

  constructor() {
    Utils.logToFile('🔧 AtomUpdaterManager: Initializing');
  }

  /**
   * Initialize the atom-updater manager
   */
  async initialize(): Promise<boolean> {
    try {
      Utils.logToFile('🔧 AtomUpdaterManager: Starting initialization');

      // Ensure updater binary is deployed
      await this.ensureAtomUpdater();

      // Verify the updater works
      const version = await this.checkUpdaterVersion();
      Utils.logToFile(`✅ AtomUpdaterManager: Updater version ${version}`);

      this.isInitialized = true;
      return true;
    } catch (error) {
      Utils.logToFile(`❌ AtomUpdaterManager: Initialization failed: ${error}`);
      return false;
    }
  }

  /**
   * Get the path to the atom-updater binary
   */
  async getUpdaterPath(): Promise<string> {
    if (this.updaterPath) {
      return this.updaterPath;
    }

    const userDataPath = app.getPath('userData');
    const updaterDir = path.join(userDataPath, this.UPDATER_DIR);

    // Determine platform-specific binary name
    let binaryName = this.BINARY_NAME;
    if (process.platform === 'win32') {
      binaryName = 'atom-updater.exe';
    }

    this.updaterPath = path.join(updaterDir, binaryName);
    return this.updaterPath;
  }

  /**
   * Ensure atom-updater binary is deployed to user data directory
   */
  async ensureAtomUpdater(): Promise<string> {
    const updaterPath = await this.getUpdaterPath();
    const updaterDir = path.dirname(updaterPath);

    Utils.logToFile(`🔧 AtomUpdaterManager: Ensuring updater at ${updaterPath}`);

    // Check if updater already exists
    if (fs.existsSync(updaterPath)) {
      Utils.logToFile('✅ AtomUpdaterManager: Updater already exists');
      return updaterPath;
    }

    try {
      // Create updater directory
      await fs.promises.mkdir(updaterDir, { recursive: true });
      Utils.logToFile(`📁 AtomUpdaterManager: Created directory ${updaterDir}`);

      // Copy updater from resources
      const resourcesPath = this.getResourcesUpdaterPath();
      if (!fs.existsSync(resourcesPath)) {
        throw new Error(`Atom-updater not found in resources: ${resourcesPath}`);
      }

      await fs.promises.copyFile(resourcesPath, updaterPath);
      Utils.logToFile(`📋 AtomUpdaterManager: Copied updater from ${resourcesPath} to ${updaterPath}`);

      // Make executable on Unix systems
      if (process.platform !== 'win32') {
        await fs.promises.chmod(updaterPath, 0o755);
        Utils.logToFile('🔓 AtomUpdaterManager: Made updater executable');
      }

      Utils.logToFile('✅ AtomUpdaterManager: Updater deployed successfully');
      return updaterPath;
    } catch (error) {
      Utils.logToFile(`❌ AtomUpdaterManager: Failed to deploy updater: ${error}`);
      throw error;
    }
  }

  /**
   * Get the path to atom-updater in the app resources
   */
  private getResourcesUpdaterPath(): string {
    // Try platform-specific paths first
    const platformPaths = [
      path.join(process.resourcesPath, 'atom-updater', this.getPlatformBinaryName()),
      path.join(process.resourcesPath, 'atom-updater_Darwin_x86_64', this.getPlatformBinaryName()),
      path.join(process.resourcesPath, 'atom-updater.exe'),
    ];

    for (const testPath of platformPaths) {
      if (fs.existsSync(testPath)) {
        return testPath;
      }
    }

    // Fallback to generic path
    return path.join(process.resourcesPath, 'atom-updater', this.getPlatformBinaryName());
  }

  /**
   * Get platform-specific binary name
   */
  private getPlatformBinaryName(): string {
    switch (process.platform) {
      case 'win32':
        return 'atom-updater.exe';
      case 'darwin':
        return 'atom-updater';
      case 'linux':
        return 'atom-updater';
      default:
        return 'atom-updater';
    }
  }

  /**
   * Check the version of the deployed atom-updater
   */
  async checkUpdaterVersion(): Promise<string> {
    const updaterPath = await this.getUpdaterPath();

    if (!fs.existsSync(updaterPath)) {
      throw new Error('Atom-updater not found');
    }

    return new Promise((resolve, reject) => {
      Utils.logToFile(`🔍 AtomUpdaterManager: Checking updater version at ${updaterPath}`);

      const child = spawn(updaterPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          const version = stdout.trim();
          Utils.logToFile(`✅ AtomUpdaterManager: Updater version: ${version}`);
          resolve(version);
        } else {
          const error = `Updater version check failed with code ${code}: ${stderr}`;
          Utils.logToFile(`❌ AtomUpdaterManager: ${error}`);
          reject(new Error(error));
        }
      });

      child.on('error', (error) => {
        Utils.logToFile(`❌ AtomUpdaterManager: Failed to spawn updater: ${error}`);
        reject(error);
      });
    });
  }

  /**
   * Execute atomic update using atom-updater
   */
  async executeAtomicUpdate(newVersionPath: string): Promise<UpdateResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const currentPid = process.pid;
    const currentPath = process.execPath;
    const updaterPath = await this.getUpdaterPath();

    Utils.logToFile(`🚀 AtomUpdaterManager: Executing atomic update`);
    Utils.logToFile(`📋 AtomUpdaterManager: PID: ${currentPid}, Current: ${currentPath}, New: ${newVersionPath}`);
    Utils.logToFile(`🔧 AtomUpdaterManager: Updater: ${updaterPath}`);

    try {
      // Verify all paths exist
      if (!fs.existsSync(currentPath)) {
        throw new Error(`Current application not found: ${currentPath}`);
      }
      if (!fs.existsSync(newVersionPath)) {
        throw new Error(`New version not found: ${newVersionPath}`);
      }
      if (!fs.existsSync(updaterPath)) {
        throw new Error(`Atom-updater not found: ${updaterPath}`);
      }

      // Launch atom-updater with required parameters
      const updaterProcess = spawn(
        updaterPath,
        [currentPid.toString(), currentPath, newVersionPath],
        {
          detached: true,
          stdio: 'inherit'
        }
      );

      // Set up process event handlers
      updaterProcess.on('error', (error) => {
        Utils.logToFile(`❌ AtomUpdaterManager: Updater process error: ${error}`);
      });

      updaterProcess.on('close', (code) => {
        Utils.logToFile(`📋 AtomUpdaterManager: Updater process closed with code ${code}`);
      });

      // Exit current app to let updater do its work
      setTimeout(() => {
        Utils.logToFile('👋 AtomUpdaterManager: Exiting app for update');
        app.quit();
      }, 1000);

      return {
        success: true,
        action: 'update_initiated'
      };

    } catch (error) {
      Utils.logToFile(`❌ AtomUpdaterManager: Failed to execute update: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if atom-updater is properly deployed and working
   */
  async isUpdaterReady(): Promise<boolean> {
    try {
      const updaterPath = await this.getUpdaterPath();
      if (!fs.existsSync(updaterPath)) {
        return false;
      }

      const version = await this.checkUpdaterVersion();
      return version === this.getCurrentVersion();
    } catch (error) {
      Utils.logToFile(`❌ AtomUpdaterManager: Updater not ready: ${error}`);
      return false;
    }
  }


  /**
   * Get current version from package.json
   */
  getCurrentVersion(): string {
    try {
      // In the main process, we need to read package.json
      const packageJsonPath = path.join(process.resourcesPath, '..', 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson['atom-updater'] || 'v1.0.0';
      }
    } catch (error) {
      Utils.logToFile(`⚠️ GitHubService: Could not read package.json: ${error}`);
    }

    return 'v1.0.0';
  }
}