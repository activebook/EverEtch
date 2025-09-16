import { WordManager } from '../services/WordManager.js';
import { ToastManager } from './ToastManager.js';
import { ProfileService } from '../services/ProfileService.js';
import { GoogleDriveManager } from '../services/GoogleDriveManager.js';
import { WordImportService, ImportProgress, ImportCallbacks } from '../services/WordImportService.js';
import { templateLoader } from '../utils/TemplateLoader.js';
import { UIUtils } from '../utils/UIUtils.js';
import { readFileContent, formatFileSize } from '../utils/Common.js';

export class ModalManager {
  private wordManager: WordManager;
  private toastManager: ToastManager;
  private profileService: ProfileService;
  private googleDriveManager: GoogleDriveManager;
  private wordImportService: WordImportService;
  private uiUtils: UIUtils;
  private loadedTemplates: Set<string> = new Set();

  constructor(wordManager: WordManager,
    toastManager: ToastManager,
    profileService: ProfileService,
    googleDriveManager: GoogleDriveManager,
    wordImportService: WordImportService,
    uiUtils: UIUtils) {
    this.wordManager = wordManager;
    this.toastManager = toastManager;
    this.profileService = profileService;
    this.googleDriveManager = googleDriveManager;
    this.wordImportService = wordImportService;
    this.uiUtils = uiUtils;
  }

  /**
   * Ensure a modal template is loaded before showing the modal
   */
  private async ensureTemplateLoaded(templateName: string, modalId: string): Promise<boolean> {
    try {
      // Check if template is already loaded
      if (this.loadedTemplates.has(templateName)) {
        return true;
      }

      // Show loading state if modal element doesn't exist
      const existingModal = document.getElementById(modalId);
      if (!existingModal) {
        this.uiUtils.showLoadingOverlay();
      }

      // Load the template
      const templateHtml = await templateLoader.loadTemplate(templateName);

      // Inject the template into the DOM
      const templateContainer = document.createElement('div');
      templateContainer.innerHTML = templateHtml;

      // Append to body or a specific container
      document.body.appendChild(templateContainer.firstElementChild!);

      // Mark as loaded
      this.loadedTemplates.add(templateName);

      // Setup event handlers for this modal after it's loaded
      this.setupModalEventHandlersForTemplate(templateName);

      // Hide loading overlay
      this.uiUtils.hideLoadingOverlay();

      return true;
    } catch (error) {
      console.error(`Failed to load template ${templateName}:`, error);
      this.uiUtils.hideLoadingOverlay();
      this.toastManager.showError(`Failed to load ${templateName.replace('-', ' ')}`);
      return false;
    }
  }

  // Profile modal methods
  async showAddProfileModal(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('add-profile-modal', 'add-profile-modal');
    if (!templateLoaded) return;

    const input = document.getElementById('new-profile-name') as HTMLInputElement;
    if (input) {
      input.value = '';
    }

    this.showModal('add-profile-modal');

    setTimeout(() => {
      if (input) {
        input.focus();
      }
    }, 100);
  }

  hideAddProfileModal(): void {
    this.hideModal('add-profile-modal');
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

        // Switch to the newly created profile
        this.profileService.setCurrentProfile(profileName);

        // Trigger the profile switch UI update
        const profileSwitchEvent = new CustomEvent('profile-switched', {
          detail: { profileName: profileName }
        });
        document.dispatchEvent(profileSwitchEvent);
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
    } catch (error) {
      console.error('Error loading profile config:', error);
      this.toastManager.showError('Failed to load profile settings');
    }

    this.showModal('settings-modal');
  }

  hideSettingsModal(): void {
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
    const templateLoaded = await this.ensureTemplateLoaded('howto-modal', 'howto-modal');
    if (!templateLoaded) return;

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
      this.showModal('howto-modal');
    } catch (error) {
      console.error('Error loading howto content:', error);
      this.toastManager.showError('Failed to load help content');
    }
  }

  hideHowtoModal(): void {
    this.hideModal('howto-modal')
  }

  // Import/Export modal methods
  async showExportChoiceModal(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('export-choice-modal', 'export-choice-modal');
    if (!templateLoaded) return;
    this.showModal('export-choice-modal');
  }

  hideExportChoiceModal(): void {
    this.hideModal('export-choice-modal');
  }

  async showImportChoiceModal(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('import-choice-modal', 'import-choice-modal');
    if (!templateLoaded) return;
    this.showModal('import-choice-modal');
  }

  hideImportChoiceModal(): void {
    this.hideModal('import-choice-modal');
  }

  // Word import modal methods
  async showImportWordsModal(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('import-words-modal', 'import-words-modal');
    if (!templateLoaded) return;
    this.showModal('import-words-modal');
  }

  hideImportWordsModal(): void {
    this.hideModal('import-words-modal');
  }

  // Google Drive modal methods
  async showGoogleDriveFilePicker(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('google-drive-picker-modal', 'google-drive-picker-modal');
    if (!templateLoaded) return;
    this.showModal('google-drive-picker-modal');

    // Load all uploaded files
    await this.showGoogleDriveFilePickerList();
  }

  async showGoogleDriveFilePickerList(): Promise<void> {
    // Show loading in the file picker
    const filesList = document.getElementById('google-drive-files-list')!;
    if (filesList) {
      filesList.innerHTML = `
        <div class="text-center text-slate-500 py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p>Loading files...</p>
        </div>
      `;
    }

    // reset ui
    this.googleDriveManager.setSelectedFile(null);
    this.updateGoogleDriveImportUI();

    try {
      const result = await this.googleDriveManager.handleGoogleDriveFilePicker();
      if (result.success && result.files) {
        this.renderGoogleDriveFiles(result.files);
      } else {
        const errorMessage = result?.message || 'Failed to load Google Drive files';
        this.showGoogleDriveError(errorMessage);
      }
    } catch (error) {
      console.error('Error in showGoogleDriveFilePickerList:', error);
      this.showGoogleDriveError('Failed to load Google Drive files. Please try again.');
    }
  }

  private renderGoogleDriveFiles(files: any[]): void {
    const filesList = document.getElementById('google-drive-files-list')!;
    if (!filesList) return;

    if (files.length === 0) {
      filesList.innerHTML = `
        <div class="text-center text-slate-500 py-8">
          <svg class="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <p>No profiles found in Google Drive</p>
          <p class="text-sm mt-2">Upload a profile first to see it here</p>
        </div>
      `;
      return;
    }

    // Clear the list first
    filesList.innerHTML = '';

    // Create file elements individually to avoid HTML injection issues
    files.forEach(file => {
      const selectedFile = this.googleDriveManager.getSelectedFile();
      const isSelected = selectedFile && selectedFile.id === file.id;

      // Create the main container
      const fileContainer = document.createElement('div');
      fileContainer.className = 'relative group';

      // Create the file button
      const fileButton = document.createElement('button');
      fileButton.className = `w-full p-3 ${isSelected ? 'bg-amber-50 border-amber-300' : 'bg-white/80 hover:bg-white/90'} border ${isSelected ? 'border-amber-300' : 'border-slate-200'} rounded-lg transition-all duration-200 hover:shadow-md google-drive-file-btn`;
      fileButton.setAttribute('data-file-id', file.id);

      // Create the content structure
      fileButton.innerHTML = `
        <div class="flex items-center">
          <svg class="w-6 h-6 mr-2 text-amber-600" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#F59E0B"/>
          </svg>
          <div class="text-left flex-1">
            <h4 class="font-medium text-sm ${isSelected ? 'text-amber-800' : 'text-slate-800'} truncate"></h4>
            <p class="text-xs text-slate-500">Modified: ${new Date(file.modifiedTime).toLocaleDateString()}</p>
            ${file.size ? `<p class="text-xs text-slate-500">Size: ${formatFileSize(parseInt(file.size))}</p>` : ''}
          </div>
        </div>
      `;

      // Set the file name using textContent to avoid HTML injection
      const fileNameElement = fileButton.querySelector('h4');
      if (fileNameElement) {
        fileNameElement.textContent = file.name;
      }

      // Create the delete button
      const deleteButton = document.createElement('button');
      deleteButton.className = 'absolute top-1/2 right-4 -translate-y-1/2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 google-drive-delete-btn';
      deleteButton.setAttribute('data-file-id', file.id);
      deleteButton.setAttribute('data-file-name', file.name);
      deleteButton.title = 'Delete file';
      deleteButton.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
      `;

      // Add click handler for file button
      fileButton.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const fileId = target.getAttribute('data-file-id');
        if (fileId) {
          // Find the file object
          const selectedFile = files.find(f => f.id === fileId);
          if (selectedFile) {
            this.googleDriveManager.setSelectedFile(selectedFile);
            this.updateGoogleDriveImportUI();
            // Re-render to show selection
            this.renderGoogleDriveFiles(files);
          }
        }
      });

      // Add click handler for delete button
      deleteButton.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent triggering the file selection
        const fileId = deleteButton.getAttribute('data-file-id');
        const fileName = deleteButton.getAttribute('data-file-name');
        if (fileId && fileName) {
          const updatedFiles = await this.googleDriveManager.handleGoogleDriveFileDelete(fileId, fileName, files);          
          this.renderGoogleDriveFiles(updatedFiles);

          // If the deleted file was selected, clear the selection
          const selectedFile = this.googleDriveManager.getSelectedFile();
          if (selectedFile && selectedFile.id === fileId) {
            this.googleDriveManager.setSelectedFile(null);
            this.updateGoogleDriveImportUI();
          }
        }
      });

      // Assemble the elements
      fileContainer.appendChild(fileButton);
      fileContainer.appendChild(deleteButton);
      filesList.appendChild(fileContainer);
    });
  }

  private updateGoogleDriveImportUI(): void {
    const selectedFileInfo = document.getElementById('selected-file-info') as HTMLElement;
    const selectedFileName = document.getElementById('selected-file-name') as HTMLElement;
    const importBtn = document.getElementById('import-google-drive-file') as HTMLButtonElement;

    const selectedFile = this.googleDriveManager.getSelectedFile();
    if (selectedFile) {
      if (selectedFileInfo && selectedFileName) {
        selectedFileInfo.classList.remove('hidden');
        selectedFileName.textContent = selectedFile.name;
      }
      if (importBtn) {
        importBtn.disabled = false;
        importBtn.classList.remove('disabled:cursor-not-allowed');
      }
    } else {
      if (selectedFileInfo) {
        selectedFileInfo.classList.add('hidden');
      }
      if (importBtn) {
        importBtn.disabled = true;
        importBtn.classList.add('disabled:cursor-not-allowed');
      }
    }
  }

  private showGoogleDriveError(message: string): void {
    const filesList = document.getElementById('google-drive-files-list')!;
    if (filesList) {
      filesList.innerHTML = `
        <div class="text-center text-red-500 py-8">
          <svg class="w-12 h-12 mx-auto mb-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="font-medium">Error</p>
          <p class="text-sm mt-2">${message}</p>
        </div>
      `;
    }
  }

  hideGoogleDriveFilePicker(): void {
    this.hideModal('google-drive-picker-modal');
  }

  async showGoogleDriveUploadModal(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('google-drive-upload-modal', 'google-drive-upload-modal');
    if (!templateLoaded) return;
    this.showModal('google-drive-upload-modal');
  }

  hideGoogleDriveUploadModal(): void {
    this.hideModal('google-drive-upload-modal');
  }

  private async showGoogleDriveUploadSuccess(justUploadedFileId?: string): Promise<void> {
    if (!justUploadedFileId) {
      return;
    }

    // Show Uploaded result Modal
    await this.showGoogleDriveUploadModal();

    const filesList = document.getElementById('google-drive-uploaded-files-list')!;
    if (!filesList) return;

    try {
      // Show loading state
      filesList.innerHTML = `
        <div class="text-center text-slate-500 py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p>Loading your backup files...</p>
        </div>
      `;

      // Load all EverEtch files from Google Drive
      const result = await this.googleDriveManager.getUploadedFiles();
      if (result.success && result.files) {
        this.renderGoogleDriveUploadedFiles(result.files, justUploadedFileId);
      } else {
        filesList.innerHTML = `
          <div class="text-center text-slate-500 py-4">
            <p>Unable to load backup files</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to load uploaded files:', error);
      filesList.innerHTML = `
        <div class="text-center text-slate-500 py-4">
          <p>Unable to load backup files</p>
        </div>
      `;
    }
  }

  private renderGoogleDriveUploadedFiles(files: any[], justUploadedFileId?: string): void {
    const filesList = document.getElementById('google-drive-uploaded-files-list')!;
    if (!filesList) return;

    if (files.length === 0) {
      filesList.innerHTML = `
        <div class="text-center text-slate-500 py-4">
          <p>No backup files found in Google Drive</p>
        </div>
      `;
      return;
    }

    // Clear the list first
    filesList.innerHTML = '';

    // Sort files by modified time (newest first)
    const sortedFiles = files.sort((a, b) =>
      new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
    );

    // Create file elements individually to avoid HTML injection issues
    sortedFiles.forEach(file => {
      const isJustUploaded = file.id === justUploadedFileId;

      // Create the main container
      const fileContainer = document.createElement('div');
      fileContainer.className = `flex items-center p-2 ${isJustUploaded ? 'bg-green-50 border border-green-200' : 'bg-slate-50'} rounded-lg`;

      // Create the content structure
      fileContainer.innerHTML = `
        <svg class="w-5 h-5 mr-2 text-amber-600" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#F59E0B"/>
        </svg>
        <div class="text-left flex-1">
          <div class="flex items-center">
            <h4 class="font-medium text-sm text-slate-800 truncate"></h4>
            ${isJustUploaded ? '<span class="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">Just uploaded</span>' : ''}
          </div>
          <p class="text-xs text-slate-500">Modified: ${new Date(file.modifiedTime).toLocaleDateString()}</p>
          ${file.size ? `<p class="text-xs text-slate-500">Size: ${formatFileSize(parseInt(file.size))}</p>` : ''}
        </div>
        <svg class="w-4 h-4 ${isJustUploaded ? 'text-green-500' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      `;

      // Set the file name using textContent to avoid HTML injection
      const fileNameElement = fileContainer.querySelector('h4');
      if (fileNameElement) {
        fileNameElement.textContent = file.name;
      }

      filesList.appendChild(fileContainer);
    });
  }

  async showImportWordsCompleteModal(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('import-words-complete-modal', 'import-words-complete-modal');
    if (!templateLoaded) return;
    this.showModal('import-words-complete-modal');
  }

  hideImportWordsCompleteModal(): void {
    this.hideModal('import-words-complete-modal');
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

  /**
   * Setup event handlers for a specific modal template after it's loaded
   */
  private setupModalEventHandlersForTemplate(templateName: string): void {
    switch (templateName) {
      case 'add-profile-modal':
        this.setupAddProfileModalHandlers();
        break;
      case 'settings-modal':
        this.setupSettingsModalHandlers();
        break;
      case 'howto-modal':
        this.setupHowtoModalHandlers();
        break;
      case 'export-choice-modal':
        this.setupExportChoiceModalHandlers();
        break;
      case 'import-choice-modal':
        this.setupImportChoiceModalHandlers();
        break;
      case 'import-words-modal':
        this.setupImportWordsModalHandlers();
        break;
      case 'google-drive-picker-modal':
        this.setupGoogleDrivePickerModalHandlers();
        break;
      case 'google-drive-upload-modal':
        this.setupGoogleDriveUploadModalHandlers();
        break;
      case 'import-words-progress-overlay':
        this.setupImportWordsProgressModalHandlers();
        break;
      case 'import-words-complete-modal':
        this.setupImportWordsCompleteModalHandlers();
        break;
    }
  }

  private setupAddProfileModalHandlers(): void {
    const cancelAddProfileBtn = document.getElementById('cancel-add-profile') as HTMLButtonElement;
    const createProfileBtn = document.getElementById('create-profile') as HTMLButtonElement;

    if (cancelAddProfileBtn && !cancelAddProfileBtn._listenerAdded) {
      cancelAddProfileBtn._listenerAdded = true;
      cancelAddProfileBtn.addEventListener('click', () => this.hideAddProfileModal());
    }
    if (createProfileBtn && !createProfileBtn._listenerAdded) {
      createProfileBtn._listenerAdded = true;
      createProfileBtn.addEventListener('click', () => this.handleCreateProfile());
    }
  }

  private setupSettingsModalHandlers(): void {
    const cancelSettingsBtn = document.getElementById('cancel-settings') as HTMLButtonElement;
    const saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;
    const deleteProfileBtn = document.getElementById('delete-profile-btn') as HTMLButtonElement;
    const toggleApiKeyBtn = document.getElementById('toggle-api-key-visibility') as HTMLButtonElement;

    if (cancelSettingsBtn && !cancelSettingsBtn._listenerAdded) {
      cancelSettingsBtn._listenerAdded = true;
      cancelSettingsBtn.addEventListener('click', () => this.hideSettingsModal());
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
  }

  private setupHowtoModalHandlers(): void {
    const closeHowtoBtn = document.getElementById('close-howto-btn') as HTMLButtonElement;
    if (closeHowtoBtn && !closeHowtoBtn._listenerAdded) {
      closeHowtoBtn._listenerAdded = true;
      closeHowtoBtn.addEventListener('click', () => this.hideHowtoModal());
    }
  }

  private setupExportChoiceModalHandlers(): void {
    const exportLocalBtn = document.getElementById('export-local-btn') as HTMLButtonElement;
    const exportGoogleDriveBtn = document.getElementById('export-google-drive-btn') as HTMLButtonElement;
    const cancelExportChoice = document.getElementById('cancel-export-choice') as HTMLButtonElement;

    if (exportLocalBtn && !exportLocalBtn._listenerAdded) {
      exportLocalBtn._listenerAdded = true;
      exportLocalBtn.addEventListener('click', () => {
        this.hideExportChoiceModal();
        this.handleExportProfile();
      });
    }
    if (exportGoogleDriveBtn && !exportGoogleDriveBtn._listenerAdded) {
      exportGoogleDriveBtn._listenerAdded = true;
      exportGoogleDriveBtn.addEventListener('click', async () => {
        this.hideExportChoiceModal();
        const fileId = await this.googleDriveManager.handleExportToGoogleDrive();
        await this.showGoogleDriveUploadSuccess(fileId);
      });
    }
    if (cancelExportChoice && !cancelExportChoice._listenerAdded) {
      cancelExportChoice._listenerAdded = true;
      cancelExportChoice.addEventListener('click', () => this.hideExportChoiceModal());
    }
  }

  private setupGoogleDrivePickerModalHandlers(): void {
    const cancelGoogleDrivePicker = document.getElementById('cancel-google-drive-picker') as HTMLButtonElement;
    const importGoogleDriveFile = document.getElementById('import-google-drive-file') as HTMLButtonElement;

    if (cancelGoogleDrivePicker && !cancelGoogleDrivePicker._listenerAdded) {
      cancelGoogleDrivePicker._listenerAdded = true;
      cancelGoogleDrivePicker.addEventListener('click', () => {
        this.hideGoogleDriveFilePicker();
      });
    }

    if (importGoogleDriveFile && !importGoogleDriveFile._listenerAdded) {
      importGoogleDriveFile._listenerAdded = true;
      importGoogleDriveFile.addEventListener('click', () => {
        this.hideGoogleDriveFilePicker();
        this.googleDriveManager.handleGoogleDriveImport();
      });
    }

    // Setup event delegation for dynamic file list items
    const filesList = document.getElementById('google-drive-files-list');
    if (filesList && !filesList._listenerAdded) {
      filesList._listenerAdded = true;
      filesList.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        const fileItem = target.closest('[data-file-id]') as HTMLElement;

        if (fileItem) {
          // Handle file selection
          const fileId = fileItem.getAttribute('data-file-id');
          const fileName = fileItem.getAttribute('data-file-name');

          if (fileId && fileName) {
            // Update selected file info
            const selectedFileInfo = document.getElementById('selected-file-info');
            const selectedFileName = document.getElementById('selected-file-name');

            if (selectedFileInfo && selectedFileName) {
              selectedFileName.textContent = fileName;
              selectedFileInfo.classList.remove('hidden');
            }

            // Enable import button
            if (importGoogleDriveFile) {
              importGoogleDriveFile.disabled = false;
              importGoogleDriveFile.classList.remove('disabled:opacity-50', 'disabled:cursor-not-allowed');
            }

            // Remove selection from other items
            const allFileItems = filesList.querySelectorAll('[data-file-id]');
            allFileItems.forEach(item => item.classList.remove('bg-amber-100'));

            // Highlight selected item
            fileItem.classList.add('bg-amber-100');
          }
        }
      });
    }
  }

  private setupGoogleDriveUploadModalHandlers(): void {
    const closeUploadModalBtn = document.getElementById('close-google-drive-upload-modal') as HTMLButtonElement;
    if (closeUploadModalBtn && !closeUploadModalBtn._listenerAdded) {
      closeUploadModalBtn._listenerAdded = true;
      closeUploadModalBtn.addEventListener('click', () => this.hideGoogleDriveUploadModal());
    }
  }

  private setupImportChoiceModalHandlers(): void {
    const importLocalBtn = document.getElementById('import-local-btn') as HTMLButtonElement;
    const importGoogleDriveBtn = document.getElementById('import-google-drive-btn') as HTMLButtonElement;
    const cancelImportChoice = document.getElementById('cancel-import-choice') as HTMLButtonElement;

    if (importLocalBtn && !importLocalBtn._listenerAdded) {
      importLocalBtn._listenerAdded = true;
      importLocalBtn.addEventListener('click', () => {
        this.hideImportChoiceModal();
        this.handleImportProfile();
      });
    }
    if (importGoogleDriveBtn && !importGoogleDriveBtn._listenerAdded) {
      importGoogleDriveBtn._listenerAdded = true;
      importGoogleDriveBtn.addEventListener('click', (event) => {
        console.log('Google Drive import button clicked');
        this.hideImportChoiceModal();
        // Show Google Drive file picker modal
        this.showGoogleDriveFilePicker();
      });
    }
    if (cancelImportChoice && !cancelImportChoice._listenerAdded) {
      cancelImportChoice._listenerAdded = true;
      cancelImportChoice.addEventListener('click', () => this.hideImportChoiceModal());
    }
  }

  private setupImportWordsModalHandlers(): void {
    // Import words modal buttons
    const selectFileBtn = document.getElementById('select-import-file') as HTMLButtonElement;
    const startImportBtn = document.getElementById('start-import-btn') as HTMLButtonElement;

    if (selectFileBtn) {
      selectFileBtn.addEventListener('click', () => {
        this.selectImportWordsFile();
      });
    }

    if (startImportBtn) {
      startImportBtn.addEventListener('click', () => {
        this.startImportWords();
      });
    }

    const closeImportModalBtn = document.getElementById('close-import-modal') as HTMLButtonElement;
    if (closeImportModalBtn && !closeImportModalBtn._listenerAdded) {
      closeImportModalBtn._listenerAdded = true;
      closeImportModalBtn.addEventListener('click', () => this.hideImportWordsModal());
    }
  }


  // Import functionality - simplified to use WordImportService state
  private selectedWordsFile: File | null = null;

  private selectImportWordsFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.csv';
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        this.selectedWordsFile = file;
        this.updateImportWordsUI();
      }
    };
    input.click();
  }

  private updateImportWordsUI(): void {
    const fileNameElement = document.getElementById('import-file-name') as HTMLElement;
    const startBtn = document.getElementById('start-import-btn') as HTMLButtonElement;

    if (fileNameElement && startBtn) {
      if (this.selectedWordsFile) {
        fileNameElement.textContent = this.selectedWordsFile.name;
        startBtn.disabled = false;
      } else {
        fileNameElement.textContent = 'No file selected';
        startBtn.disabled = true;
      }
    }
  }

  private async startImportWords(): Promise<void> {
    if (!this.selectedWordsFile) {
      return;
    }

    try {
      const content = await readFileContent(this.selectedWordsFile);
      await this.showImportWordsProgressOverlay();

      const callbacks: ImportCallbacks = {
        onProgress: (progress: ImportProgress) => {
          this.updateImportWordsProgress(progress);
        },
        onComplete: (progress: ImportProgress) => {
          this.handleImportWordsComplete(progress);
        },
        onError: (progress: ImportProgress) => {
          this.handleImportWordsError(progress);
        },
        onCancel: (progress: ImportProgress) => {
          this.handleImportWordsCancel(progress);
        },
      };

      await this.wordImportService.startImport(content, callbacks);
    } catch (error) {
      console.error('Error starting import:', error);
      this.toastManager.showError('Failed to start import');
    }
  }

  private cancelImportWords(): void {
    this.wordImportService.cancelImport();
  }


  private updateImportWordsProgress(progress: ImportProgress): void {
    const progressText = document.getElementById('import-progress-text')!;
    const progressBar = document.getElementById('import-progress-bar') as HTMLDivElement;

    if (progressText) {
      progressText.textContent = `${progress.current}/${progress.total} - ${progress.currentWord || 'Processing...'}`;
    }

    if (progressBar) {
      const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
      progressBar.style.width = `${percentage}%`;
    }
  }

  private async handleImportWordsComplete(progress: ImportProgress): Promise<void> {
    await this.hideImportWordsProgressOverlay();

    await this.showImportWordsCompleteModal();

    // Show completion modal
    const messageElement = document.getElementById('import-complete-message')!;
    const okBtn = document.getElementById('import-complete-ok') as HTMLButtonElement;

    if (okBtn && !okBtn._listenerAdded) {
      okBtn.addEventListener('click', () => {
        this.hideImportWordsCompleteModal();
      });
    }

    if (messageElement) {
      // Show the result of progress
      messageElement.innerHTML = this.getImportWordsProgressHtml(progress);
    }

    // Refresh word list
    this.wordManager.loadWords();
  }

  private async handleImportWordsError(progress: ImportProgress): Promise<void> {
    await this.hideImportWordsProgressOverlay();

    // If we have progress info and at least one word was successfully imported, reload the word list
    if (progress && progress.success > 0) {
      console.log(`Import failed but ${progress.success} words were successfully imported. Reloading word list...`);
      this.wordManager.loadWords();
    }

    // Show detailed completion modal instead of simple toast
    await this.showImportWordsErrorModal(progress);
  }

  private async handleImportWordsCancel(progress: ImportProgress): Promise<void> {
    await this.hideImportWordsProgressOverlay();

    // If we have progress info and at least one word was successfully imported, reload the word list
    if (progress && progress.success > 0) {
      console.log(`Import cancelled but ${progress.success} words were successfully imported. Reloading word list...`);
      this.wordManager.loadWords();
    }

    //this.toastManager.showWarning('Import cancelled');
    await this.showImportWordsCancelModal(progress);
  }

  private async showImportWordsCancelModal(progress: ImportProgress): Promise<void> {
    await this.showImportWordsCompleteModal();

    // Show completion modal
    const messageElement = document.getElementById('import-complete-message')!;
    const iconContainer = document.getElementById('import-complete-icon') as HTMLElement;
    const titleElement = document.getElementById('import-complete-title') as HTMLElement;
    const okBtn = document.getElementById('import-complete-ok') as HTMLButtonElement;

    if (okBtn && !okBtn._listenerAdded) {
      okBtn.addEventListener('click', () => {
        this.hideImportWordsCompleteModal();
      });
    }

    if (messageElement && iconContainer && titleElement) {
      // Change icon to neutral notification for user cancellation
      iconContainer.innerHTML = `
        <svg class="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      `;

      // Update title for partial success
      titleElement.textContent = 'Import Canceled - Partial Success';

      // Update message for partial success
      messageElement.innerHTML = this.getImportWordsProgressHtml(progress);
    }
  }

  private async showImportWordsErrorModal(progress: ImportProgress): Promise<void> {
    await this.showImportWordsCompleteModal();

    const messageElement = document.getElementById('import-complete-message')!;
    const iconContainer = document.getElementById('import-complete-icon') as HTMLElement;
    const titleElement = document.getElementById('import-complete-title') as HTMLElement;
    const okBtn = document.getElementById('import-complete-ok') as HTMLButtonElement;

    if (okBtn && !okBtn._listenerAdded) {
      okBtn.addEventListener('click', () => {
        this.hideImportWordsCompleteModal();
      });
    }

    if (messageElement && iconContainer && titleElement) {
      // Change icon to warning for partial success
      iconContainer.innerHTML = `
        <svg class="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
      `;

      // Update title for partial success
      titleElement.textContent = 'Import Stopped - Partial Success';

      // Update message for partial success
      messageElement.innerHTML = this.getImportWordsProgressHtml(progress);
    }
  }

  private getImportWordsProgressHtml(progress: ImportProgress): string {
    // Calculate statistics
    const successfulCount = progress.success || 0;
    const failedCount = progress.errors?.length || 0;
    const skippedCount = progress.skipped || 0;
    const remainingCount = (progress.total || 0) - (progress.current || 0);
    const failedWord = progress.currentWord || 'unknown word';

    // Build detailed message
    let html = `<div class="text-left space-y-2">`;

    if (successfulCount > 0) {
      html += `<div class="flex items-center text-green-600">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="font-medium">${successfulCount} words successfully imported</span>
        </div>`;
    }

    if (skippedCount > 0) {
      html += `<div class="flex items-center text-blue-600">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
          </svg>
          <span class="font-medium">${skippedCount} words were skipped (already exist)</span>
        </div>`;
    }

    if (failedCount > 0) {
      const error = progress.errors?.[0] || 'Unknown error';
      html += `<div class="flex items-center text-red-600">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
          <span class="font-medium">Failed on "${failedWord}": ${error}</span>
        </div>`;
    }

    if (remainingCount > 0) {
      html += `<div class="flex items-center text-amber-600">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span class="font-medium">${remainingCount} words remaining unprocessed</span>
        </div>`;
    }

    html += `</div>`;
    return html;
  }

  private setupImportWordsProgressModalHandlers(): void {
    const cancelImportProgressBtn = document.getElementById('cancel-import-btn') as HTMLButtonElement;
    if (cancelImportProgressBtn && !cancelImportProgressBtn._listenerAdded) {
      cancelImportProgressBtn._listenerAdded = true;
      cancelImportProgressBtn.addEventListener('click', () => {
        this.cancelImportWords();
      });
    }
  }

  private async showImportWordsProgressOverlay(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('import-words-progress-overlay', 'import-words-progress-overlay');
    if (!templateLoaded) return;

    const modal = document.getElementById('import-words-progress-overlay')!;
    modal.classList.remove('hidden');
  }

  private hideImportWordsProgressOverlay(): void {
    const modal = document.getElementById('import-words-progress-overlay')!;
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  private setupImportWordsCompleteModalHandlers(): void {
    const importCompleteOkBtn = document.getElementById('import-complete-ok') as HTMLButtonElement;
    if (importCompleteOkBtn && !importCompleteOkBtn._listenerAdded) {
      importCompleteOkBtn._listenerAdded = true;
      importCompleteOkBtn.addEventListener('click', () => this.hideImportWordsCompleteModal());
    }
  }
}
