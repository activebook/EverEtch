import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ProfileService } from '../services/ProfileService.js';
import { ModalHandler } from './ModalHandler.js';

export class ProfileAddModalHandler extends ModalHandler {
  private profileService: ProfileService;

  constructor(
    uiUtils: UIUtils,
    toastManager: ToastManager,
    profileService: ProfileService
  ) {
    super(uiUtils, toastManager);
    this.profileService = profileService;
  }

  // Add Profile Modal methods
  async show(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('add-profile-modal', 'add-profile-modal');
    if (!templateLoaded) return;

    this.showModal('add-profile-modal');   

    const input = document.getElementById('new-profile-name') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
    setTimeout(() => {
      if (input) {
        input.focus();
      }
    }, 100);
  }

  hide(): void {
    this.hideModal('add-profile-modal');
  }

  async handleCreateProfile(): Promise<void> {
    const input = document.getElementById('new-profile-name') as HTMLInputElement;
    const profileName = input ? input.value.trim() : '';

    if (!profileName) {
      this.showError('Profile name cannot be empty');
      return;
    }

    if (this.profileService.getProfiles().includes(profileName)) {
      this.showError('A profile with this name already exists');
      return;
    }

    try {
      const success = await this.profileService.createProfile(profileName);
      if (success) {
        this.showSuccess(`Profile "${profileName}" created successfully`);

        // Switch to the newly created profile
        this.profileService.setCurrentProfile(profileName);

        // Trigger the profile switch UI update
        const profileSwitchEvent = new CustomEvent('profile-switched', {
          detail: { profileName: profileName }
        });
        document.dispatchEvent(profileSwitchEvent);
      } else {
        this.showError('Failed to create profile');
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      this.showError('Failed to create profile');
    }

    this.hide();
  }

  protected setupModalEvent(): void {
    const cancelAddProfileBtn = document.getElementById('cancel-add-profile') as HTMLButtonElement;
    const createProfileBtn = document.getElementById('create-profile') as HTMLButtonElement;

    if (cancelAddProfileBtn && !cancelAddProfileBtn._listenerAdded) {
      cancelAddProfileBtn._listenerAdded = true;
      cancelAddProfileBtn.addEventListener('click', () => this.hide());
    }
    if (createProfileBtn && !createProfileBtn._listenerAdded) {
      createProfileBtn._listenerAdded = true;
      createProfileBtn.addEventListener('click', () => this.handleCreateProfile());
    }
  }
}
