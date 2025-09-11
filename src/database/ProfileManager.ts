import * as fs from 'fs';
import { DatabaseManager, ProfileConfig } from './DatabaseManager.js';
import { getProfilesPath, getDatabasePath, ensureDataDirectory, generateId, formatDate } from '../utils/utils.js';



export class ProfileManager {
  private dbManager: DatabaseManager;
  private profiles: string[] = [];
  private currentProfile: string | null = null;
  private profilesPath: string;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
    this.profilesPath = getProfilesPath();
    ensureDataDirectory();
  }

  async loadProfiles(): Promise<string[]> {
    try {
      if (fs.existsSync(this.profilesPath)) {
        const data = fs.readFileSync(this.profilesPath, 'utf-8');
        const profilesData = JSON.parse(data);
        this.profiles = profilesData.profiles || [];
        this.currentProfile = profilesData.currentProfile || null;
      } else {
        // Create default profile
        await this.createProfile('Default');
        this.currentProfile = 'Default';
        this.saveProfiles();
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
      this.profiles = [];
      this.currentProfile = null;
    }
    return [...this.profiles];
  }

  private saveProfiles() {
    try {
      const data = {
        profiles: this.profiles,
        currentProfile: this.currentProfile
      };
      fs.writeFileSync(this.profilesPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving profiles:', error);
    }
  }

  getProfiles(): string[] {
    return [...this.profiles];
  }

  async createProfile(profileName: string): Promise<boolean> {
    if (this.profiles.includes(profileName)) {
      return false; // Profile already exists
    }

    // Set current profile as last opened profile
    this.currentProfile = profileName;

    // Import profile
    if (!this.importProfile(profileName)) {
      return false; // Profile already exists
    }

    // Close current database
    await this.dbManager.close();

    // Initialize database for new profile
    await this.dbManager.initialize(profileName);

    // Create default profile config
    const defaultConfig: Omit<ProfileConfig, 'id'> = {
      name: profileName,
      system_prompt: `You are a helpful assistant.`,
      model_config: {
        provider: 'openai',
        model: 'gpt-4',
        endpoint: 'https://api.openai.com/v1',
        api_key: '' // To be set by user
      },
      last_opened: new Date().toISOString()
    };

    await this.dbManager.setProfileConfig(defaultConfig);

    return true;
  }

  async switchProfile(profileName: string): Promise<boolean> {
    if (!this.profiles.includes(profileName)) {
      return false; // Profile doesn't exist
    }

    // Close current database
    await this.dbManager.close();

    // Switch to new profile
    this.currentProfile = profileName;
    await this.dbManager.initialize(profileName);

    // Ensure profile config exists
    let config = await this.dbManager.getProfileConfig();
    if (!config) {
      // Create default profile config if it doesn't exist
      const defaultConfig: Omit<ProfileConfig, 'id'> = {
        name: profileName,
        system_prompt: `You are a helpful assistant.`,
        model_config: {
          provider: 'openai',
          model: 'gpt-4',
          endpoint: 'https://api.openai.com/v1',
          api_key: '' // To be set by user
        },
        last_opened: new Date().toISOString()
      };
      config = await this.dbManager.setProfileConfig(defaultConfig);
    } else {
      // Update last opened
      config.last_opened = new Date().toISOString();
      await this.dbManager.setProfileConfig(config);
    }

    this.saveProfiles();
    return true;
  }

  async getCurrentProfile(): Promise<ProfileConfig | null> {
    if (!this.currentProfile) return null;
    return await this.dbManager.getProfileConfig();
  }

  getLastOpenedProfile(): string | null {
    return this.currentProfile;
  }

  async deleteProfile(profileName: string): Promise<boolean> {
    if (!this.profiles.includes(profileName) || this.profiles.length <= 1) {
      return false; // Cannot delete last profile or non-existent profile
    }

    const index = this.profiles.indexOf(profileName);
    this.profiles.splice(index, 1);

    // If deleting current profile, switch to another
    if (this.currentProfile === profileName) {
      this.currentProfile = this.profiles[0];
      await this.dbManager.initialize(this.currentProfile);
    }

    // Delete database file
    const dbPath = getDatabasePath(profileName);
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch (error) {
      console.error('Error deleting profile database:', error);
    }

    this.saveProfiles();
    return true;
  }

  async updateProfileConfig(profileName: string, config: Partial<ProfileConfig>): Promise<boolean> {
    if (this.currentProfile !== profileName) {
      return false; // Can only update current profile
    }

    const existingConfig = await this.dbManager.getProfileConfig();
    if (!existingConfig) return false;

    const updatedConfig = { ...existingConfig, ...config };
    await this.dbManager.setProfileConfig(updatedConfig);
    return true;
  }

  async renameProfile(oldName: string, newName: string): Promise<boolean> {
    // Validate inputs
    if (!oldName || !newName || oldName.trim() === '' || newName.trim() === '') {
      return false; // Names cannot be empty
    }

    const trimmedOldName = oldName.trim();
    const trimmedNewName = newName.trim();

    // Check if old profile exists
    if (!this.profiles.includes(trimmedOldName)) {
      return false; // Old profile doesn't exist
    }

    // Check if new name is already taken
    if (this.profiles.includes(trimmedNewName)) {
      return false; // New name already exists
    }

    const isCurrentProfile = (this.currentProfile === trimmedOldName);

    try {
      // 1. Close database connection if we're renaming the current profile
      if (isCurrentProfile) {
        await this.dbManager.close();
      }

      // 2. Rename the database file
      const oldDbPath = getDatabasePath(trimmedOldName);
      const newDbPath = getDatabasePath(trimmedNewName);

      // Keypart: Rename the database file
      if (fs.existsSync(oldDbPath)) {
        fs.renameSync(oldDbPath, newDbPath);
      }

      // 3. Update in-memory state
      const index = this.profiles.indexOf(trimmedOldName);
      this.profiles[index] = trimmedNewName;

      if (isCurrentProfile) {
        this.currentProfile = trimmedNewName;

        // 4. Reconnect to the renamed database file (preserves existing data)
        await this.dbManager.reconnectToDatabase(trimmedNewName);

        // 5. Update ProfileConfig in the renamed database
        const config = await this.dbManager.getProfileConfig();
        if (config) {
          config.name = trimmedNewName;
          await this.dbManager.setProfileConfig(config);
        }
      }

      // 6. Save updated profiles.json
      this.saveProfiles();

      return true;
    } catch (error) {
      console.error('Error renaming profile:', error);
      return false;
    }
  }

  /**
   * Import a profile by adding it to the profiles list without creating default config
   * Used when importing an existing database that already has a profile config
   */
  importProfile(profileName: string): boolean {
    if (this.profiles.includes(profileName)) {
      return false; // Profile already exists
    }

    this.profiles.push(profileName);
    this.saveProfiles();
    return true;
  }


}
