import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';
import { formatFileSize } from '../utils/Common.js';
import { GoogleDriveManager } from '../services/GoogleDriveManager.js';

export class GoogleDriveUploadModalHandler extends ModalHandler {
  private googleDriveManager: GoogleDriveManager;
  constructor(uiUtils: UIUtils, toastManager: ToastManager,
    googleDriveManager: GoogleDriveManager
  ) {
    super(uiUtils, toastManager);
    this.googleDriveManager = googleDriveManager;
  }

  async show(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('google-drive-upload-modal', 'google-drive-upload-modal');
    if (!templateLoaded) return;
    this.showModal('google-drive-upload-modal');

    // Set initial uploading state
    this.setModalUploadingState();

    // Show upload results
    this.showUploadResults();
  }

  hide(): void {
    this.hideModal('google-drive-upload-modal');
  }

  /**
   * Setup event handlers for the howto modal
   */
  protected setupModalEvent(): void {
    const closeUploadModalBtn = document.getElementById('close-google-drive-upload-modal') as HTMLButtonElement;
    if (closeUploadModalBtn && !closeUploadModalBtn._listenerAdded) {
      closeUploadModalBtn._listenerAdded = true;
      closeUploadModalBtn.addEventListener('click', () => this.hide());
    }
  }

  private async showUploadResults(): Promise<void> {
    const justUploadedFileId = await this.googleDriveManager.handleExportToGoogleDrive();

    // Check if upload failed (empty fileId)
    if (!justUploadedFileId) {
      // Upload failed, show failure state in modal
      this.setModalFailureState();
      return;
    }

    // Upload succeeded, update modal to success state
    this.setModalSuccessState();

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

  private setModalUploadingState(): void {
    // Update modal title
    const titleElement = document.querySelector('#google-drive-upload-modal h3') as HTMLElement;
    if (titleElement) {
      titleElement.innerHTML = `
        <svg class="w-5 h-5 mr-2 text-amber-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        Uploading to Google Drive...
      `;
    }

    // Update modal description
    const descriptionElement = document.querySelector('#google-drive-upload-modal .text-slate-600') as HTMLElement;
    if (descriptionElement) {
      descriptionElement.textContent = 'Please wait while we upload your profile to Google Drive.';
    }
  }

  private setModalSuccessState(): void {
    // Update modal title
    const titleElement = document.querySelector('#google-drive-upload-modal h3') as HTMLElement;
    if (titleElement) {
      titleElement.innerHTML = `
        <svg class="w-5 h-5 mr-2 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        Upload Successful!
      `;
    }

    // Update modal description
    const descriptionElement = document.querySelector('#google-drive-upload-modal .text-slate-600') as HTMLElement;
    if (descriptionElement) {
      descriptionElement.textContent = 'Your profile has been successfully uploaded to Google Drive.';
    }
  }

  private setModalFailureState(): void {
    // Update modal title
    const titleElement = document.querySelector('#google-drive-upload-modal h3') as HTMLElement;
    if (titleElement) {
      titleElement.innerHTML = `
        <svg class="w-5 h-5 mr-2 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        Upload Failed
      `;
    }

    // Update modal description
    const descriptionElement = document.querySelector('#google-drive-upload-modal .text-slate-600') as HTMLElement;
    if (descriptionElement) {
      descriptionElement.textContent = 'Failed to upload your profile to Google Drive. Please check your connection and try again.';
    }

    // Clear the files list and show error message
    const filesList = document.getElementById('google-drive-uploaded-files-list')!;
    if (filesList) {
      filesList.innerHTML = `
        <div class="text-center text-red-500 py-4">
          <p>Upload failed. Please try again.</p>
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
}
