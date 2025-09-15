import { ToastManager } from './ToastManager.js';
import { ProfileService } from '../services/ProfileService.js';

export class ModalManager {
  private toastManager: ToastManager;
  private profileService: ProfileService;

  constructor(toastManager: ToastManager, profileService: ProfileService) {
    this.toastManager = toastManager;
    this.profileService = profileService;
  }

  // Profile modal methods
  showAddProfileModal(): void {
    const input = document.getElementById('new-profile-name') as HTMLInputElement;
    if (input) {
      input.value = '';
    }

    const modal = document.getElementById('add-profile-modal')!;
    modal.classList.remove('hidden');

    setTimeout(() => {
      if (input) {
        input.focus();
      }
    }, 100);
  }

  hideAddProfileModal(): void {
    const modal = document.getElementById('add-profile-modal')!;
    modal.classList.add('hidden');
  }

  async handleCreateProfile(): Promise<void> {
    const input = document.getElementById('new-profile-name') as HTMLInputElement;
    const profileName = input ? input.value.trim() : '';

    if (!profileName) {
      this.toastManager.showError('Profile name cannot be empty');
      return;
    }

    if (this.profileService.getProfiles().includes(profileName)) {
      this.toastManager.showError('A profile with this name already exists');
      return;
    }

    try {
      const success = await this.profileService.createProfile(profileName);
      if (success) {
        this.toastManager.showSuccess(`Profile "${profileName}" created successfully`);
      } else {
        this.toastManager.showError('Failed to create profile');
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      this.toastManager.showError('Failed to create profile');
    }

    this.hideAddProfileModal();
  }

  // Settings modal methods
  async showSettingsModal(): Promise<void> {
    try {
      const profileConfig = await this.profileService.getProfileConfig();
      if (profileConfig) {
        const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
        if (profileNameInput) {
          profileNameInput.value = this.profileService.getCurrentProfile() || '';
        }
        (document.getElementById('system-prompt') as HTMLTextAreaElement).value = profileConfig.system_prompt || '';
        (document.getElementById('model-provider') as HTMLSelectElement).value = profileConfig.model_config.provider || 'openai';
        (document.getElementById('model-name') as HTMLInputElement).value = profileConfig.model_config.model || '';
        (document.getElementById('api-endpoint') as HTMLInputElement).value = profileConfig.model_config.endpoint || '';
        (document.getElementById('api-key') as HTMLInputElement).value = profileConfig.model_config.api_key || '';
      }
    } catch (error) {
      console.error('Error loading profile config:', error);
      this.toastManager.showError('Failed to load profile settings');
    }

    const modal = document.getElementById('settings-modal')!;
    modal.classList.remove('hidden');
  }

  hideSettingsModal(): void {
    const modal = document.getElementById('settings-modal')!;
    modal.classList.add('hidden');
  }

  async saveSettings(): Promise<void> {
    const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
    const profileName = profileNameInput ? profileNameInput.value.trim() : '';
    const systemPrompt = (document.getElementById('system-prompt') as HTMLTextAreaElement).value;
    const modelProvider = (document.getElementById('model-provider') as HTMLSelectElement).value;
    const modelName = (document.getElementById('model-name') as HTMLInputElement).value;
    const apiEndpoint = (document.getElementById('api-endpoint') as HTMLInputElement).value;
    const apiKey = (document.getElementById('api-key') as HTMLInputElement).value;

    if (!profileName) {
      this.toastManager.showError('Profile name cannot be empty');
      return;
    }

    const config = {
      system_prompt: systemPrompt,
      model_config: {
        provider: modelProvider,
        model: modelName,
        endpoint: apiEndpoint,
        api_key: apiKey
      }
    };

    try {
      const success = await this.profileService.updateProfileConfig(config);
      if (success) {
        if (profileName !== this.profileService.getCurrentProfile()) {
          const success = await this.profileService.renameProfile(this.profileService.getCurrentProfile(), profileName);
          if (success) {
            await this.profileService.loadProfiles();
            this.profileService.setCurrentProfile(profileName);
            const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
            profileSelect.value = profileName;
          } else {
            this.toastManager.showError('Failed to rename profile');
            return;
          }
        }

        this.toastManager.showSuccess('Settings saved successfully');
        this.hideSettingsModal();
      } else {
        this.toastManager.showError('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      this.toastManager.showError('Failed to save settings');
    }
  }

  async handleDeleteProfile(): Promise<void> {
    if (this.profileService.getProfiles().length <= 1) {
      this.toastManager.showError('Cannot delete the last remaining profile');
      return;
    }

    const confirmed = confirm(`Are you sure you want to delete the profile "${this.profileService.getCurrentProfile()}"? This action cannot be undone and will delete all words in this profile.`);
    if (!confirmed) {
      return;
    }

    try {
      const success = await this.profileService.deleteProfile(this.profileService.getCurrentProfile());
      if (success) {
        this.toastManager.showSuccess(`Profile "${this.profileService.getCurrentProfile()}" deleted successfully.`);

        // Refresh profiles and trigger UI update for the new current profile
        await this.profileService.loadProfiles();
        const currentProfile = this.profileService.getCurrentProfile();
        if (currentProfile) {
          // Directly trigger the profile switch UI update
          // This will be handled by dispatching a custom event that the EventManager listens for
          const profileSwitchEvent = new CustomEvent('profile-switched', {
            detail: { profileName: currentProfile }
          });
          document.dispatchEvent(profileSwitchEvent);
        }
      } else {
        this.toastManager.showError('Failed to delete profile');
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      this.toastManager.showError('Failed to delete profile');
    }

    this.hideSettingsModal();
  }

  async handleExportProfile(): Promise<void> {
    try {
      const result = await this.profileService.exportProfile();
      if (result.success) {
        this.toastManager.showSuccess(result.message);
      } else {
        this.toastManager.showError(result.message);
      }
    } catch (error) {
      console.error('Error exporting profile:', error);
      this.toastManager.showError('Failed to export profile');
    }
  }

  async handleImportProfile(): Promise<void> {
    try {
      const result = await this.profileService.importProfile();
      if (result.success) {
        this.toastManager.showSuccess(result.message);

        if (result.profileName) {
          // Refresh profiles and switch to the new one
          await this.profileService.loadProfiles();

          this.profileService.setCurrentProfile(result.profileName);

          // Directly trigger the profile switch UI update
          // This will be handled by dispatching a custom event that the EventManager listens for
          const profileSwitchEvent = new CustomEvent('profile-switched', {
            detail: { profileName: result.profileName }
          });
          document.dispatchEvent(profileSwitchEvent);
        }
      } else {
        this.toastManager.showError(result.message);
      }
    } catch (error) {
      console.error('Error importing profile:', error);
      this.toastManager.showError('Failed to import profile');
    }
  }

  toggleApiKeyVisibility(): void {
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const eyeIcon = document.getElementById('eye-icon') as HTMLElement;
    const eyeOffIcon = document.getElementById('eye-off-icon') as HTMLElement;

    if (apiKeyInput && eyeIcon && eyeOffIcon) {
      if (apiKeyInput.type === 'password') {
        // Show password
        apiKeyInput.type = 'text';
        eyeIcon.classList.add('hidden');
        eyeOffIcon.classList.remove('hidden');
      } else {
        // Hide password
        apiKeyInput.type = 'password';
        eyeIcon.classList.remove('hidden');
        eyeOffIcon.classList.add('hidden');
      }
    }
  }

  // Howto modal methods
  async showHowtoModal(): Promise<void> {
    try {
      // Load markdown content from assets/howto.md
      const response = await fetch('../../assets/howto.md');
      if (!response.ok) {
        throw new Error(`Failed to load howto.md: ${response.status}`);
      }

      const markdown = await response.text();

      // Convert markdown to HTML using the existing IPC method
      const htmlContent = await window.electronAPI.processMarkdown(markdown);

      // Insert into modal
      const contentDiv = document.getElementById('howto-content')!;
      contentDiv.innerHTML = htmlContent;

      // Show modal
      const modal = document.getElementById('howto-modal')!;
      modal.classList.remove('hidden');
    } catch (error) {
      console.error('Error loading howto content:', error);
      this.toastManager.showError('Failed to load help content');
    }
  }

  hideHowtoModal(): void {
    const modal = document.getElementById('howto-modal')!;
    modal.classList.add('hidden');
  }

  // Import/Export modal methods
  showExportChoiceModal(): void {
    const modal = document.getElementById('export-choice-modal')!;
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  hideExportChoiceModal(): void {
    const modal = document.getElementById('export-choice-modal')!;
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  showImportChoiceModal(): void {
    const modal = document.getElementById('import-choice-modal')!;
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  hideImportChoiceModal(): void {
    const modal = document.getElementById('import-choice-modal')!;
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  // Word import modal methods
  showImportWordsModal(): void {
    const modal = document.getElementById('import-words-modal')!;
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  hideImportWordsModal(): void {
    const modal = document.getElementById('import-words-modal')!;
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  // Google Drive modal methods
  hideGoogleDriveFilePicker(): void {
    const modal = document.getElementById('google-drive-picker-modal')!;
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  hideGoogleDriveUploadModal(): void {
    const modal = document.getElementById('google-drive-upload-modal')!;
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  // Generic modal utilities
  showModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  hideModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  // Setup modal event handlers
  setupModalEventHandlers(): void {
    // Add profile modal
    const cancelAddProfileBtn = document.getElementById('cancel-add-profile') as HTMLButtonElement;
    const createProfileBtn = document.getElementById('create-profile') as HTMLButtonElement;

    if (cancelAddProfileBtn) {
      cancelAddProfileBtn.addEventListener('click', () => this.hideAddProfileModal());
    }
    if (createProfileBtn) {
      createProfileBtn.addEventListener('click', () => this.handleCreateProfile());
    }

    // Settings modal
    const cancelSettingsBtn = document.getElementById('cancel-settings') as HTMLButtonElement;
    const saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;
    const deleteProfileBtn = document.getElementById('delete-profile-btn') as HTMLButtonElement;
    const toggleApiKeyBtn = document.getElementById('toggle-api-key-visibility') as HTMLButtonElement;

    if (cancelSettingsBtn) {
      cancelSettingsBtn.addEventListener('click', () => this.hideSettingsModal());
    }
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    }
    if (deleteProfileBtn) {
      deleteProfileBtn.addEventListener('click', () => this.handleDeleteProfile());
    }
    if (toggleApiKeyBtn) {
      toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility());
    }

    // Howto modal
    const closeHowtoBtn = document.getElementById('close-howto-btn') as HTMLButtonElement;
    if (closeHowtoBtn) {
      closeHowtoBtn.addEventListener('click', () => this.hideHowtoModal());
    }

    // Export choice modal
    const exportLocalBtn = document.getElementById('export-local-btn') as HTMLButtonElement;
    const cancelExportChoice = document.getElementById('cancel-export-choice') as HTMLButtonElement;

    if (exportLocalBtn) {
      exportLocalBtn.addEventListener('click', () => {
        this.hideExportChoiceModal();
        // Export functionality will be handled by the main app
      });
    }
    if (cancelExportChoice) {
      cancelExportChoice.addEventListener('click', () => this.hideExportChoiceModal());
    }

    // Import choice modal
    const importLocalBtn = document.getElementById('import-local-btn') as HTMLButtonElement;
    const cancelImportChoice = document.getElementById('cancel-import-choice') as HTMLButtonElement;

    if (importLocalBtn) {
      importLocalBtn.addEventListener('click', () => {
        this.hideImportChoiceModal();
        // Import functionality will be handled by the main app
      });
    }
    if (cancelImportChoice) {
      cancelImportChoice.addEventListener('click', () => this.hideImportChoiceModal());
    }

    // Word import modal
    const selectFileBtn = document.getElementById('select-import-file') as HTMLButtonElement;
    const startImportBtn = document.getElementById('start-import-btn') as HTMLButtonElement;
    const cancelImportBtn = document.getElementById('cancel-import-btn') as HTMLButtonElement;
    const closeImportModalBtn = document.getElementById('close-import-modal') as HTMLButtonElement;

    if (selectFileBtn) {
      selectFileBtn.addEventListener('click', () => {
        // File selection will be handled by the main app
      });
    }
    if (startImportBtn) {
      startImportBtn.addEventListener('click', () => {
        // Import start will be handled by the main app
      });
    }
    if (cancelImportBtn) {
      cancelImportBtn.addEventListener('click', () => {
        // Import cancel will be handled by the main app
      });
    }
    if (closeImportModalBtn) {
      closeImportModalBtn.addEventListener('click', () => this.hideImportWordsModal());
    }

    // Google Drive modals
    const cancelGoogleDrivePicker = document.getElementById('cancel-google-drive-picker') as HTMLButtonElement;
    const closeUploadModalBtn = document.getElementById('close-google-drive-upload-modal') as HTMLButtonElement;

    if (cancelGoogleDrivePicker) {
      cancelGoogleDrivePicker.addEventListener('click', () => {
        this.hideGoogleDriveFilePicker();
        // Reset selection will be handled by the main app
      });
    }
    if (closeUploadModalBtn) {
      closeUploadModalBtn.addEventListener('click', () => this.hideGoogleDriveUploadModal());
    }
  }
}
