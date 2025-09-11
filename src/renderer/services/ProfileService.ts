import { ProfileConfig } from '../types.js';

export class ProfileService {
  private profiles: string[] = [];
  private currentProfile: string = '';

  async loadProfiles(): Promise<void> {
    try {
      this.profiles = await window.electronAPI.loadProfiles();
      const currentProfileName = await window.electronAPI.getCurrentProfileName();
      const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;

      profileSelect.innerHTML = '';
      this.profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile;
        option.textContent = profile;
        profileSelect.appendChild(option);
      });

      // Set current profile to the actual current profile from backend
      if (currentProfileName && this.profiles.includes(currentProfileName)) {
        this.currentProfile = currentProfileName;
        profileSelect.value = this.currentProfile;
      } else if (this.profiles.length > 0) {
        // Fallback to first profile if current profile is not found
        this.currentProfile = this.profiles[0];
        profileSelect.value = this.currentProfile;
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  }

  async switchProfile(profileName: string): Promise<boolean> {
    try {
      const success = await window.electronAPI.switchProfile(profileName);
      if (success) {
        this.currentProfile = profileName;
        const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
        profileSelect.value = profileName;
      }
      return success;
    } catch (error) {
      console.error('Error switching profile:', error);
      return false;
    }
  }

  async createProfile(profileName: string): Promise<boolean> {
    try {
      const success = await window.electronAPI.createProfile(profileName);
      if (success) {
        await this.loadProfiles(); // Refresh the profile list
        this.currentProfile = profileName;
        const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
        profileSelect.value = profileName;
      }
      return success;
    } catch (error) {
      console.error('Error creating profile:', error);
      return false;
    }
  }

  async renameProfile(oldName: string, newName: string): Promise<boolean> {
    try {
      const success = await window.electronAPI.renameProfile(oldName, newName);
      if (success) {
        await this.loadProfiles(); // Refresh the profile list
        this.currentProfile = newName;
        const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
        profileSelect.value = newName;
      }
      return success;
    } catch (error) {
      console.error('Error renaming profile:', error);
      return false;
    }
  }

  async deleteProfile(profileName: string): Promise<boolean> {
    try {
      const success = await window.electronAPI.deleteProfile(profileName);
      if (success) {
        await this.loadProfiles(); // Refresh the profile list
        // Backend should have switched to another profile
        const currentProfileName = await window.electronAPI.getCurrentProfileName();
        if (currentProfileName) {
          this.currentProfile = currentProfileName;
          const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
          profileSelect.value = this.currentProfile;
        }
      }
      return success;
    } catch (error) {
      console.error('Error deleting profile:', error);
      return false;
    }
  }

  async getProfileConfig(): Promise<ProfileConfig | null> {
    try {
      return await window.electronAPI.getProfileConfig();
    } catch (error) {
      console.error('Error loading profile config:', error);
      return null;
    }
  }

  async updateProfileConfig(config: any): Promise<boolean> {
    try {
      return await window.electronAPI.updateProfileConfig(config);
    } catch (error) {
      console.error('Error updating profile config:', error);
      return false;
    }
  }

  async exportProfile(): Promise<any> {
    try {
      return await window.electronAPI.exportProfile();
    } catch (error) {
      console.error('Error exporting profile:', error);
      return { success: false, message: 'Failed to export profile' };
    }
  }

  async importProfile(): Promise<any> {
    try {
      return await window.electronAPI.importProfile();
    } catch (error) {
      console.error('Error importing profile:', error);
      return { success: false, message: 'Failed to import profile' };
    }
  }

  getProfiles(): string[] {
    return this.profiles;
  }

  getCurrentProfile(): string {
    return this.currentProfile;
  }

  setCurrentProfile(profileName: string): void {
    this.currentProfile = profileName;
  }
}
