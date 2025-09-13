import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

let debug = false;

/**
 * Get the user data directory path for the current platform
 * @returns The user data directory path
 */
export function getUserDataPath(): string {
  return app.getPath('userData');
}

/**
 * Get the data directory path within the user data directory
 * @returns The data directory path
 */
export function getDataPath(): string {
  return path.join(getUserDataPath(), 'data');
}

/**
 * Get the profiles configuration file path
 * @returns The profiles.json file path
 */
export function getProfilesPath(): string {
  return path.join(getDataPath(), 'profiles.json');
}

/**
 * Get the database file path for a specific profile
 * @param profileName The name of the profile
 * @returns The database file path
 */
export function getDatabasePath(profileName: string): string {
  return path.join(getDataPath(), `${profileName}.db`);
}

/**
 * Ensure the data directory exists
 */
export function ensureDataDirectory(): void {
  const dataPath = getDataPath();
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
}

/**
 * Generate a unique ID for database records
 * @param prefix Optional prefix for the ID
 * @returns A unique ID string
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Format a date to ISO string
 * @param date Optional date to format (defaults to current date)
 * @returns ISO formatted date string
 */
export function formatDate(date?: Date): string {
  return (date || new Date()).toISOString();
}

/**
 * Log a message to a debug file in the user data directory
 * Useful for debugging release builds where console.log isn't visible
 * @param message The message to log
 * @param level Optional log level (INFO, ERROR, DEBUG)
 */
export function logToFile(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO'): void {
  if (!debug) {
    return;
  }
  try {
    const userDataPath = getUserDataPath();
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
    console.error('User data path:', getUserDataPath());
    console.error('Log path would be:', path.join(getUserDataPath(), 'debug.log'));
  }
}

/**
 * Clear the debug log file
 */
export function clearDebugLog(): void {
  if (!debug) {
    return;
  }
  try {
    const logPath = path.join(getUserDataPath(), 'debug.log');
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
export function getDebugLogPath(): string {
  return path.join(getUserDataPath(), 'debug.log');
}


export function setDebugMode(enabled: boolean): void {
  debug = enabled;
}