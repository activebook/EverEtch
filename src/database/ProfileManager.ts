import * as fs from 'fs';
import { DatabaseManager, ProfileConfig } from './DatabaseManager.js';
import { getProfilesPath, getDatabasePath, ensureDataDirectory, generateId, formatDate } from '../utils.js';

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

  async initialize(): Promise<void> {
    await this.loadProfiles();
  }

  private async loadProfiles() {
    try {
      if (fs.existsSync(this.profilesPath)) {
        const data = fs.readFileSync(this.profilesPath, 'utf-8');
        const profilesData = JSON.parse(data);
        this.profiles = profilesData.profiles || [];
        this.currentProfile = profilesData.currentProfile || null;
      } else {
        // Create default profile
        await this.createProfile('English');
        await this.createProfile('Japanese');
        this.currentProfile = 'English';
        this.saveProfiles();
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
      this.profiles = [];
      this.currentProfile = null;
    }
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

    this.profiles.push(profileName);

    // Initialize database for new profile
    await this.dbManager.initialize(profileName);

    // Create default profile config
    const defaultConfig: Omit<ProfileConfig, 'id'> = {
      name: profileName,
      system_prompt: `You are a helpful ${profileName} language assistant. When generating meanings and tags for words, provide accurate and useful information.`,
      model_config: {
        provider: 'openai',
        model: 'gpt-4',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        api_key: '' // To be set by user
      },
      last_opened: new Date().toISOString()
    };

    await this.dbManager.setProfileConfig(defaultConfig);
    this.saveProfiles();

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
        system_prompt: `You are a helpful ${profileName} language assistant. When generating meanings and tags for words, provide accurate and useful information.`,
        model_config: {
          provider: 'openai',
          model: 'gpt-4',
          endpoint: 'https://api.openai.com/v1/chat/completions',
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
}
