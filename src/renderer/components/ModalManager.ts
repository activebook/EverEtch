import { WordManager } from '../services/WordManager.js';
import { ToastManager } from './ToastManager.js';
import { ProfileService } from '../services/ProfileService.js';
import { GoogleDriveManager } from '../services/GoogleDriveManager.js';
import { WordImportService } from '../services/WordImportService.js';
import { UIUtils } from '../utils/UIUtils.js';
import { ModelMemoService } from '../services/ModelMemoService.js';
import { CustomModelDropdown } from './CustomModelDropdown.js';
import { HelpModalHandler } from '../modals/HelpModalHandler.js';
import { ProfileAddModalHandler } from '../modals/ProfileAddModalHandler.js';
import { ProfileSetModalHandler } from '../modals/ProfileSetModalHandler.js';
import { ProfileImportModalHandler } from '../modals/ProfileImportModalHandler.js';
import { ProfileExportModalHandler } from '../modals/ProfileExportModalHandler.js';
import { WordsImportModalHandler } from '../modals/WordsImportModalHandler.js';
import { WordsImportCompleteModalHandler } from '../modals/WordsImportCompleteModalHandler.js';
import { WordsImportProgressModalHandler } from '../modals/WordsImportProgressModalHandler.js';
import { GoogleDriveDownloadModalHandler } from '../modals/GoogleDriveDownloadModalHandler.js';
import { GoogleDriveUploadModalHandler } from '../modals/GoogleDriveUploadModalHandler.js';
import { SemanticSettingsModalHandler } from '../modals/SemanticSettingsModalHandler.js';

export class ModalManager {
  private toastManager: ToastManager;
  private profileService: ProfileService;
  private wordImportService: WordImportService;
  private googleDriveManager: GoogleDriveManager;

  private modelMemoService: ModelMemoService;
  private uiUtils: UIUtils;

  // Modal handlers
  private helpModalHandler: HelpModalHandler;
  private profileAddModalHandler: ProfileAddModalHandler;
  private profileSetModalHandler: ProfileSetModalHandler;
  private profileImportModalHandler: ProfileImportModalHandler;
  private profileExportModalHandler: ProfileExportModalHandler;
  private wordsImportModalHandler: WordsImportModalHandler;
  private wordsImportComplete: WordsImportCompleteModalHandler;
  private wordsImportProgress: WordsImportProgressModalHandler;
  private googleDriveDownloadModalHandler: GoogleDriveDownloadModalHandler;
  private googleDriveUploadModalHandler: GoogleDriveUploadModalHandler;
  private semanticSettingsModalHandler: SemanticSettingsModalHandler;

  constructor(
    toastManager: ToastManager,
    profileService: ProfileService,
    googleDriveManager: GoogleDriveManager,
    wordImportService: WordImportService,
    modelMemoService: ModelMemoService,
    uiUtils: UIUtils) {
    this.toastManager = toastManager;
    this.profileService = profileService;
    this.googleDriveManager = googleDriveManager;
    this.wordImportService = wordImportService;
    this.modelMemoService = modelMemoService;
    this.uiUtils = uiUtils;

    // Initialize modal utilities and handlers
    this.helpModalHandler = new HelpModalHandler(this.uiUtils, this.toastManager);

    this.profileAddModalHandler = new ProfileAddModalHandler(
      this.uiUtils,
      this.toastManager,
      this.profileService);

    this.profileSetModalHandler = new ProfileSetModalHandler(
      this.uiUtils,
      this.toastManager,
      this.profileService,
      this.modelMemoService);

    this.googleDriveDownloadModalHandler = new GoogleDriveDownloadModalHandler(
      this.uiUtils,
      this.toastManager,
      this.googleDriveManager);

    this.googleDriveUploadModalHandler = new GoogleDriveUploadModalHandler(
      this.uiUtils,
      this.toastManager,
      this.googleDriveManager);

    this.profileImportModalHandler = new ProfileImportModalHandler(
      this.uiUtils,
      this.toastManager,
      this.profileService,
      this.googleDriveDownloadModalHandler);

    this.profileExportModalHandler = new ProfileExportModalHandler(
      this.uiUtils,
      this.toastManager,
      this.profileService,
      this.googleDriveUploadModalHandler);

    this.wordsImportComplete = new WordsImportCompleteModalHandler(
      this.uiUtils,
      this.toastManager);

    this.wordsImportProgress = new WordsImportProgressModalHandler(
      this.uiUtils,
      this.toastManager);

    this.wordsImportModalHandler = new WordsImportModalHandler(
      this.uiUtils,
      this.toastManager,
      this.wordImportService,
      this.wordsImportComplete,
      this.wordsImportProgress
    );

    // Initialize semantic search settings modal handler
    this.semanticSettingsModalHandler = new SemanticSettingsModalHandler(
      this.uiUtils,
      this.toastManager,
      this.profileService
    );
  }

  // Profile modal methods - delegated to ProfileModalHandler
  async showAddProfileModal(): Promise<void> {
    await this.profileAddModalHandler.show();
  }

  hideAddProfileModal(): void {
    this.profileAddModalHandler.hide();
  }

  // Settings modal methods - delegated to ProfileModalHandler
  async showSettingsModal(): Promise<void> {
    await this.profileSetModalHandler.show();
  }

  hideSettingsModal(): void {
    this.profileSetModalHandler.hide();
  }

  // Howto modal methods - delegated to HelpModalHandler
  async showHowtoModal(): Promise<void> {
    await this.helpModalHandler.show();
  }

  // Import/Export modal methods
  async showExportChoiceModal(): Promise<void> {
    this.profileExportModalHandler.show();
  }

  hideExportChoiceModal(): void {
    this.profileExportModalHandler.hide();
  }

  async showImportChoiceModal(): Promise<void> {
    this.profileImportModalHandler.show();
  }

  hideImportChoiceModal(): void {
    this.profileImportModalHandler.hide();
  }

  // Word import modal methods
  async showImportWordsModal(): Promise<void> {
    this.wordsImportModalHandler.show();
  }

  hideImportWordsModal(): void {
    this.wordsImportModalHandler.hide();
  }

  // Semantic search settings modal methods
  async showSemanticSettingsModal(): Promise<void> {
    await this.semanticSettingsModalHandler.show();
  }

  hideSemanticSettingsModal(): void {
    this.semanticSettingsModalHandler.hide();
  }
}
