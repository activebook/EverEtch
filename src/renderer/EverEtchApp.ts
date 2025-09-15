import { WordDocument, WordListItem } from './types.js';
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
import { generateGenerationId } from './utils/Common.js';

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
    this.modalManager = new ModalManager(this.toastManager, this.profileService);
    this.googleDriveManager = new GoogleDriveManager(this.toastManager, this.profileService);
    this.protocolManager = new ProtocolManager(this.toastManager);

    // Create event manager (depends on all other managers)
    this.eventManager = new EventManager(
      this.wordManager,
      this.modalManager,
      this.googleDriveManager,
      this.profileService,
      this.uiUtils,
      this.wordImportService,
      this.toastManager
    );
  }

  private showLoadingOverlay(): void {
    const loadingOverlay = document.getElementById('loading-overlay')!;
    loadingOverlay.classList.remove('hidden');
  }

  private hideLoadingOverlay(): void {
    const loadingOverlay = document.getElementById('loading-overlay')!;
    loadingOverlay.classList.add('hidden');
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
        this.showLoadingOverlay();

        try {
          // Switch to the last opened profile
          const success = await this.profileService.switchProfile(currentProfile);
          if (success) {
            console.log('Successfully switched to profile:', currentProfile);
            // Load words for the switched profile (with correct sort order)
            await this.loadWords();
          } else {
            console.error('Failed to switch to profile:', currentProfile);
            this.toastManager.showError('Failed to load last opened profile');
            // Still try to load words with whatever profile is current
            await this.loadWords();
          }
        } catch (error) {
          console.error('Error switching to profile:', error);
          this.toastManager.showError('Failed to load last opened profile');
          // Still try to load words
          await this.loadWords();
        } finally {
          setTimeout(() => {
            // Hide loading overlay
            this.hideLoadingOverlay();
          }, 500);
        }
      } else {
        // No current profile, just load words
        console.log('No current profile found, loading words...');
        await this.loadWords();
      }      

      // Set up event listeners
      this.setupEventListeners();

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

  private async loadWords(): Promise<void> {
    await this.wordManager.loadWords();
  }



  private setupEventListeners(): void {
    // Delegate event setup to EventManager
    this.eventManager.setupEventListeners();
  }



  private async handleGenerate(): Promise<void> {
    await this.wordManager.handleGenerate();
  }



  private async loadAssociatedWords(tag: string): Promise<void> {
    await this.associatedWordsManager.loadAssociatedWords(tag);
  }

  private async selectWord(word: WordDocument | WordListItem): Promise<void> {
    await this.wordManager.selectWord(word);
  }







  private async handleSearchExistingWord(): Promise<void> {
    await this.wordManager.handleSearchExistingWord();
  }

  // Profile modal methods
  private showAddProfileModal(): void {
    this.modalManager.showAddProfileModal();
  }

  private hideAddProfileModal(): void {
    this.modalManager.hideAddProfileModal();
  }

  private async handleCreateProfile(): Promise<void> {
    await this.modalManager.handleCreateProfile();
  }

  private async handleDeleteProfile(): Promise<void> {
    await this.modalManager.handleDeleteProfile();
  }

  private async handleExportProfile(): Promise<void> {
    await this.modalManager.handleExportProfile();
  }

  private async handleImportProfile(): Promise<void> {
    await this.modalManager.handleImportProfile();
  }

  // Settings modal methods - delegate to ModalManager
  private async showSettingsModal(): Promise<void> {
    await this.modalManager.showSettingsModal();
  }

  private hideSettingsModal(): void {
    this.modalManager.hideSettingsModal();
  }

  private async saveSettings(): Promise<void> {
    await this.modalManager.saveSettings();
  }

  // Howto modal methods - delegate to ModalManager
  private async showHowtoModal(): Promise<void> {
    await this.modalManager.showHowtoModal();
  }

  private hideHowtoModal(): void {
    this.modalManager.hideHowtoModal();
  }

  private toggleApiKeyVisibility(): void {
    this.modalManager.toggleApiKeyVisibility();
  }

  private async handleSortToggle(): Promise<void> {
    await this.wordManager.handleSortToggle();
  }



  // Protocol handlers
  private async handleProtocolNavigateWord(wordName: string): Promise<void> {
    await this.protocolManager.handleProtocolNavigateWord(wordName);
  }

  private async handleProtocolSwitchProfile(profileName: string): Promise<void> {
    await this.protocolManager.handleProtocolSwitchProfile(profileName);
  }


}
