import { ModalHandler } from './ModalHandler.js';
import { ToastManager } from '../components/ToastManager.js';
import { ProfileService } from '../services/ProfileService.js';
import { ModelMemoService } from '../services/ModelMemoService.js';
import { CustomModelDropdown } from '../components/CustomModelDropdown.js';
import { UIUtils } from '../utils/UIUtils.js';
import { ProfileConfig } from '../types.js';

export enum ButtonState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error'
}

const START_BTN_TEXT_IDLE = "Start Semantic Search";
const START_BTN_TEXT_COMPLETED = "Semantic Search Started";
const START_BTN_TEXT_PROCESSING = "In Processing...";

export class SemanticSettingsModalHandler extends ModalHandler {
  private isProcessing: boolean = false;
  private profileService: ProfileService;
  private modelMemoService: ModelMemoService;
  private modelDropdown: CustomModelDropdown;
  private batchEventsRegistered: boolean = false;

  constructor(
    uiUtils: UIUtils,
    toastManager: ToastManager,
    profileService: ProfileService,
    modelMemoService: ModelMemoService
  ) {
    super(uiUtils, toastManager);
    this.profileService = profileService;
    this.modelMemoService = modelMemoService;
    this.modelDropdown = new CustomModelDropdown('embedding-model-dropdown');
  }

  /**
   * Show the modal
   */
  async show(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('semantic-settings-modal', 'semantic-settings-modal');
    if (!templateLoaded) return;

    try {
      await this.loadCurrentConfiguration();
      // Reset the model dropdown selection
      this.modelDropdown.resetSelectModel();
    } catch (error) {
      console.error('Error loading profile config:', error);
      this.showError('Failed to load profile settings');
    }

    this.showModal('semantic-settings-modal');
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
    // Start/Stop button
    const startBtn = document.getElementById('semantic-batch-start-btn') as HTMLButtonElement;
    const stopBtn = document.getElementById('semantic-batch-stop-btn') as HTMLButtonElement;
    const closeBtn = document.getElementById('semantic-settings-close-modal-btn') as HTMLButtonElement;

    if (startBtn && !startBtn._listenerAdded) {
      startBtn._listenerAdded = true;
      startBtn.addEventListener('click', () => this.handleStartBatch());
    }

    if (stopBtn && !stopBtn._listenerAdded) {
      stopBtn._listenerAdded = true;
      stopBtn.addEventListener('click', () => this.handleStopBatch());
    }

    if (closeBtn && !closeBtn._listenerAdded) {
      closeBtn._listenerAdded = true;
      closeBtn.addEventListener('click', () => this.hide());
    }

    // API key visibility toggle
    const toggleApiKeyBtn = document.getElementById('toggle-embedding-api-key') as HTMLButtonElement;
    const apiKeyInput = document.getElementById('embedding-api-key') as HTMLInputElement;

    if (toggleApiKeyBtn && !toggleApiKeyBtn._listenerAdded) {
      toggleApiKeyBtn.disabled = false; // Enable the button
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

    // Set up embedding model dropdown
    this.setupEmbeddingModelDropdown();

    // Set up batch events
    this.setupBatchEvents();
  }

  private setupBatchEvents(): void {
    // Prevent multiple registrations of the same event listeners
    if (this.batchEventsRegistered) {
      return;
    }

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

    this.batchEventsRegistered = true;
  }

  private handleSemanticBatchProgress(progress: { processed: number; total: number; }): void {
    this.updateProgressElements(progress);
  }

  private showProgressSection(): void {
    // Reset progress elements to initial state
    this.resetProgressElements();

    const progressSection = document.getElementById('embedding-batch-progress-section') as HTMLElement;
    if (progressSection) {
      progressSection.classList.remove('hidden');
    }
  }

  private hideProgressSection(): void {
    const progressSection = document.getElementById('embedding-batch-progress-section') as HTMLElement;
    if (progressSection) {
      progressSection.classList.add('hidden');
    }
  }

  private showStatusIndicator(): void {
    const statusSection = document.getElementById('semantic-search-status') as HTMLElement;
    if (statusSection) {
      statusSection.classList.remove('hidden');
    }
  }

  private hideStatusIndicator(): void {
    const statusSection = document.getElementById('semantic-search-status') as HTMLElement;
    if (statusSection) {
      statusSection.classList.add('hidden');
    }
  }

  private resetProgressElements(): void {
    // Reset progress elements to initial state
    const progressBar = document.getElementById('embedding-batch-progress-bar') as HTMLElement;
    const progressText = document.getElementById('embedding-batch-progress-text') as HTMLElement;
    const progressPercentage = document.getElementById('embedding-batch-progress-percentage') as HTMLElement;
    const processedCount = document.getElementById('embedding-batch-processed-count') as HTMLElement;
    const skippedCount = document.getElementById('embedding-batch-skipped-count') as HTMLElement;
    const failedCount = document.getElementById('embedding-batch-failed-count') as HTMLElement;

    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = 'Preparing to process embeddings...';
    if (progressPercentage) progressPercentage.textContent = '0%';
    if (processedCount) processedCount.textContent = '0';
    if (skippedCount) skippedCount.textContent = '0';
    if (failedCount) failedCount.textContent = '0';
  }

  private updateProgressElements(progress: { processed: number; total: number; }): void {
    // Update progress elements
    const progressBar = document.getElementById('embedding-batch-progress-bar') as HTMLElement;
    const progressText = document.getElementById('embedding-batch-progress-text') as HTMLElement;
    const progressPercentage = document.getElementById('embedding-batch-progress-percentage') as HTMLElement;

    if (progressBar && progressText && progressPercentage) {
      const percentage = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
      progressBar.style.width = `${percentage}%`;
      progressText.textContent = `Processing embeddings... (${progress.processed} / ${progress.total})`;
      progressPercentage.textContent = `${percentage}%`;
    }

    // Update counters
    const processedCount = document.getElementById('embedding-batch-processed-count') as HTMLElement;
    const skippedCount = document.getElementById('embedding-batch-skipped-count') as HTMLElement;
    const failedCount = document.getElementById('embedding-batch-failed-count') as HTMLElement;

    if (processedCount) processedCount.textContent = progress.processed.toString();
    if (skippedCount) skippedCount.textContent = '0'; // Will be updated when we have this data
    if (failedCount) failedCount.textContent = '0'; // Will be updated when we have this data
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

    // Update final progress values before hiding
    this.updateProgressElements({
      processed: result.processed,
      total: result.totalWords
    });

    // Update final status in progress section
    const progressText = document.getElementById('embedding-batch-progress-text') as HTMLElement;
    const processedCount = document.getElementById('embedding-batch-processed-count') as HTMLElement;
    const failedCount = document.getElementById('embedding-batch-failed-count') as HTMLElement;

    if (progressText && processedCount && failedCount) {
      progressText.textContent = result.success ? 'Processing completed!' : 'Processing failed!';
      processedCount.textContent = result.processed.toString();
      failedCount.textContent = result.failed.toString();
    }

    // Hide the progress section and show status indicator
    setTimeout(() => {
      this.hideProgressSection();
      this.showStatusIndicator();
    }, 1000);

    if (result.success) {
      this.updateButtonState(ButtonState.COMPLETED);
      this.updateStatusIndicator(true);
    } else {
      this.updateButtonState(ButtonState.ERROR);
      this.updateStatusIndicator(false);
      // Show error toast since progress section shows limited error info
      this.showError(`Failed: ${result.error}`);
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
        if (profileConfig.embedding_config.enabled) {
          this.updateStatusIndicator(true);
          this.updateButtonState(ButtonState.COMPLETED);
        } else {
          this.updateStatusIndicator(false);
          this.updateButtonState(ButtonState.IDLE);
        }
      } else {
        this.setDefaultConfiguration();
        this.updateStatusIndicator(false);
        this.updateButtonState(ButtonState.IDLE);
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
    const apiKeyInput = document.getElementById('embedding-api-key') as HTMLInputElement;
    const batchSizeInput = document.getElementById('batch-size') as HTMLInputElement;
    const thresholdSlider = document.getElementById('similarity-threshold') as HTMLInputElement;
    const thresholdValue = document.getElementById('threshold-value') as HTMLElement;

    if (providerSelect) providerSelect.value = 'openai';
    if (modelInput) modelInput.value = 'text-embedding-ada-002';
    if (endpointInput) endpointInput.value = 'https://api.openai.com/v1';
    if (apiKeyInput) apiKeyInput.value = ''; // Clear API key in default config
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

    // Send custom event to notify other components about semantic search status change
    this.sendSemanticSearchStatusEvent(enabled);
  }

  /**
   * Send custom event to notify other components about semantic search status
   */
  private sendSemanticSearchStatusEvent(enabled: boolean): void {
    const event = new CustomEvent('semantic-search-status-changed', {
      detail: {
        enabled: enabled,
        timestamp: new Date().toISOString()
      }
    });

    document.dispatchEvent(event);
    console.log(`📡 Semantic search status event sent: enabled=${enabled}`);
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
      embedding_config: {
        provider: providerSelect.value,
        model: modelInput.value.trim(),
        endpoint: endpointInput.value.trim(),
        api_key: apiKeyInput.value.trim(),
        batch_size: parseInt(batchSizeInput.value) || 10,
        similarity_threshold: parseFloat(thresholdSlider.value) || 0.5
      }
    };
  }

  /**
   * Update button state with proper UI management
   */
  private updateButtonState(newState: ButtonState): void {
    const startBtn = document.getElementById('semantic-batch-start-btn') as HTMLButtonElement;
    const stopBtn = document.getElementById('semantic-batch-stop-btn') as HTMLButtonElement;
    const formElements = document.querySelectorAll('#semantic-settings-modal input, #semantic-settings-modal select, #semantic-settings-modal #embedding-model-dropdown-btn');

    // Remove all existing classes first
    if (startBtn) {
      startBtn.className = 'px-6 py-2 rounded-lg transition-all duration-200 hover:shadow-lg font-medium text-sm';
    }

    switch (newState) {
      case ButtonState.IDLE:
        if (startBtn) {
          startBtn.textContent = START_BTN_TEXT_IDLE;
          startBtn.disabled = false;
          startBtn.classList.add('bg-blue-500', 'hover:bg-blue-600', 'text-white');
        }
        // Hide stop button in IDLE state
        if (stopBtn) {
          stopBtn.classList.add('hidden');
        }
        // Enable form elements
        formElements.forEach((element: any) => {
          element.disabled = false;
        });
        break;

      case ButtonState.PROCESSING:
        if (startBtn) {
          startBtn.textContent = START_BTN_TEXT_PROCESSING;
          startBtn.disabled = true;
          startBtn.classList.add('bg-green-400', 'hover:bg-green-500', 'text-white');
        }
        // Show stop button in PROCESSING state
        if (stopBtn) {
          stopBtn.classList.remove('hidden');
        }
        // Disable form elements
        formElements.forEach((element: any) => {
          element.disabled = true;
        });
        break;

      case ButtonState.COMPLETED:
        if (startBtn) {
          startBtn.textContent = START_BTN_TEXT_COMPLETED;
          startBtn.disabled = true;
          startBtn.classList.add('bg-green-500', 'hover:bg-green-600', 'text-white');
        }
        // Show stop button in COMPLETED state
        if (stopBtn) {
          stopBtn.classList.remove('hidden');
        }
        // Enable form elements
        formElements.forEach((element: any) => {
          element.disabled = true;
        });
        break;

      case ButtonState.ERROR:
        if (startBtn) {
          startBtn.textContent = START_BTN_TEXT_IDLE;
          startBtn.disabled = false;
          startBtn.classList.add('bg-blue-500', 'hover:bg-blue-600', 'text-white');
        }
        // Hide stop button in ERROR state
        if (stopBtn) {
          stopBtn.classList.add('hidden');
        }
        // Enable form elements
        formElements.forEach((element: any) => {
          element.disabled = false;
        });
        break;
    }
  }



  /**
   * Handle start button click
   */
  private async handleStartBatch(): Promise<void> {
    if (this.isProcessing) {
      await this.handleStopBatch();
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
          ...currentProfile.embedding_config,
          ...config.embedding_config,
          enabled: true
        }
      };
      //console.log('Updating profile with embedding configuration:', updatedProfile);

      // Start batch processing
      this.isProcessing = true;
      this.updateButtonState(ButtonState.PROCESSING);

      // Show progress section when processing starts
      this.hideStatusIndicator();
      this.showProgressSection();

      const result = await window.electronAPI.startSemanticBatchProcessing(updatedProfile);

      if (result.success) {
        // do nothing because handle complete func will deal with it
      } else {
        // Force stop
        this.handleStopBatch();
      }

    } catch (error) {
      console.error('Error starting semantic search:', error);
      this.showError('Failed to start semantic search');
      // Force stop
      this.handleStopBatch();
    } finally {
      this.isProcessing = false;
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
   * Handle stop button click
   */
  private async handleStopBatch(): Promise<void> {
    // Because stop btn only show up on Processing and Complete state
    // We can assume it's always in right state
    try {
      const result = await window.electronAPI.cancelSemanticBatchProcessing();
      if (result.success) {
        this.showInfo('Semantic search processing stopped');
      } else {
        this.showError(result.message || 'Stop processing failed');
      }
    } catch (error) {
      console.error('Error stopping semantic search:', error);
      this.showError('Failed to stop semantic search');
    } finally {
      this.isProcessing = false;
      // Hide progress section and show status indicator when stopping
      this.hideProgressSection();
      this.showStatusIndicator();
      // Update status indicator to disabled when stopping
      this.updateStatusIndicator(false);
      this.updateButtonState(ButtonState.IDLE);
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

  /**
   * Set up embedding model dropdown event listeners
   */
  private setupEmbeddingModelDropdown(): void {
    const embeddingModelDropdownBtn = document.getElementById('embedding-model-dropdown-btn') as HTMLButtonElement;
    if (embeddingModelDropdownBtn && !embeddingModelDropdownBtn._listenerAdded) {
      embeddingModelDropdownBtn._listenerAdded = true;
      embeddingModelDropdownBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showEmbeddingModelDropdown();
      });
      embeddingModelDropdownBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showEmbeddingModelDropdown();
        }
      });
    }
  }

  /**
   * Show embedding model dropdown
   */
  private async showEmbeddingModelDropdown(): Promise<void> {
    const embeddingModelDropdownBtn = document.getElementById('embedding-model-dropdown-btn') as HTMLButtonElement;
    const models = await this.modelMemoService.loadEmbeddingModelMemos();
    this.modelDropdown.show(models, embeddingModelDropdownBtn, {
      onModelSelected: (modelName) => this.handleEmbeddingModelSelection(modelName),
      onModelDeleted: (modelName) => this.handleEmbeddingModelDeletion(modelName),
      onModelSaved: () => this.handleEmbeddingModelSave()
    });
  }

  /**
   * Handle embedding model selection
   */
  private async handleEmbeddingModelSelection(modelName: string): Promise<boolean> {
    try {
      const result = await this.modelMemoService.getModelMemo(modelName);

      if (result.success && result.model) {
        const model = result.model;

        // Populate embedding form fields
        (document.getElementById('embedding-provider') as HTMLSelectElement).value = model.provider;
        (document.getElementById('embedding-model') as HTMLInputElement).value = model.model;
        (document.getElementById('embedding-endpoint') as HTMLInputElement).value = model.endpoint;
        (document.getElementById('embedding-api-key') as HTMLInputElement).value = model.apiKey;

        // Mark model as used
        await this.modelMemoService.markModelUsed(modelName);

        //this.showSuccess(`Embedding model "${model.name}" loaded successfully`);
        return true;
      } else {
        this.showError(result.message || 'Failed to load embedding model');
      }
    } catch (error) {
      console.error('Error selecting embedding model from dropdown:', error);
      this.showError('Failed to load embedding model configuration');
    }
    return false;
  }

  /**
   * Handle embedding model deletion
   */
  private async handleEmbeddingModelDeletion(modelName: string): Promise<boolean> {
    const confirmed = confirm(`Are you sure you want to delete the embedding model "${modelName}"?`);
    if (!confirmed) {
      return false;
    }

    try {
      const deleteResult = await this.modelMemoService.deleteModelMemo(modelName);

      if (deleteResult.success) {
        // this.showSuccess(`Embedding model "${modelName}" deleted successfully`);
        // Hide the dropdown
        this.modelDropdown.hide();
        // Reload model list
        this.showEmbeddingModelDropdown();
        return true;
      } else {
        this.showError(deleteResult.message || 'Failed to delete embedding model');
      }
    } catch (error) {
      console.error('Error deleting embedding model from dropdown:', error);
      this.showError('Failed to delete embedding model configuration');
    }
    return false;
  }

  /**
   * Handle embedding model save
   */
  private async handleEmbeddingModelSave(): Promise<boolean> {
    const providerElement = document.getElementById('embedding-provider') as HTMLSelectElement;
    const modelElement = document.getElementById('embedding-model') as HTMLInputElement;
    const endpointElement = document.getElementById('embedding-endpoint') as HTMLInputElement;
    const apiKeyElement = document.getElementById('embedding-api-key') as HTMLInputElement;

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
        type: 'embedding',
      });

      if (result.success) {
        const memoName = result.model?.name;
        // this.showSuccess(`Embedding model "${memoName}" saved successfully`);
        // Hide the dropdown
        this.modelDropdown.hide();
        // Reload model list
        this.showEmbeddingModelDropdown();
        return true;
      } else {
        this.showError(result.message || 'Failed to save embedding model');
      }
    } catch (error) {
      console.error('Error saving embedding model from dropdown:', error);
      this.showError('Failed to save embedding model configuration');
    }
    return false;
  }
}
