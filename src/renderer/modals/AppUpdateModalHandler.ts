import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';

export class AppUpdateModalHandler extends ModalHandler {
    private currentUpdateInfo: { current: string; latest: string; hasUpdate: boolean; } | null = null;
    private isDownloading = false;
    private downloadProgressCallback: ((progress: { downloaded: number; total: number; message: string; }) => void) | null = null;

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
            // Check for updates first
            //await this.checkForUpdates();

            // Show modal
            this.showModal('app-update-modal');
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
        // Reset state
        this.isDownloading = false;
        this.currentUpdateInfo = null;
    }

    /**
     * Check for available updates
     */
    private async checkForUpdates(): Promise<void> {
        try {
            this.setModalState('checking', 'Checking for updates...');

            const result = await window.electronAPI.checkForUpdates();

            if (!result.success) {
                throw new Error(result.error || 'Failed to check for updates');
            }

            if (result.versionInfo?.hasUpdate) {
                this.currentUpdateInfo = {
                    current: result.versionInfo.current,
                    latest: result.versionInfo.latest,
                    hasUpdate: true
                };

                this.setModalState('available',
                    `Update available: ${result.versionInfo.current} → ${result.versionInfo.latest}`);
            } else {
                this.setModalState('none', 'You are running the latest version');
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            this.setModalState('error', 'Failed to check for updates. Please try again.');
        }
    }

    /**
     * Start downloading the update
     */
    private async startDownload(): Promise<void> {
        if (this.isDownloading || !this.currentUpdateInfo?.hasUpdate) {
            return;
        }

        try {
            this.isDownloading = true;
            this.setModalState('downloading', 'Starting download...');

            // Set up progress callback
            this.downloadProgressCallback = (progress: { downloaded: number; total: number; message: string; }) => {
                this.updateDownloadProgress(progress);
            };

            const result = await window.electronAPI.downloadUpdate();

            if (!result.success) {
                throw new Error(result.error || 'Failed to download update');
            }

            // Download completed successfully
            this.setModalState('ready', 'Download completed. Ready to install.');

        } catch (error) {
            console.error('Error downloading update:', error);
            this.setModalState('error', 'Failed to download update. Please try again.');
            this.isDownloading = false;
        }
    }

    /**
     * Install the downloaded update
     */
    private async installUpdate(): Promise<void> {
        try {
            this.setModalState('installing', 'Installing update...');

            const result = await window.electronAPI.installUpdate();

            if (!result.success) {
                throw new Error(result.error || 'Failed to install update');
            }

            this.setModalState('success', 'Update installed successfully! The app will restart.');

            // Close modal after a short delay
            setTimeout(() => {
                this.hide();
            }, 2000);

        } catch (error) {
            console.error('Error installing update:', error);
            this.setModalState('error', 'Failed to install update. Please try again.');
        }
    }

    /**
     * Update download progress display
     */
    private updateDownloadProgress(progress: { downloaded: number; total: number; message: string; }): void {
        const percentage = progress.total > 0 ? Math.round((progress.downloaded / progress.total) * 100) : 0;

        // Update progress bar
        const progressBar = document.getElementById('update-progress-bar') as HTMLElement;
        const progressText = document.getElementById('update-progress-text') as HTMLElement;

        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = `${progress.message} ${percentage}%`;
        }

        // Update details
        const detailsText = document.getElementById('update-details-text') as HTMLElement;
        if (detailsText) {
            const downloadedMB = (progress.downloaded / (1024 * 1024)).toFixed(1);
            const totalMB = (progress.total / (1024 * 1024)).toFixed(1);
            detailsText.textContent = `Downloaded: ${downloadedMB} MB / ${totalMB} MB`;
        }
    }

    /**
     * Set modal state and update UI accordingly
     */
    private setModalState(state: 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'success' | 'error' | 'none', message: string): void {
        // Update message
        const messageText = document.getElementById('update-message-text') as HTMLElement;
        if (messageText) {
            messageText.textContent = message;
        }

        // Show/hide sections based on state
        const messageInfo = document.getElementById('update-message-info') as HTMLElement;
        const progressSection = document.getElementById('update-progress-section') as HTMLElement;
        const detailsSection = document.getElementById('update-details-section') as HTMLElement;
        const startBtn = document.getElementById('start-update-btn') as HTMLButtonElement;
        const cancelBtn = document.getElementById('cancel-update-btn') as HTMLButtonElement;

        // Reset visibility
        if (messageInfo) messageInfo.style.display = 'block';
        if (progressSection) progressSection.classList.add('hidden');
        if (detailsSection) detailsSection.classList.add('hidden');
        if (startBtn) startBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.classList.add('hidden');

        switch (state) {
            case 'checking':
                // Show checking message, hide buttons
                if (startBtn) startBtn.style.display = 'none';
                break;

            case 'available':
                // Show available message with start button
                if (startBtn) {
                    startBtn.textContent = 'Start Update';
                    startBtn.onclick = () => this.startDownload();
                }
                break;

            case 'downloading':
                // Show progress bar and details
                if (progressSection) progressSection.classList.remove('hidden');
                if (detailsSection) detailsSection.classList.remove('hidden');
                if (startBtn) startBtn.style.display = 'none';
                if (cancelBtn) {
                    cancelBtn.classList.remove('hidden');
                    cancelBtn.textContent = 'Cancel Download';
                    cancelBtn.onclick = () => this.cancelDownload();
                }
                break;

            case 'ready':
                // Show ready message with install button
                if (startBtn) {
                    startBtn.textContent = 'Install Update';
                    startBtn.onclick = () => this.installUpdate();
                }
                if (cancelBtn) cancelBtn.classList.add('hidden');
                break;

            case 'installing':
                // Show installing message, hide buttons
                if (startBtn) startBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.classList.add('hidden');
                break;

            case 'success':
                // Show success message, hide buttons
                if (startBtn) startBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.classList.add('hidden');
                break;

            case 'error':
                // Show error message with retry button
                if (startBtn) {
                    startBtn.textContent = 'Retry';
                    startBtn.onclick = () => this.checkForUpdates();
                }
                break;

            case 'none':
                // No update available, show close button only
                if (startBtn) {
                    startBtn.textContent = 'Close';
                    startBtn.onclick = () => this.hide();
                }
                break;
        }
    }

    /**
     * Cancel download (if supported by the update service)
     */
    private async cancelDownload(): Promise<void> {
        // Note: The current UpdateService doesn't have a cancel method
        // This is a placeholder for future implementation
        this.isDownloading = false;
        this.setModalState('available', 'Download cancelled');
    }

    /**
     * Setup event handlers for the app update modal
     */
    protected setupModalEvent(): void {
        // Event handlers are set up in setModalState method
        // This ensures they're updated based on current state
        window.electronAPI.onUpdateAvailable((versionInfo: { current: string; latest: string; }) => {
            this.setModalState('available', `New version available: ${versionInfo.latest}`);
        });

        window.electronAPI.onUpdateDownloadProgress((progress: { downloaded: number; total: number; message: string; }) => {
            if (this.downloadProgressCallback) {
                this.downloadProgressCallback(progress);
            }
        });
    }
}
