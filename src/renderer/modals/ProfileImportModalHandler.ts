import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';
import { ProfileService } from '../services/ProfileService.js';
import { GoogleDriveDownloadModalHandler } from './GoogleDriveDownloadModalHandler.js';

export class ProfileImportModalHandler extends ModalHandler {
    private profileService: ProfileService;
    private googleDriveDownload: GoogleDriveDownloadModalHandler;
    constructor(uiUtils: UIUtils, toastManager: ToastManager,
        profileService: ProfileService,
        googleDriveDownload: GoogleDriveDownloadModalHandler
    ) {
        super(uiUtils, toastManager);
        this.profileService = profileService;
        this.googleDriveDownload = googleDriveDownload;
    }

    async show(): Promise<void> {
        const templateLoaded = await this.ensureTemplateLoaded('import-choice-modal', 'import-choice-modal');
        if (!templateLoaded) return;
        this.showModal('import-choice-modal');
    }

    hide(): void {
        this.hideModal('import-choice-modal');
    }

    /**
     * Setup event handlers for the modal
     */
    protected setupModalEvent(): void {
        const importLocalBtn = document.getElementById('import-local-btn') as HTMLButtonElement;
        const importGoogleDriveBtn = document.getElementById('import-google-drive-btn') as HTMLButtonElement;
        const cancelImportChoice = document.getElementById('cancel-import-choice') as HTMLButtonElement;

        if (importLocalBtn && !importLocalBtn._listenerAdded) {
            importLocalBtn._listenerAdded = true;
            importLocalBtn.addEventListener('click', () => {
                this.hide();
                this.handleImportProfile();
            });
        }
        if (importGoogleDriveBtn && !importGoogleDriveBtn._listenerAdded) {
            importGoogleDriveBtn._listenerAdded = true;
            importGoogleDriveBtn.addEventListener('click', (event) => {
                this.hide();
                // Show Google Drive file picker modal
                this.googleDriveDownload.show();
            });
        }
        if (cancelImportChoice && !cancelImportChoice._listenerAdded) {
            cancelImportChoice._listenerAdded = true;
            cancelImportChoice.addEventListener('click', () => this.hide());
        }
    }

    private async handleImportProfile(): Promise<void> {
    try {
      const result = await this.profileService.importProfile();
      if (result.success) {
        this.showSuccess(result.message);

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
        this.showError(result.message);
      }
    } catch (error) {
      console.error('Error importing profile:', error);
      this.showError('Failed to import profile');
    }
  }
}
