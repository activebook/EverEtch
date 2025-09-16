import { ProfileService } from './services/ProfileService.js';
import { WordService } from './services/WordService.js';
import { WordImportService, ImportProgress, ImportCallbacks } from './services/WordImportService.js';
import { ToastManager } from './components/ToastManager.js';
import { WordRenderer } from './components/WordRenderer.js';
import { UIUtils } from './utils/UIUtils.js';
import { WordManager } from './services/WordManager.js';
import { AssociatedWordsManager } from './services/AssociatedWordsManager.js';
import { ModalManager } from './components/ModalManager.js';
import { GoogleDriveManager } from './services/GoogleDriveManager.js';
import { ProtocolManager } from './services/ProtocolManager.js';
import { EventManager } from './services/EventManager.js';

// Constants for pagination
const WORDS_PAGE_SIZE = 10; // For release builds, set to 10, debug 5
const ASSOCIATED_WORDS_PAGE_SIZE = 10; // For release builds, set to 10, debug 5

export class EverEtchApp {
  // Core services (keep existing)
  private profileService: ProfileService;
  private wordService: WordService;
  private wordImportService: WordImportService;
  private toastManager: ToastManager;
  private wordRenderer: WordRenderer;
  private uiUtils: UIUtils;

  // New extracted managers
  private wordManager!: WordManager;
  private associatedWordsManager!: AssociatedWordsManager;
  private modalManager!: ModalManager;
  private googleDriveManager!: GoogleDriveManager;
  private protocolManager!: ProtocolManager;
  private eventManager!: EventManager;

  // Minimal app-level state (managers handle their own state)

  constructor() {
    // Initialize core services
    this.profileService = new ProfileService();
    this.wordService = new WordService();
    this.toastManager = new ToastManager();
    this.uiUtils = new UIUtils();
    this.wordImportService = new WordImportService(this.wordService, this.toastManager);
    this.wordRenderer = new WordRenderer(this.wordService, this.toastManager);

    // Initialize managers
    this.initializeManagers();

    // Initialize app
    this.initializeApp();
  }

  private initializeManagers(): void {
    // Create associated words manager first (needed by word manager)
    this.associatedWordsManager = new AssociatedWordsManager(
      this.wordService,
      this.toastManager,
      this.wordRenderer,
      this.uiUtils
    );

    // Create word manager
    this.wordManager = new WordManager(
      this.wordService,
      this.toastManager,
      this.wordRenderer,
      this.uiUtils,
      this.associatedWordsManager
    );

    // Create other managers
    this.googleDriveManager = new GoogleDriveManager(this.toastManager, this.profileService);
    this.protocolManager = new ProtocolManager(this.toastManager, this.wordManager);

    // Create modal manager
    this.modalManager = new ModalManager(
      this.wordManager,
      this.toastManager,
      this.profileService,
      this.googleDriveManager,
      this.wordImportService,
      this.uiUtils);

    // Create event manager (depends on all other managers)
    this.eventManager = new EventManager(
      this.wordManager,
      this.modalManager,
      this.profileService,
      this.uiUtils,      
      this.toastManager
    );
  }

  private async initializeApp(): Promise<void> {
    try {
      // Load profiles first
      console.log('Loading profiles...');
      await this.profileService.loadProfiles();
      console.log('Loaded profiles:', this.profileService.getProfiles());

      // Load saved sort order BEFORE loading words
      await this.wordManager.loadSortOrder();

      // Check if there's a last opened profile and switch to it with loading overlay
      const currentProfile = this.profileService.getCurrentProfile();
      if (currentProfile) {
        console.log('Switching to last opened profile:', currentProfile);

        // Show loading overlay
        this.uiUtils.showLoadingOverlay();

        try {
          // Switch to the last opened profile
          const success = await this.profileService.switchProfile(currentProfile);
          if (success) {
            console.log('Successfully switched to profile:', currentProfile);
            // Load words for the switched profile (with correct sort order)
            await this.wordManager.loadWords();
          } else {
            console.error('Failed to switch to profile:', currentProfile);
            this.toastManager.showError('Failed to load last opened profile');
            // Still try to load words with whatever profile is current
            await this.wordManager.loadWords();
          }
        } catch (error) {
          console.error('Error switching to profile:', error);
          this.toastManager.showError('Failed to load last opened profile');
        } finally {
          setTimeout(() => {
            // Hide loading overlay
            this.uiUtils.hideLoadingOverlay();
          }, 500);
        }
      } else {
        // No current profile, just load words
        console.log('No current profile found, loading words...');
      }

      // Set up event listeners
      this.eventManager.setupEventListeners();

      // Load saved panel widths
      await this.uiUtils.loadPanelWidths();

      // Signal to main process that app is fully ready
      console.log('🎯 Renderer: App fully initialized, sending app-ready signal');
      window.electronAPI.sendAppRenderReady();

    } catch (error) {
      console.error('Error initializing app:', error);
      this.toastManager.showError('Failed to initialize application');
    }
  }
}
