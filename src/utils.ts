import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

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
