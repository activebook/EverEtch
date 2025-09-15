import { ToastManager } from '../components/ToastManager.js';
import { ProfileService } from './ProfileService.js';

export class GoogleDriveManager {
  private toastManager: ToastManager;
  private profileService: ProfileService;
  private selectedGoogleDriveFile: any = null;

  constructor(toastManager: ToastManager, profileService: ProfileService) {
    this.toastManager = toastManager;
    this.profileService = profileService;
  }

  // Getters
  getSelectedFile(): any {
    return this.selectedGoogleDriveFile;
  }

  // Setters
  setSelectedFile(file: any): void {
    this.selectedGoogleDriveFile = file;
  }

  async showGoogleDriveFilePicker(): Promise<void> {
    try {
      // Reset selection state when opening modal
      this.selectedGoogleDriveFile = null;
      this.updateGoogleDriveImportUI();

      // Check if we're authenticated first
      const authStatus = await window.electronAPI.googleIsAuthenticated();
      if (!authStatus.authenticated) {
        // Trigger authentication
        const authResult = await window.electronAPI.googleAuthenticate();
        if (!authResult.success) {
          this.toastManager.showError('Authentication required for Google Drive access');
          return;
        }
      }

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

      // Show the modal
      const modal = document.getElementById('google-drive-picker-modal')!;
      if (modal) {
        modal.classList.remove('hidden');
      }

      // Load files from Google Drive
      const result = await window.electronAPI.googleDriveListFiles();
      if (result.success && result.files) {
        this.renderGoogleDriveFiles(result.files);
      } else {
        this.showGoogleDriveError('Failed to load Google Drive files');
      }
    } catch (error) {
      console.error('Failed to show Google Drive file picker:', error);
      this.showGoogleDriveError('Failed to load Google Drive files');
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
      const isSelected = this.selectedGoogleDriveFile && this.selectedGoogleDriveFile.id === file.id;

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
            ${file.size ? `<p class="text-xs text-slate-500">Size: ${this.formatFileSize(parseInt(file.size))}</p>` : ''}
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
            this.selectedGoogleDriveFile = selectedFile;
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
          await this.handleGoogleDriveFileDelete(fileId, fileName, files);
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

    if (this.selectedGoogleDriveFile) {
      if (selectedFileInfo && selectedFileName) {
        selectedFileInfo.classList.remove('hidden');
        selectedFileName.textContent = this.selectedGoogleDriveFile.name;
      }
      if (importBtn) {
        importBtn.disabled = false;
        importBtn.classList.remove('disabled:cursor-not-allowed');
        //importBtn.classList.add('bg-amber-500', 'hover:bg-amber-600');
      }
    } else {
      if (selectedFileInfo) {
        selectedFileInfo.classList.add('hidden');
      }
      if (importBtn) {
        importBtn.disabled = true;
        //importBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
        importBtn.classList.add('disabled:cursor-not-allowed');
      }
    }
  }

  async performGoogleDriveImport(fileId: string): Promise<void> {
    try {
      this.showLoadingOverlay();
      this.hideGoogleDriveFilePicker();

      const result = await window.electronAPI.googleDriveDownloadDatabase(fileId);

      if (result.success) {
        this.toastManager.showSuccess(result.message);

        // Refresh profiles and switch to the new one
        await this.profileService.loadProfiles();
        if (result.profileName) {
          this.profileService.setCurrentProfile(result.profileName);

          // Trigger the profile switch UI update
          const profileSwitchEvent = new CustomEvent('profile-switched', {
            detail: { profileName: result.profileName }
          });
          document.dispatchEvent(profileSwitchEvent);
        }
      } else {
        this.toastManager.showError(result.message);
      }
    } catch (error) {
      console.error('Failed to download Google Drive file:', error);
      this.toastManager.showError('Failed to download file from Google Drive');
    } finally {
      this.hideLoadingOverlay();
      // Reset selection
      this.selectedGoogleDriveFile = null;
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

  async handleExportToGoogleDrive(): Promise<void> {
    try {
      this.showLoadingOverlay();

      // Check if we're authenticated first
      const authStatus = await window.electronAPI.googleIsAuthenticated();
      if (!authStatus.authenticated) {
        // Trigger authentication
        const authResult = await window.electronAPI.googleAuthenticate();
        if (!authResult.success) {
          this.toastManager.showError('Authentication required for Google Drive access');
          return;
        }
      }

      const result = await window.electronAPI.googleDriveUploadDatabase();

      if (result.success) {
        this.toastManager.showSuccess(result.message);

        // Show the upload success modal with the uploaded file
        await this.showGoogleDriveUploadSuccess(result.fileId);

        // Refresh profiles and switch to the new one
        await this.profileService.loadProfiles();
        if (result.profileName) {
          this.profileService.setCurrentProfile(result.profileName);

          // Trigger the profile switch UI update
          const profileSwitchEvent = new CustomEvent('profile-switched', {
            detail: { profileName: result.profileName }
          });
          document.dispatchEvent(profileSwitchEvent);
        }
      } else {
        this.toastManager.showError(result.message);
      }
    } catch (error) {
      console.error('Failed to export to Google Drive:', error);
      this.toastManager.showError('Failed to export to Google Drive');
    } finally {
      this.hideLoadingOverlay();
    }
  }

  private async showGoogleDriveUploadSuccess(justUploadedFileId?: string): Promise<void> {
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

      // Show the modal
      const modal = document.getElementById('google-drive-upload-modal')!;
      if (modal) {
        modal.classList.remove('hidden');
      }

      // Load all EverEtch files from Google Drive
      const result = await window.electronAPI.googleDriveListFiles();
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
          ${file.size ? `<p class="text-xs text-slate-500">Size: ${this.formatFileSize(parseInt(file.size))}</p>` : ''}
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

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private async handleGoogleDriveFileDelete(fileId: string, fileName: string, files: any[]): Promise<void> {
    const confirmed = confirm(`Are you sure you want to delete "${fileName}" from Google Drive?\n\nThis action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    try {
      // Show loading overlay for delete operation
      this.showLoadingOverlay();

      const result = await window.electronAPI.googleDriveDeleteFile(fileId);

      if (result.success) {
        this.toastManager.showSuccess(`File "${fileName}" deleted successfully`);

        // Remove the file from the current list and refresh the UI
        const updatedFiles = files.filter(file => file.id !== fileId);
        this.renderGoogleDriveFiles(updatedFiles);

        // If the deleted file was selected, clear the selection
        if (this.selectedGoogleDriveFile && this.selectedGoogleDriveFile.id === fileId) {
          this.selectedGoogleDriveFile = null;
          this.updateGoogleDriveImportUI();
        }
      } else {
        this.toastManager.showError(result.message || 'Failed to delete file');
      }
    } catch (error) {
      console.error('Failed to delete Google Drive file:', error);
      this.toastManager.showError('Failed to delete file from Google Drive');
    } finally {
      // Hide loading overlay
      this.hideLoadingOverlay();
    }
  }

  private showLoadingOverlay(): void {
    const overlay = document.getElementById('loading-overlay')!;
    if (overlay) {
      overlay.classList.remove('hidden');
    }
  }

  private hideLoadingOverlay(): void {
    const overlay = document.getElementById('loading-overlay')!;
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  private hideGoogleDriveFilePicker(): void {
    const modal = document.getElementById('google-drive-picker-modal')!;
    if (modal) {
      modal.classList.add('hidden');
    }
  }
}
