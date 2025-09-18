import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';
import { formatFileSize } from '../utils/Common.js';
import { GoogleDriveManager } from '../services/GoogleDriveManager.js';

export class GoogleDriveDownloadModalHandler extends ModalHandler {
    private googleDriveManager: GoogleDriveManager;
    constructor(uiUtils: UIUtils, toastManager: ToastManager,
        googleDriveManager: GoogleDriveManager
    ) {
        super(uiUtils, toastManager);
        this.googleDriveManager = googleDriveManager;
    }

    async show(): Promise<void> {
        const templateLoaded = await this.ensureTemplateLoaded('google-drive-picker-modal', 'google-drive-picker-modal');
        if (!templateLoaded) return;
        this.showModal('google-drive-picker-modal');

        // Load all uploaded files
        await this.showGoogleDriveFilePickerList();
    }

    hide(): void {
        this.hideModal('google-drive-picker-modal');
    }

    /**
     * Setup event handlers for the howto modal
     */
    protected setupModalEvent(): void {
        const cancelGoogleDrivePicker = document.getElementById('cancel-google-drive-picker') as HTMLButtonElement;
        const importGoogleDriveFile = document.getElementById('import-google-drive-file') as HTMLButtonElement;

        if (cancelGoogleDrivePicker && !cancelGoogleDrivePicker._listenerAdded) {
            cancelGoogleDrivePicker._listenerAdded = true;
            cancelGoogleDrivePicker.addEventListener('click', () => {
                this.hide();
            });
        }

        if (importGoogleDriveFile && !importGoogleDriveFile._listenerAdded) {
            importGoogleDriveFile._listenerAdded = true;
            importGoogleDriveFile.addEventListener('click', () => {
                this.hide();
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

    private async showGoogleDriveFilePickerList(): Promise<void> {
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
}
