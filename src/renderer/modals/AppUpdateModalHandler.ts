import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';

/**
 * Enum for app update modal states
 */
export enum UpdateModalState {
    CHECKING = 'checking',
    AVAILABLE = 'available',
    DOWNLOADING = 'downloading',
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
            this.setModalState(UpdateModalState.CHECKING, 'Checking for updates...');
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
            this.setModalState(UpdateModalState.CHECKING, 'Checking for updates...');

            const result = await window.electronAPI.checkForUpdates();

            if (!result.success) {
                throw new Error(result.error || 'Failed to check for updates');
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            this.setModalState(UpdateModalState.ERROR, 'Failed to check for updates. Please try again.');
        }
    }

    /**
     * Start downloading the update
     */
    private async startDownload(): Promise<void> {        
        if (this.downloading) return;
        try {
            this. downloading = true;
            this.setModalState(UpdateModalState.DOWNLOADING, 'Starting download...');

            const result = await window.electronAPI.downloadUpdate();

            if (!result.success) {
                throw new Error(result.error || 'Failed to download update');
            }

            if (result.progress.downloaded === result.progress.total && result.progress.total === 0) {
                // User cancel immediately
                this.hide();
                return;
            }


            // Download completed successfully - install immediately
            // await this.installUpdate();

        } catch (error) {
            console.error('Error downloading update:', error);
            this.setModalState(UpdateModalState.ERROR, 'Failed to download update. Please try again.');
        } finally {
            this.downloading = false;
        }
    }

    /**
     * Install the downloaded update
     */
    private async installUpdate(): Promise<void> {
        try {
            // Use downloading state to show progress during install
            this.setModalState(UpdateModalState.DOWNLOADING, 'Installing update...');

            const result = await window.electronAPI.installUpdate();

            if (!result.success) {
                throw new Error(result.error || 'Failed to install update');
            }

            

            // Close modal after a short delay
            setTimeout(() => {
                this.hide();
            }, 2000);

        } catch (error) {
            console.error('Error installing update:', error);
            this.setModalState(UpdateModalState.ERROR, 'Failed to install update. Please try again.');
        }
    }

    /**
     * Update download progress display using callback message
     */
    private updateDownloadProgress(progress: { downloaded: number; total: number; message: string; }): void {
        const percentage = progress.total > 0 ? Math.round((progress.downloaded / progress.total) * 100) : 0;

        // Update progress bar
        const progressBar = document.getElementById('update-progress-bar') as HTMLElement;
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        // Update progress text with callback message
        const progressText = document.getElementById('update-progress-text') as HTMLElement;
        if (progressText) {
            progressText.textContent = `${progress.message} ${percentage}%`;
        }

        // Update details with callback message
        const detailsText = document.getElementById('update-details-text') as HTMLElement;
        if (detailsText) {
            detailsText.textContent = progress.message;
        }
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
    private setModalState(state: UpdateModalState, message: string): void {
        // Update message
        const messageText = document.getElementById('update-message-text') as HTMLElement;
        if (messageText) {
            messageText.textContent = message;
        }

        // Show/hide sections based on state
        const actionBtn = document.getElementById('update-action-btn') as HTMLButtonElement;

        // Reset visibility - hide progress sections by default
        this.hideDownloadProgress();

        switch (state) {
            case UpdateModalState.AVAILABLE:
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
                // Do nothing, because download would receive cancel
            } else {
                this.setModalState(UpdateModalState.ERROR, 'Failed to cancel download. Please try again.');
            }
        } catch (error) {
            console.error('Error cancelling download:', error);
            this.setModalState(UpdateModalState.ERROR, 'Failed to cancel download. Please try again.');
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
                this.setModalState(UpdateModalState.NONE, msg);
                return;
            }
            const msg = `A new version is available. 
            EverEtch ${versionInfo.current} → ${versionInfo.latest}
            Would you like to update now?`
            this.setModalState(UpdateModalState.AVAILABLE, msg);
        });

        window.electronAPI.onUpdateDownloadProgress((progress: { downloaded: number; total: number; message: string; }) => {
            this.updateDownloadProgress(progress);
        });
    }
}
