import { ModalHandler } from './ModalHandler.js';
import { ToastManager } from '../components/ToastManager.js';
import { ProfileService } from '../services/ProfileService.js';
import { CustomModelDropdown } from '../components/CustomModelDropdown.js';
import { UIUtils } from '../utils/UIUtils.js';
import { ProfileConfig } from '../types.js';

export enum ButtonState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error'
}

export class SemanticSettingsModalHandler extends ModalHandler {
  private isProcessing: boolean = false;
  private currentButtonState: ButtonState = ButtonState.IDLE;
  private profileService: ProfileService;
  private modelDropdown: CustomModelDropdown;

  constructor(
    uiUtils: UIUtils,
    toastManager: ToastManager,
    profileService: ProfileService
  ) {
    super(uiUtils, toastManager);
    this.profileService = profileService;
    this.modelDropdown = new CustomModelDropdown();
  }

  /**
   * Show the modal
   */
  async show(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('semantic-settings-modal', 'semantic-settings-modal');
    if (!templateLoaded) return;

    try {
      this.loadCurrentConfiguration();
      // Reset the model dropdown selection
      this.modelDropdown.resetSelectModel();
    } catch (error) {
      console.error('Error loading profile config:', error);
      this.showError('Failed to load profile settings');
    }

    this.showModal('semantic-settings-modal');
    await this.loadCurrentConfiguration();
  }

  /**
   * Hide the modal
   */
  hide(): void {
    if (this.isProcessing) {
      this.showError('Cannot close modal while processing is in progress');
      return;
    }
    this.hideModal('semantic-settings-modal');
  }

  /**
   * Attach event listeners to modal elements
   */
  protected setupModalEvent(): void {
    // Start/Cancel button
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    const closeBtn = document.getElementById('close-btn') as HTMLButtonElement;

    if (startBtn && !startBtn._listenerAdded) {
      startBtn._listenerAdded = true;
      startBtn.addEventListener('click', () => this.handleStartBatch());
    }

    if (closeBtn && !closeBtn._listenerAdded) {
      closeBtn._listenerAdded = true;
      closeBtn.addEventListener('click', () => this.hide());
    }

    // API key visibility toggle
    const toggleApiKeyBtn = document.getElementById('toggle-embedding-api-key') as HTMLButtonElement;
    const apiKeyInput = document.getElementById('embedding-api-key') as HTMLInputElement;

    if (toggleApiKeyBtn && !toggleApiKeyBtn._listenerAdded) {
      toggleApiKeyBtn._listenerAdded = true;
      toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility(apiKeyInput, toggleApiKeyBtn));
    }

    // Similarity threshold slider
    const thresholdSlider = document.getElementById('similarity-threshold') as HTMLInputElement;
    const thresholdValue = document.getElementById('threshold-value') as HTMLElement;

    if (thresholdSlider && !thresholdSlider._listenerAdded) {
      thresholdSlider._listenerAdded = true;
      thresholdSlider.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        thresholdValue.textContent = `${Math.round(value * 100)}%`;
      });
    }

    // Set up model dropdown

    // Initialize button state to IDLE
    this.currentButtonState = ButtonState.IDLE;
    this.updateButtonState(ButtonState.IDLE);

    // Set up batch events
    this.setupBatchEvents();
  }

  private setupBatchEvents(): void {
    // Set up word meaning streaming listener
    window.electronAPI.onSemanticBatchProgress((progress: { processed: number; total: number; }) => {
      this.handleSemanticBatchProgress(progress);
    });

    // Set up word metadata ready listener
    window.electronAPI.onSemanticBatchComplete((result: {
      success: boolean;
      totalWords: number;
      processed: number;
      failed: number;
      error: string;
      duration: number;
    }) => {
      this.handleSemanticBatchComplete(result);
    });
  }

  private handleSemanticBatchProgress(progress: { processed: number; total: number; }): void {
    const progressBar = document.getElementById('progress-bar') as HTMLProgressElement;
    const progressText = document.getElementById('progress-text') as HTMLElement;

    if (progressBar && progressText) {
      progressBar.value = progress.processed;
      progressBar.max = progress.total;
      progressText.textContent = `${progress.processed} / ${progress.total}`
    }
  }

  private handleSemanticBatchComplete(result: {
    success: boolean;
    totalWords: number;
    processed: number;
    failed: number;
    error: string;
    duration: number;
  }): void {
    this.isProcessing = false;

    if (result.success) {
      this.updateButtonState(ButtonState.COMPLETED);
      this.showSuccess(`Semantic search completed successfully. Total words: ${result.totalWords}, Processed: ${result.processed}, Failed: ${result.failed}`);
    } else {
      this.updateButtonState(ButtonState.ERROR);
      this.showError(`Semantic search failed: ${result.error}`);
    }
  }

  /**
   * Load current configuration from profile
   */
  private async loadCurrentConfiguration(): Promise<void> {
    try {
      // Load configuration from profile
      const profileConfig = await this.profileService.getProfileConfig();
      if (profileConfig && profileConfig.embedding_config) {
        // Load configuration from profile's embedding_config
        this.loadConfigurationFromProfile(profileConfig);
        this.updateStatusIndicator(true);
      } else {
        this.setDefaultConfiguration();
        this.updateStatusIndicator(false);
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
      this.showError('Failed to load semantic search configuration');
    }
  }

  /**
   * Load configuration from profile's embedding_config
   */
  private loadConfigurationFromProfile(profile: ProfileConfig): void {
    const providerSelect = document.getElementById('embedding-provider') as HTMLSelectElement;
    const modelInput = document.getElementById('embedding-model') as HTMLInputElement;
    const endpointInput = document.getElementById('embedding-endpoint') as HTMLInputElement;
    const apiKeyInput = document.getElementById('embedding-api-key') as HTMLInputElement;
    const batchSizeInput = document.getElementById('batch-size') as HTMLInputElement;
    const thresholdSlider = document.getElementById('similarity-threshold') as HTMLInputElement;
    const thresholdValue = document.getElementById('threshold-value') as HTMLElement;

    if (providerSelect) providerSelect.value = profile.embedding_config?.provider || 'openai';
    if (modelInput) modelInput.value = profile.embedding_config?.model || 'text-embedding-ada-002';
    if (endpointInput) endpointInput.value = profile.embedding_config?.endpoint || 'https://api.openai.com/v1';
    if (apiKeyInput) apiKeyInput.value = profile.embedding_config?.api_key || '';
    if (batchSizeInput) batchSizeInput.value = (profile.embedding_config?.batch_size || 10).toString();
    if (thresholdSlider) {
      thresholdSlider.value = (profile.embedding_config?.similarity_threshold || 0.5).toString();
      if (thresholdValue) thresholdValue.textContent = `${Math.round((profile.embedding_config?.similarity_threshold || 0.5) * 100)}%`;
    }
  }

  /**
   * Set default configuration values
   */
  private setDefaultConfiguration(): void {
    const providerSelect = document.getElementById('embedding-provider') as HTMLSelectElement;
    const modelInput = document.getElementById('embedding-model') as HTMLInputElement;
    const endpointInput = document.getElementById('embedding-endpoint') as HTMLInputElement;
    const batchSizeInput = document.getElementById('batch-size') as HTMLInputElement;
    const thresholdSlider = document.getElementById('similarity-threshold') as HTMLInputElement;
    const thresholdValue = document.getElementById('threshold-value') as HTMLElement;

    if (providerSelect) providerSelect.value = 'openai';
    if (modelInput) modelInput.value = 'text-embedding-ada-002';
    if (endpointInput) endpointInput.value = 'https://api.openai.com/v1';
    if (batchSizeInput) batchSizeInput.value = '10';
    if (thresholdSlider) {
      thresholdSlider.value = '0.5';
      if (thresholdValue) thresholdValue.textContent = '50%';
    }
  }

  /**
   * Update status indicator
   */
  private updateStatusIndicator(enabled: boolean): void {
    const statusIcon = document.getElementById('status-icon') as HTMLElement;
    const statusText = document.getElementById('status-text') as HTMLElement;

    if (enabled) {
      if (statusIcon) {
        statusIcon.className = 'w-3 h-3 bg-green-500 rounded-full mr-3';
      }
      if (statusText) {
        statusText.textContent = 'Semantic search is enabled';
        statusText.className = 'text-sm font-medium text-green-700';
      }
    } else {
      if (statusIcon) {
        statusIcon.className = 'w-3 h-3 bg-gray-400 rounded-full mr-3';
      }
      if (statusText) {
        statusText.textContent = 'Semantic search is disabled';
        statusText.className = 'text-sm font-medium text-slate-700';
      }
    }
  }

  /**
   * Get configuration from form
   */
  private getConfigurationFromForm(): any {
    const providerSelect = document.getElementById('embedding-provider') as HTMLSelectElement;
    const modelInput = document.getElementById('embedding-model') as HTMLInputElement;
    const endpointInput = document.getElementById('embedding-endpoint') as HTMLInputElement;
    const apiKeyInput = document.getElementById('embedding-api-key') as HTMLInputElement;
    const batchSizeInput = document.getElementById('batch-size') as HTMLInputElement;
    const thresholdSlider = document.getElementById('similarity-threshold') as HTMLInputElement;

    if (!providerSelect || !modelInput || !endpointInput || !apiKeyInput || !batchSizeInput || !thresholdSlider) {
      this.showError('Form elements not found');
      return null;
    }

    return {
      provider: providerSelect.value,
      model: modelInput.value.trim(),
      endpoint: endpointInput.value.trim(),
      api_key: apiKeyInput.value.trim(),
      batch_size: parseInt(batchSizeInput.value) || 10,
      similarity_threshold: parseFloat(thresholdSlider.value) || 0.5
    };
  }

  /**
   * Update button state with sophisticated UI management
   */
  private updateButtonState(newState: ButtonState): void {
    this.currentButtonState = newState;
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
    const formElements = document.querySelectorAll('#semantic-search-settings-modal input, #semantic-search-settings-modal select');

    // Remove all existing classes first
    if (startBtn) {
      startBtn.className = 'px-6 py-2 rounded-lg transition-all duration-200 hover:shadow-lg font-medium text-sm';
    }

    switch (newState) {
      case ButtonState.IDLE:
        if (startBtn) {
          startBtn.textContent = 'Start Processing';
          startBtn.disabled = false;
          startBtn.classList.add('bg-blue-500', 'hover:bg-blue-600', 'text-white');
          this.setupButtonHoverEffect(startBtn, 'Start Processing', 'bg-blue-500 hover:bg-blue-600');
        }
        // Cancel button always visible and just closes modal
        if (cancelBtn) {
          cancelBtn.classList.remove('hidden');
        }
        // Enable form elements
        formElements.forEach((element: any) => {
          element.disabled = false;
        });
        break;

      case ButtonState.PROCESSING:
        if (startBtn) {
          startBtn.textContent = 'Processing...';
          startBtn.disabled = true;
          startBtn.classList.add('bg-amber-400', 'cursor-not-allowed', 'text-white');
          this.setupButtonHoverEffect(startBtn, 'Stop', 'bg-red-500 hover:bg-red-600');
        }
        // Cancel button always visible and just closes modal
        if (cancelBtn) {
          cancelBtn.classList.remove('hidden');
        }
        // Disable form elements
        formElements.forEach((element: any) => {
          element.disabled = true;
        });
        break;

      case ButtonState.COMPLETED:
        if (startBtn) {
          startBtn.textContent = 'Started';
          startBtn.disabled = false;
          startBtn.classList.add('bg-green-500', 'hover:bg-green-600', 'text-white');
          this.setupButtonHoverEffect(startBtn, 'Stop', 'bg-red-500 hover:bg-red-600');
        }
        // Cancel button always visible and just closes modal
        if (cancelBtn) {
          cancelBtn.classList.add('hidden');
        }
        // Enable form elements
        formElements.forEach((element: any) => {
          element.disabled = false;
        });
        break;

      case ButtonState.ERROR:
        if (startBtn) {
          startBtn.textContent = 'Start';
          startBtn.disabled = false;
          startBtn.classList.add('bg-blue-500', 'hover:bg-blue-600', 'text-white');
          this.setupButtonHoverEffect(startBtn, 'Start', 'bg-blue-500 hover:bg-blue-600');
        }
        // Cancel button always visible and just closes modal
        if (cancelBtn) {
          cancelBtn.classList.remove('hidden');
        }
        // Enable form elements
        formElements.forEach((element: any) => {
          element.disabled = false;
        });
        break;
    }
  }

  /**
   * Setup hover effects for buttons
   */
  private setupButtonHoverEffect(button: HTMLButtonElement, hoverText: string, hoverClasses: string): void {
    let hoverSetup = false;

    const setupHover = () => {
      if (!hoverSetup) {
        button.addEventListener('mouseenter', () => {
          if (this.currentButtonState === ButtonState.PROCESSING && hoverText === 'Stop') {
            button.textContent = hoverText;
            button.className = 'px-6 py-2 rounded-lg transition-all duration-200 hover:shadow-lg font-medium text-sm bg-red-500 hover:bg-red-600 text-white';
          } else if (this.currentButtonState === ButtonState.COMPLETED && hoverText === 'Stop') {
            button.textContent = hoverText;
            button.className = 'px-6 py-2 rounded-lg transition-all duration-200 hover:shadow-lg font-medium text-sm bg-red-500 hover:bg-red-600 text-white';
          }
        });

        button.addEventListener('mouseleave', () => {
          this.updateButtonState(this.currentButtonState);
        });

        hoverSetup = true;
      }
    };

    setupHover();
  }

  /**
   * Handle start button click
   */
  private async handleStartBatch(): Promise<void> {
    if (this.isProcessing) {
      await this.handleCancelBatch();
      return;
    }

    try {
      // Validate configuration
      const isValid = await this.validateConfiguration();
      if (!isValid) {
        return;
      }

      // Get configuration from form
      const config = this.getConfigurationFromForm();
      if (!config) {
        return;
      }

      // Update profile with embedding configuration
      const currentProfile = await this.profileService.getProfileConfig();
      if (!currentProfile) {
        this.showError('No profile selected');
        return;
      }

      // Update the profile with the new embedding configuration
      const updatedProfile = {
        ...currentProfile,
        embedding_config: {
          ...config,
          enabled: true
        }
      };

      // Start batch processing
      this.isProcessing = true;
      this.updateButtonState(ButtonState.PROCESSING);

      const result = await window.electronAPI.startSemanticBatchProcessing(config);

      if (result.success) {
        this.showSuccess('Semantic search processing completed successfully!');
        this.updateStatusIndicator(true);
      } else {
        this.showError(result.message || 'Processing failed');
      }

    } catch (error) {
      console.error('Error starting semantic search:', error);
      this.showError('Failed to start semantic search');
    } finally {
      this.isProcessing = false;
      //this.updateButtonState(ButtonState.IDLE);
    }
  }

  /**
   * Validate configuration
   */
  private async validateConfiguration(): Promise<boolean> {
    const apiKeyInput = document.getElementById('embedding-api-key') as HTMLInputElement;
    const modelInput = document.getElementById('embedding-model') as HTMLInputElement;
    const endpointInput = document.getElementById('embedding-endpoint') as HTMLInputElement;

    if (!apiKeyInput?.value.trim()) {
      this.showError('API key is required');
      return false;
    }

    if (!modelInput?.value.trim()) {
      this.showError('Model name is required');
      return false;
    }

    if (!endpointInput?.value.trim()) {
      this.showError('API endpoint is required');
      return false;
    }

    return true;
  }

  /**
   * Handle cancel button click
   */
  private async handleCancelBatch(): Promise<void> {
    if (this.isProcessing) {
      try {
        const result = await window.electronAPI.cancelSemanticBatchProcessing();
        if (result.success) {
          this.showSuccess('Semantic search processing cancelled');
        } else {
          this.showError(result.message || 'Cancel processing failed');
        }
      } catch (error) {
        console.error('Error cancelling semantic search:', error);
        this.showError('Failed to cancel semantic search');
      } finally {
        this.isProcessing = false;
        this.updateButtonState(ButtonState.IDLE);
      }
    }
  }

  /**
   * Toggle API key visibility
   */
  private toggleApiKeyVisibility(input: HTMLInputElement, button: HTMLButtonElement): void {
    const eyeIcon = document.getElementById('embedding-eye-icon') as HTMLElement;
    const eyeOffIcon = document.getElementById('embedding-eye-off-icon') as HTMLElement;

    if (input.type === 'password') {
      input.type = 'text';
      if (eyeIcon) eyeIcon.classList.add('hidden');
      if (eyeOffIcon) eyeOffIcon.classList.remove('hidden');
    } else {
      input.type = 'password';
      if (eyeIcon) eyeIcon.classList.remove('hidden');
      if (eyeOffIcon) eyeOffIcon.classList.add('hidden');
    }
  }
}
