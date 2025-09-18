import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';
import { ProfileService } from '../services/ProfileService.js';
import { GoogleDriveUploadModalHandler } from './GoogleDriveUploadModalHandler.js';

export class ProfileExportModalHandler extends ModalHandler {
    private profileService: ProfileService;
    private googleDriveUpload: GoogleDriveUploadModalHandler;
    constructor(uiUtils: UIUtils, toastManager: ToastManager,
        profileService: ProfileService,
        googleDriveUpload: GoogleDriveUploadModalHandler
    ) {
        super(uiUtils, toastManager);
        this.profileService = profileService;
        this.googleDriveUpload = googleDriveUpload;
    }

    async show(): Promise<void> {
        const templateLoaded = await this.ensureTemplateLoaded('export-choice-modal', 'export-choice-modal');
        if (!templateLoaded) return;
        this.showModal('export-choice-modal');
    }

    hide(): void {
        this.hideModal('export-choice-modal');
    }

    /**
     * Setup event handlers for the modal
     */
    protected setupModalEvent(): void {
        const exportLocalBtn = document.getElementById('export-local-btn') as HTMLButtonElement;
        const exportGoogleDriveBtn = document.getElementById('export-google-drive-btn') as HTMLButtonElement;
        const cancelExportChoice = document.getElementById('cancel-export-choice') as HTMLButtonElement;

        if (exportLocalBtn && !exportLocalBtn._listenerAdded) {
            exportLocalBtn._listenerAdded = true;
            exportLocalBtn.addEventListener('click', () => {
                this.hide();
                this.handleExportProfile();
            });
        }
        if (exportGoogleDriveBtn && !exportGoogleDriveBtn._listenerAdded) {
            exportGoogleDriveBtn._listenerAdded = true;
            exportGoogleDriveBtn.addEventListener('click', async () => {
                this.hide();
                // Show Uploaded result Modal
                await this.googleDriveUpload.show();
            });
        }
        if (cancelExportChoice && !cancelExportChoice._listenerAdded) {
            cancelExportChoice._listenerAdded = true;
            cancelExportChoice.addEventListener('click', () => this.hide());
        }
    }

    private async handleExportProfile(): Promise<void> {
        try {
            const result = await this.profileService.exportProfile();
            if (result.success) {
                this.showSuccess(result.message);
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            console.error('Error exporting profile:', error);
            this.showError('Failed to export profile');
        }
    }
}
