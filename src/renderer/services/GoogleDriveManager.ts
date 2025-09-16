import { ToastManager } from '../components/ToastManager.js';
import { ProfileService } from './ProfileService.js';
import { UIUtils } from '../utils/UIUtils.js';
import {formatFileSize} from '../utils/Common.js';

export class GoogleDriveManager {
  private toastManager: ToastManager;
  private profileService: ProfileService;
  private uiUtils: UIUtils;
  private selectedGoogleDriveFile: any = null;

  constructor(toastManager: ToastManager, profileService: ProfileService) {
    this.toastManager = toastManager;
    this.profileService = profileService;
    this.uiUtils = new UIUtils(); // Create instance for loading overlay methods
  }

  // Getters
  getSelectedFile(): any {
    return this.selectedGoogleDriveFile;
  }

  // Setters
  setSelectedFile(file: any): void {
    this.selectedGoogleDriveFile = file;
  }

  async handleGoogleDriveFilePicker(): Promise<any> {
    try {
      // Reset selection state when opening modal
      this.selectedGoogleDriveFile = null;

      // Check if we're authenticated first
      const authStatus = await window.electronAPI.googleIsAuthenticated();
      if (!authStatus.authenticated) {
        // Trigger authentication
        const authResult = await window.electronAPI.googleAuthenticate();
        if (!authResult.success) {
          this.toastManager.showError('Authentication failed. Please try again.');
          return { success: false, message: 'Authentication failed', files: [] };
        }
      }

      // Load files from Google Drive
      const result = await window.electronAPI.googleDriveListFiles();
      if (!result) {
        this.toastManager.showError('Failed to load Google Drive files');
        return { success: false, message: 'Failed to load files', files: [] };
      }
      return result;
    } catch (error) {
      console.error('Failed to show Google Drive file picker:', error);
      this.toastManager.showError('Failed to access Google Drive. Please try again.');
      return { success: false, message: 'Failed to access Google Drive', files: [] };
    }
  }

  async handleGoogleDriveImport(): Promise<void> {
    try {
      this.uiUtils.showLoadingOverlay();
      
      if (!this.selectedGoogleDriveFile) {
        this.toastManager.showError('Please select a file to import from Google Drive');
        return;
      }
      const fileId = this.selectedGoogleDriveFile.id;

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
      this.uiUtils.hideLoadingOverlay();
      // Reset selection
      this.selectedGoogleDriveFile = null;
    }
  }

  async handleExportToGoogleDrive(): Promise<string> {
    try {
      this.uiUtils.showLoadingOverlay();

      // Check if we're authenticated first
      const authStatus = await window.electronAPI.googleIsAuthenticated();
      if (!authStatus.authenticated) {
        // Trigger authentication
        const authResult = await window.electronAPI.googleAuthenticate();
        if (!authResult.success) {
          this.toastManager.showError('Authentication required for Google Drive access');
          return "";
        }
      }

      const result = await window.electronAPI.googleDriveUploadDatabase();

      if (result.success) {
        this.toastManager.showSuccess(result.message);

        // Show the upload success modal with the uploaded file
        return (result.fileId);
      } else {
        this.toastManager.showError(result.message);
      }
    } catch (error) {
      console.error('Failed to export to Google Drive:', error);
      this.toastManager.showError('Failed to export to Google Drive');
    } finally {
      this.uiUtils.hideLoadingOverlay();
    }
    return "";
  }

  async getUploadedFiles(): Promise<any> { 
    try {
      const result = await window.electronAPI.googleDriveListFiles();
      return result;
    } catch (error) {
      console.error('Error retrieving google drive file list:', error);
      return undefined;
    }
  }

  async handleGoogleDriveFileDelete(fileId: string, fileName: string, files: any[]): Promise<any[]> {
    const confirmed = confirm(`Are you sure you want to delete "${fileName}" from Google Drive?\n\nThis action cannot be undone.`);

    if (!confirmed) {
      return [];
    }

    try {
      // Show loading overlay for delete operation
      this.uiUtils.showLoadingOverlay();

      const result = await window.electronAPI.googleDriveDeleteFile(fileId);

      if (result.success) {
        this.toastManager.showSuccess(`File "${fileName}" deleted successfully`);

        // Remove the file from the current list and refresh the UI
        const updatedFiles = files.filter(file => file.id !== fileId);
        return updatedFiles;
      } else {
        this.toastManager.showError(result.message || 'Failed to delete file');
      }
    } catch (error) {
      console.error('Failed to delete Google Drive file:', error);
      this.toastManager.showError('Failed to delete file from Google Drive');
    } finally {
      // Hide loading overlay
      this.uiUtils.hideLoadingOverlay();
    }
    return [];
  }
}
