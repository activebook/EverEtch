import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

/**
 * Utility class containing static methods for common operations
 */
export class Utils {
  private static debug = false;

  /**
   * Get the app bundle root path for the current platform
   * @returns The app bundle root path
   */
  static getAppRootPath(): string | null {
    // In dev, there is no “install root” bundle/folder in the packaged sense.
    // if (process.env.ELECTRON_RUN_AS_NODE || (app && app.isReady() === false && (process as any).defaultApp)) {
    //   return null;
    // }

    if (process.platform === 'darwin') {
      // Resolve symlinks first.
      const resources = fs.realpathSync(process.resourcesPath);
      // .../MyApp.app/Contents/Resources -> .../MyApp.app
      const bundle = path.resolve(resources, '..', '..');
      // Validate bundle structure.
      const infoPlist = path.join(bundle, 'Contents', 'Info.plist');
      if (fs.existsSync(infoPlist)) return path.dirname(bundle);

      // Fallback: ascend to nearest ancestor ending with .app that contains Contents/Info.plist.
      let dir = path.dirname(resources);
      while (dir !== path.dirname(dir)) {
        if (dir.endsWith('.app')) {
          const candidate = dir;
          const info = path.join(candidate, 'Contents', 'Info.plist');
          if (fs.existsSync(info)) return path.dirname(candidate);
        }
        dir = path.dirname(dir);
      }
      return null;
    }

    // Windows and Linux: prefer app.getPath('exe'), then dirname.
    const exe = fs.realpathSync(app.getPath('exe'));
    let root = path.dirname(exe);

    // Optional: normalize known updater/helper cases (Squirrel, custom helpers).
    // Example: if exe is Update.exe, the app exe is typically ../app-*/YourApp.exe
    if (process.platform === 'win32') {
      const parent = path.dirname(root);
      // Try to locate the newest app-* folder containing our main exe.
      const entries = fs.readdirSync(parent, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('app-'))
        .map(d => path.join(parent, d.name))
        .sort() // lexicographic; adjust if you need semver compare
      for (const dir of entries.reverse()) {
        const maybeExe = path.join(dir, path.basename(app.getName()) + '.exe');
        if (fs.existsSync(maybeExe)) return dir;
      }
      return parent; // last resort
    }

    // Linux: consider env hints (AppImage/Snap/Flatpak) when you truly need the mounted app dir.
    if (process.platform === 'linux') {
      if (process.env.APPDIR) return fs.realpathSync(process.env.APPDIR);
      if (process.env.SNAP) return fs.realpathSync(process.env.SNAP);
    }

    return root;
  }


  /**
   * Get the user data directory path for the current platform
   * @returns The user data directory path
   */
  static getUserDataPath(): string {
    return app.getPath('userData');
  }

  /**
   * Get the data directory path within the user data directory
   * @returns The data directory path
   */
  static getDataPath(): string {
    return path.join(this.getUserDataPath(), 'data');
  }

  /**
   * Get the profiles configuration file path
   * @returns The profiles.json file path
   */
  static getProfilesPath(): string {
    return path.join(this.getDataPath(), 'profiles.json');
  }

  /**
   * Get the database file path for a specific profile
   * @param profileName The name of the profile
   * @returns The database file path
   */
  static getDatabasePath(profileName: string): string {
    return path.join(this.getDataPath(), `${profileName}.db`);
  }

  /**
   * Ensure the data directory exists
   */
  static ensureDataDirectory(): void {
    const dataPath = this.getDataPath();
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
  }

  /**
   * Generate a unique ID for database records
   * @param prefix Optional prefix for the ID
   * @returns A unique ID string
   */
  static generateId(prefix: string = ''): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
  }

  /**
   * Format a date to ISO string
   * @param date Optional date to format (defaults to current date)
   * @returns ISO formatted date string
   */
  static formatDate(date?: Date): string {
    return (date || new Date()).toISOString();
  }

  /**
   * Log a message to a debug file in the user data directory
   * Useful for debugging release builds where console.log isn't visible
   * @param message The message to log
   * @param level Optional log level (INFO, ERROR, DEBUG)
   */
  static logToFile(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO'): void {
    if (!this.debug) {
      return;
    }
    try {
      const userDataPath = this.getUserDataPath();
      const logPath = path.join(userDataPath, 'debug.log');

      // Ensure the directory exists
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${level}] ${message}\n`;

      // Append to log file (create if doesn't exist)
      fs.appendFileSync(logPath, logMessage, 'utf8');

      // Also log to console for development
      console.log(`[DEBUG LOG] ${message}`);
    } catch (error) {
      // Try to log the error to console at least
      console.error('Failed to write to debug log:', error);
      console.error('User data path:', this.getUserDataPath());
      console.error('Log path would be:', path.join(this.getUserDataPath(), 'debug.log'));
    }
  }

  /**
   * Clear the debug log file
   */
  static clearDebugLog(): void {
    if (!this.debug) {
      return;
    }
    try {
      const logPath = path.join(this.getUserDataPath(), 'debug.log');
      if (fs.existsSync(logPath)) {
        fs.unlinkSync(logPath);
      }
    } catch (error) {
      console.error('Failed to clear debug log:', error);
    }
  }

  /**
   * Get the debug log file path
   * @returns The path to the debug.log file
   */
  static getDebugLogPath(): string {
    return path.join(this.getUserDataPath(), 'debug.log');
  }

  /**
   * Set the debug mode for logging
   * @param enabled Whether debug logging should be enabled
   */
  static setDebugMode(enabled: boolean): void {
    this.debug = enabled;
  }
}
