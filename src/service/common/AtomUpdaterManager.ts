import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Utils } from '../../utils/Utils.js';
import { AtomUpdater, UpdateConfig } from '@activebook/atom-updater';

export class AtomUpdaterManager {
  private readonly UPDATER_DIR = 'updater';

  constructor() {
  }

  /**
   * Get the path to the atom-updater binary
   */
  private getUpdaterPath(): string {
    const userDataPath = app.getPath('userData');
    const updaterDir = path.join(userDataPath, this.UPDATER_DIR);
    if (!fs.existsSync(updaterDir)) {
      fs.mkdirSync(updaterDir, { recursive: true });
    }
    return updaterDir;
  }

  /**
   * Execute atomic update using atom-updater
   */
  async execute(newVersionDir: string): Promise<void> {
    
    // if (!await this.isUpdaterReady()) {
    //   throw new Error('AtomUpdater is not ready');
    // }

    // Ensure updater is initialized
    const updater = new AtomUpdater();
    const updaterDir = this.getUpdaterPath();
    const appRoot = Utils.getAppRootPath();
    const config: UpdateConfig = {
      pid: process.pid,
      currentAppDir: appRoot!,
      newAppDir: newVersionDir,
      binDir: updaterDir
    };
    await updater.update(config);
  }

  /**
   * Check if atom-updater is properly deployed and working
   */
  private async isUpdaterReady(): Promise<boolean> {
    try {
      const updater = new AtomUpdater();
      // const version = await updater.getVersion();
      // const execPath = updater.getExecutablePath();
      // Utils.logToFile(`🚀 UpdateService: Atom-updater version: ${version}`);
      return await updater.isAvailable();
    } catch (error) {
      Utils.logToFile(`❌ AtomUpdaterManager: Updater not ready: ${error}`);
      return false;
    }
  }
}