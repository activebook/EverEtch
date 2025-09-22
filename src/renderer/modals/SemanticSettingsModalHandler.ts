import { ModalHandler } from './ModalHandler.js';
import { ToastManager } from '../components/ToastManager.js';
import { UIUtils } from '../utils/UIUtils.js';

export class SemanticSettingsModalHandler extends ModalHandler {
  private isProcessing: boolean = false;

  constructor(
    uiUtils: UIUtils,
    toastManager: ToastManager
  ) {
    super(uiUtils, toastManager);
  }

  /**
   * Show the modal
   */
  async show(): Promise<void> {
    console.log('Loading semantic settings modal');
    const templateLoaded = await this.ensureTemplateLoaded('semantic-settings-modal', 'semantic-settings-modal');
    if (!templateLoaded) return;

    console.log('Showing semantic settings modal');
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

  protected setupModalEvent(): void {
    this.attachEventListeners();
    //await this.loadCurrentConfiguration();
  }

  /**
   * Attach event listeners to modal elements
   */
  private attachEventListeners(): void {
    // Start/Cancel button
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;

    if (startBtn) {
      startBtn.addEventListener('click', () => this.handleStartClick());
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.handleCancelClick());
    }

    // API key visibility toggle
    const toggleApiKeyBtn = document.getElementById('toggle-embedding-api-key') as HTMLButtonElement;
    const apiKeyInput = document.getElementById('embedding-api-key') as HTMLInputElement;

    if (toggleApiKeyBtn && apiKeyInput) {
      toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility(apiKeyInput, toggleApiKeyBtn));
    }

    // Similarity threshold slider
    const thresholdSlider = document.getElementById('similarity-threshold') as HTMLInputElement;
    const thresholdValue = document.getElementById('threshold-value') as HTMLElement;

    if (thresholdSlider && thresholdValue) {
      thresholdSlider.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        thresholdValue.textContent = `${Math.round(value * 100)}%`;
      });
    }
  }

  /**
   * Load current configuration from profile
   */
  private async loadCurrentConfiguration(): Promise<void> {
    try {
      // Load configuration from profile
      const profile = await window.electronAPI.getProfileConfig();
      if (profile && profile.embedding_config) {
        // Load configuration from profile's embedding_config
        this.loadConfigurationFromProfile(profile);
        this.updateStatusIndicator(true);
      } else {
        this.setDefaultConfiguration();
        this.updateStatusIndicator(false);
      }

      // Load statistics
      await this.loadStatistics();
    } catch (error) {
      console.error('Error loading configuration:', error);
      this.showError('Failed to load semantic search configuration');
    }
  }

  /**
   * Load configuration from profile's embedding_config
   */
  private loadConfigurationFromProfile(profile: any): void {
    const providerSelect = document.getElementById('embedding-provider') as HTMLSelectElement;
    const modelInput = document.getElementById('embedding-model') as HTMLInputElement;
    const endpointInput = document.getElementById('embedding-endpoint') as HTMLInputElement;
    const apiKeyInput = document.getElementById('embedding-api-key') as HTMLInputElement;
    const batchSizeInput = document.getElementById('batch-size') as HTMLInputElement;
    const thresholdSlider = document.getElementById('similarity-threshold') as HTMLInputElement;
    const thresholdValue = document.getElementById('threshold-value') as HTMLElement;

    if (providerSelect) providerSelect.value = profile.embedding_config.provider || 'openai';
    if (modelInput) modelInput.value = profile.embedding_config.model || 'text-embedding-ada-002';
    if (endpointInput) endpointInput.value = profile.embedding_config.endpoint || 'https://api.openai.com/v1';
    if (apiKeyInput) apiKeyInput.value = profile.embedding_config.api_key || '';
    if (batchSizeInput) batchSizeInput.value = (profile.embedding_config.batch_size || 10).toString();
    if (thresholdSlider) {
      thresholdSlider.value = (profile.embedding_config.similarity_threshold || 0.5).toString();
      if (thresholdValue) thresholdValue.textContent = `${Math.round((profile.embedding_config.similarity_threshold || 0.5) * 100)}%`;
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
   * Load and display statistics
   * Note: Statistics are now handled through batch processing events
   * This method is kept for backward compatibility but simplified
   */
  private async loadStatistics(): Promise<void> {
    // Statistics will be updated when batch processing completes
    // For now, just hide the statistics section since we don't have direct access to vector DB stats
    const statsSection = document.getElementById('statistics-section') as HTMLElement;
    if (statsSection) {
      statsSection.classList.add('hidden');
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
   * Update UI for processing state
   */
  private updateUIForProcessing(processing: boolean): void {
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
    const formElements = document.querySelectorAll('#semantic-search-settings-modal input, #semantic-search-settings-modal select');

    if (processing) {
      if (startBtn) {
        startBtn.textContent = 'Processing...';
        startBtn.disabled = true;
        startBtn.classList.add('bg-amber-400', 'cursor-not-allowed');
        startBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
      }
      if (cancelBtn) {
        cancelBtn.classList.remove('hidden');
      }

      // Disable form elements
      formElements.forEach((element: any) => {
        element.disabled = true;
      });
    } else {
      if (startBtn) {
        startBtn.textContent = 'Start Processing';
        startBtn.disabled = false;
        startBtn.classList.remove('bg-amber-400', 'cursor-not-allowed');
        startBtn.classList.add('bg-amber-500', 'hover:bg-amber-600');
      }
      if (cancelBtn) {
        cancelBtn.classList.add('hidden');
      }

      // Enable form elements
      formElements.forEach((element: any) => {
        element.disabled = false;
      });
    }
  }

  /**
   * Handle start button click
   */
  private async handleStartClick(): Promise<void> {
    if (this.isProcessing) {
      await this.handleCancelClick();
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
      const currentProfile = await window.electronAPI.getProfileConfig();
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

      const updateResult = await window.electronAPI.updateSemanticConfig(updatedProfile);
      if (!updateResult.success) {
        this.showError(updateResult.message || 'Failed to update profile configuration');
        return;
      }

      // Start batch processing
      this.isProcessing = true;
      this.updateUIForProcessing(true);

      const result = await window.electronAPI.startSemanticBatchProcessing(config);

      if (result.success) {
        this.showSuccess('Semantic search processing completed successfully!');
        this.updateStatusIndicator(true);
        await this.loadStatistics();
      } else {
        this.showError(result.message || 'Processing failed');
      }

    } catch (error) {
      console.error('Error starting semantic search:', error);
      this.showError('Failed to start semantic search');
    } finally {
      this.isProcessing = false;
      this.updateUIForProcessing(false);
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
  private async handleCancelClick(): Promise<void> {
    if (this.isProcessing) {
      this.showSuccess('Semantic search processing cancelled');
    }
    this.hide();
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
