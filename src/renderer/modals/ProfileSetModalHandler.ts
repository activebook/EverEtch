import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ProfileService } from '../services/ProfileService.js';
import { ModelMemoService } from '../services/ModelMemoService.js';
import { CustomModelDropdown } from '../components/CustomModelDropdown.js';
import { ModalHandler } from './ModalHandler.js';

export class ProfileSetModalHandler extends ModalHandler {
  private profileService: ProfileService;
  private modelMemoService: ModelMemoService;
  private modelDropdown: CustomModelDropdown;

  constructor(
    uiUtils: UIUtils,
    toastManager: ToastManager,
    profileService: ProfileService,
    modelMemoService: ModelMemoService
  ) {
    super(uiUtils, toastManager);
    this.profileService = profileService;
    this.modelMemoService = modelMemoService;
    this.modelDropdown = new CustomModelDropdown();
  }

  // Settings Modal methods
  async show(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('settings-modal', 'settings-modal');
    if (!templateLoaded) return;

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
      // Reset the model dropdown selection
      this.modelDropdown.resetSelectModel();
    } catch (error) {
      console.error('Error loading profile config:', error);
      this.showError('Failed to load profile settings');
    }

    this.showModal('settings-modal');
  }

  hide(): void {
    this.hideModal('settings-modal');
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
      this.showError('Profile name cannot be empty');
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
            this.showError('Failed to rename profile');
            return;
          }
        }

        this.showSuccess('Settings saved successfully');
        this.hide();
      } else {
        this.showError('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showError('Failed to save settings');
    }
  }

  async handleDeleteProfile(): Promise<void> {
    if (this.profileService.getProfiles().length <= 1) {
      this.showError('Cannot delete the last remaining profile');
      return;
    }

    const confirmed = confirm(`Are you sure you want to delete the profile "${this.profileService.getCurrentProfile()}"? This action cannot be undone and will delete all words in this profile.`);
    if (!confirmed) {
      return;
    }

    try {
      const success = await this.profileService.deleteProfile(this.profileService.getCurrentProfile());
      if (success) {
        this.showSuccess(`Profile "${this.profileService.getCurrentProfile()}" deleted successfully.`);

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
        this.showError('Failed to delete profile');
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      this.showError('Failed to delete profile');
    }

    this.hide();
  }

  private toggleApiKeyVisibility(): void {
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

  protected setupModalEvent(): void {
    const cancelSettingsBtn = document.getElementById('cancel-settings') as HTMLButtonElement;
    const saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;
    const deleteProfileBtn = document.getElementById('delete-profile-btn') as HTMLButtonElement;
    const toggleApiKeyBtn = document.getElementById('toggle-api-key-visibility') as HTMLButtonElement;

    if (cancelSettingsBtn && !cancelSettingsBtn._listenerAdded) {
      cancelSettingsBtn._listenerAdded = true;
      cancelSettingsBtn.addEventListener('click', () => this.hide());
    }
    if (saveSettingsBtn && !saveSettingsBtn._listenerAdded) {
      saveSettingsBtn._listenerAdded = true;
      saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    }
    if (deleteProfileBtn && !deleteProfileBtn._listenerAdded) {
      deleteProfileBtn._listenerAdded = true;
      deleteProfileBtn.addEventListener('click', () => this.handleDeleteProfile());
    }
    if (toggleApiKeyBtn && !toggleApiKeyBtn._listenerAdded) {
      toggleApiKeyBtn._listenerAdded = true;
      toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility());
    }

    // Custom model memo dropdown button
    const modelDropdownBtn = document.getElementById('model-dropdown-btn') as HTMLButtonElement;
    if (modelDropdownBtn && !modelDropdownBtn._listenerAdded) {
      modelDropdownBtn._listenerAdded = true;
      modelDropdownBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showCustomModelDropdown();
      });
      modelDropdownBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showCustomModelDropdown();
        }
      });
    }
  }

  private async showCustomModelDropdown(): Promise<void> {
    const modelDropdownBtn = document.getElementById('model-dropdown-btn') as HTMLButtonElement;
    const models = await this.modelMemoService.loadChatModelMemos();    
    this.modelDropdown.show(models, modelDropdownBtn, {
      onModelSelected: (modelName) => this.handleModelSelection(modelName),
      onModelDeleted: (modelName) => this.handleModelDeletion(modelName),
      onModelSaved: () => this.handleModelSave()
    });
  }

  private async handleModelSelection(modelName: string): Promise<boolean> {
    try {
      const result = await this.modelMemoService.getModelMemo(modelName);

      if (result.success && result.model) {
        const model = result.model;

        // Populate form fields
        (document.getElementById('model-provider') as HTMLSelectElement).value = model.provider;
        (document.getElementById('model-name') as HTMLInputElement).value = model.model;
        (document.getElementById('api-endpoint') as HTMLInputElement).value = model.endpoint;
        (document.getElementById('api-key') as HTMLInputElement).value = model.apiKey;

        // Mark model as used
        await this.modelMemoService.markModelUsed(modelName);

        this.showSuccess(`Model "${model.name}" loaded successfully`);
        return true;
      } else {
        this.showError(result.message || 'Failed to load model');
      }
    } catch (error) {
      console.error('Error selecting model from dropdown:', error);
      this.showError('Failed to load model configuration');
    }
    return false;
  }

  private async handleModelDeletion(modelName: string): Promise<boolean> {
    const confirmed = confirm(`Are you sure you want to delete the model "${modelName}"?`);
    if (!confirmed) {
      return false;
    }

    try {
      const deleteResult = await this.modelMemoService.deleteModelMemo(modelName);

      if (deleteResult.success) {
        this.showSuccess(`Model "${modelName}" deleted successfully`);
        // Hide the dropdown
        this.modelDropdown.hide();
        // Reload model list
        this.showCustomModelDropdown();
        return true;
      } else {
        this.showError(deleteResult.message || 'Failed to delete model');
      }
    } catch (error) {
      console.error('Error deleting model from dropdown:', error);
      this.showError('Failed to delete model configuration');
    }
    return false;
  }

  private async handleModelSave(): Promise<boolean> {
    const providerElement = document.getElementById('model-provider') as HTMLSelectElement;
    const modelElement = document.getElementById('model-name') as HTMLInputElement;
    const endpointElement = document.getElementById('api-endpoint') as HTMLInputElement;
    const apiKeyElement = document.getElementById('api-key') as HTMLInputElement;

    if (!providerElement || !modelElement || !endpointElement || !apiKeyElement) {
      this.showError('Form elements not found');
      return false;
    }

    const provider = providerElement.value as 'openai' | 'google';
    const model = modelElement.value.trim();
    const endpoint = endpointElement.value.trim();
    const apiKey = apiKeyElement.value.trim();

    if (!model) {
      this.showError('Model name cannot be empty');
      return false;
    }

    try {
      const result = await this.modelMemoService.addModelMemo({
        name: "",
        provider,
        model,
        endpoint,
        apiKey,
        type: 'chat',
      });

      if (result.success) {
        const memoName = result.model?.name;
        this.showSuccess(`Model "${memoName}" saved successfully`);
        // Hide the dropdown
        this.modelDropdown.hide();
        // Reload model list
        this.showCustomModelDropdown();
        return true;
      } else {
        this.showError(result.message || 'Failed to save model');
      }
    } catch (error) {
      console.error('Error saving model from dropdown:', error);
      this.showError('Failed to save model configuration');
    }
    return false;
  }
}
