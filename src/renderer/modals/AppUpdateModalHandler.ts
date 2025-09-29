import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';
import { formatFileSize } from '../utils/Common.js';

/**
 * Enum for app update modal states
 */
export enum UpdateModalState {
    CHECKING = 'checking',
    AVAILABLE = 'available',
    DOWNLOADING = 'downloading',
    CANCELLED = 'cancelled',
    ERROR = 'error',
    NONE = 'none'
}

export class AppUpdateModalHandler extends ModalHandler {
    private downloading: boolean = false;
    constructor(uiUtils: UIUtils, toastManager: ToastManager) {
        super(uiUtils, toastManager);
    }

    /**
     * Show the app update modal
     */
    async show(): Promise<void> {
        // Ensure template is loaded
        const templateLoaded = await this.ensureTemplateLoaded('app-update-modal', 'app-update-modal');
        if (!templateLoaded) return;

        try {
            // Reset checking state
            this.updateMessage('Checking for updates...');
            this.setModalState(UpdateModalState.CHECKING);
            // Show modal first, then check for updates (callback will update UI)
            this.showModal('app-update-modal');
            // Check for updates (callback will handle the response)
            this.checkForUpdates();
        } catch (error) {
            console.error('Error showing app update modal:', error);
            this.showError('Failed to check for updates');
        }
    }

    /**
     * Hide the app update modal
     */
    hide(): void {
        this.hideModal('app-update-modal');
    }

    /**
     * Check for available updates
     */
    private async checkForUpdates(): Promise<void> {
        try {
            this.updateMessage('Checking for updates...');
            this.setModalState(UpdateModalState.CHECKING);

            const result = await window.electronAPI.checkForUpdates();

            if (!result.success) {
                throw new Error(result.message || 'Failed to check for updates');
            }
        } catch (error) {
            const msg = 'Error checking for updates:' + error;
            this.updateMessage(msg);
            this.setModalState(UpdateModalState.ERROR);
        }
    }

    /**
     * Start downloading the update
     */
    private async startDownload(): Promise<void> {
        if (this.downloading) return;
        try {
            this.downloading = true;
            this.updateMessage('Starting download...');
            this.setModalState(UpdateModalState.DOWNLOADING);

            const result = await window.electronAPI.downloadUpdate();

            if (!result.success) {
                throw new Error(result.message || 'Failed to download update');
            }

            if (result.progress?.downloaded === result.progress?.total && result.progress?.total === 0) {
                // User cancel immediately
                return;
            }

        } catch (error) {
            const msg = 'Error downloading update:'+ error;
            this.updateMessage(msg);
            this.setModalState(UpdateModalState.ERROR);
        } finally {
            this.downloading = false;
        }
    }

    /**
      * Update the main message in the modal
      */
     private updateMessage(message: string) {
         // Update message
         const messageText = document.getElementById('update-message-text') as HTMLElement;
         if (messageText) {
             messageText.innerHTML = message;
         }
     }

    /**
     * Update download progress display with detailed progress information
     */
    private updateDownloadProgress(progress: { downloaded: number; total: number; message: string; }): void {
        const percentage = progress.total > 0 ? Math.round((progress.downloaded / progress.total) * 100) : 0;

        // Update progress bar
        const progressBar = document.getElementById('update-progress-bar') as HTMLElement;
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        // Format file sizes for better readability
        const downloadedFormatted = formatFileSize(progress.downloaded);
        const totalFormatted = formatFileSize(progress.total);

        // Update progress info with detailed message
        const progressText = document.getElementById('update-progress-text') as HTMLElement;
        if (progressText) {
            progressText.textContent = `${percentage}% (${downloadedFormatted}/${totalFormatted})`;
        }

        // Update details with more detailed information
        this.updateMessage(progress.message);
    }

    private hideDownloadProgress() {
        const progressSection = document.getElementById('update-progress-section') as HTMLElement;
        const detailsSection = document.getElementById('update-details-section') as HTMLElement;
        if (progressSection) progressSection.classList.add('hidden');
        if (detailsSection) detailsSection.classList.add('hidden');
    }

    private showDownloadProgress() {
        const progressSection = document.getElementById('update-progress-section') as HTMLElement;
        const detailsSection = document.getElementById('update-details-section') as HTMLElement;
        if (progressSection) progressSection.classList.remove('hidden');
        if (detailsSection) detailsSection.classList.remove('hidden');
    }

    /**
     * Set modal state and update UI accordingly
     */
    private setModalState(state: UpdateModalState): void {

        // Show/hide sections based on state
        const actionBtn = document.getElementById('update-action-btn') as HTMLButtonElement;

        switch (state) {
            case UpdateModalState.CANCELLED:
                // Show available message with Update button
                if (actionBtn) {
                    actionBtn.textContent = 'Update';
                    actionBtn.onclick = () => this.startDownload();
                }
                break;
            case UpdateModalState.AVAILABLE:
                this.hideDownloadProgress();
                // Show available message with Update button
                if (actionBtn) {
                    actionBtn.textContent = 'Update';
                    actionBtn.onclick = () => this.startDownload();
                }
                break;

            case UpdateModalState.DOWNLOADING:
                // Show progress bar and details, Cancel button
                this.showDownloadProgress();
                if (actionBtn) {
                    actionBtn.textContent = 'Cancel';
                    actionBtn.onclick = () => this.cancelDownload();
                }
                break;

            case UpdateModalState.ERROR:
                // Show error message with Retry button
                if (actionBtn) {
                    actionBtn.textContent = 'Update';
                    actionBtn.onclick = () => this.checkForUpdates();
                }
                break;

            case UpdateModalState.CHECKING:
            case UpdateModalState.NONE:
                this.hideDownloadProgress();
                // No update available, show Cancel button
                if (actionBtn) {
                    actionBtn.textContent = 'Cancel';
                    actionBtn.onclick = () => this.hide();
                }
                break;
        }
    }

    /**
     * Cancel download
     */
    private async cancelDownload(): Promise<void> {
        if (!this.downloading) {
            return;
        }
        try {
            const result = await window.electronAPI.cancelUpdate();

            if (result.success) {
                this.setModalState(UpdateModalState.CANCELLED);
            } else {
                this.setModalState(UpdateModalState.ERROR);
            }
        } catch (error) {
            const msg = 'Error cancelling download:' + error;
            this.updateMessage(msg);
            this.setModalState(UpdateModalState.ERROR);
        }
    }

    /**
     * Setup event handlers for the app update modal
     */
    protected setupModalEvent(): void {
        // Setup close button event
        const closeBtn = document.getElementById('close-app-update-modal') as HTMLButtonElement;
        if (closeBtn) {
            closeBtn.onclick = () => this.hide();
        }

        // Event handlers are set up in setModalState method
        // This ensures they're updated based on current state
        window.electronAPI.onUpdateAvailable((versionInfo: { current: string; latest: string; hasUpdate: boolean; }) => {
            if (!versionInfo.hasUpdate) {
                const msg = `No update available.
                Current version: ${versionInfo.current} is the latest.
                `
                this.updateMessage(msg);
                this.setModalState(UpdateModalState.NONE);
                return;
            }
            const msg = `<span style="color: ##374151;">✨ A new version is available now! ✨</span><br>
            <span style="color: #16a34a; font-weight: 700;">EverEtch ${versionInfo.current} → ${versionInfo.latest}</span><br>
            <span style="color: #374151;">Would you like to update now?</span>`
            this.updateMessage(msg);
            this.setModalState(UpdateModalState.AVAILABLE);
        });

        window.electronAPI.onUpdateDownloadProgress((progress: { downloaded: number; total: number; message: string; }) => {
            this.updateDownloadProgress(progress);
        });
    }
}
