import { WordManager } from './WordManager.js';
import { ModalManager } from '../components/ModalManager.js';
import { ProfileService } from './ProfileService.js';
import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';

export class EventManager {
  private wordManager: WordManager;
  private modalManager: ModalManager;
  private profileService: ProfileService;
  private uiUtils: UIUtils;
  private toastManager: ToastManager;

  constructor(
    wordManager: WordManager,
    modalManager: ModalManager,
    profileService: ProfileService,
    uiUtils: UIUtils,
    toastManager: ToastManager
  ) {
    this.wordManager = wordManager;
    this.modalManager = modalManager;
    this.profileService = profileService;
    this.uiUtils = uiUtils;
    this.toastManager = toastManager;

    // Event listeners will be set up by EverEtchApp after initialization
  }

  public setupEventListeners(): void {
    // These events don't need lazy loading
    this.setupWordInputEvents();
    this.setupProfileEvents();
    this.setupUIEvents();
    this.setupStreamingEvents();
  }

  private setupWordInputEvents(): void {
    // Word input
    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    if (wordInput) {
      wordInput.addEventListener('input', async (e) => {
        const target = e.target as HTMLInputElement;
        const query = target.value.trim();
        this.updateGenerateBtnState(query);
        if (query.length > 0) {
          await this.handleSearchInput(query);
        } else {
          this.uiUtils.clearSuggestions();
        }
      });

      // Hide suggestions when clicking outside
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const suggestionsDiv = document.getElementById('suggestions')!;
        if (suggestionsDiv && !suggestionsDiv.contains(target) && target !== wordInput) {
          this.uiUtils.hideSuggestions();
        }
      });

      // Hide suggestions when input loses focus
      wordInput.addEventListener('blur', () => {
        setTimeout(() => {
          this.uiUtils.hideSuggestions();
        }, 150);
      });

      // Generate button
      const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
      if (generateBtn) {
        generateBtn.addEventListener('click', () => {
          if (this.wordManager.getIsSearchMode()) {
            this.handleSearchExistingWord();
          } else {
            this.wordManager.handleGenerate();
          }
        });
        // Initially disable the generate button
        generateBtn.disabled = true;
      }

      // Enter key on input
      wordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
          if (this.wordManager.getIsGenerating() || (generateBtn && generateBtn.disabled)) {
            return;
          }

          if (this.wordManager.getIsSearchMode()) {
            this.handleSearchExistingWord();
          } else {
            this.wordManager.handleGenerate();
          }
        }
      });

      // Set up custom load words event listener for modal-triggered load words
      document.addEventListener('load-words', (event: any) => {
        this.wordManager.loadWords();
      });
    }
  }

  private setupProfileEvents(): void {
    // Profile selector
    const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
    if (profileSelect) {
      profileSelect.addEventListener('change', async (e) => {
        const target = e.target as HTMLSelectElement;
        const newProfile = target.value;
        if (newProfile) {
          await this.handleProfileSwitch(newProfile, profileSelect);
        }
      });
    }

    // Add profile button - ensure it's set up for both initial state and after toggle
    const addProfileBtn = document.getElementById('add-profile-btn') as HTMLButtonElement;
    if (addProfileBtn) {
      addProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.modalManager.showAddProfileModal();
      });
    }

    // Export button
    const exportBtn = document.getElementById('export-profile-btn') as HTMLButtonElement;
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.modalManager.showExportChoiceModal();
      });
    }

    // Import button
    const importBtn = document.getElementById('import-profile-btn') as HTMLButtonElement;
    if (importBtn) {
      importBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.modalManager.showImportChoiceModal();
      });
    }

    // Set up custom profile switch event listener for modal-triggered profile changes
    document.addEventListener('profile-switched', (event: any) => {
      const profileName = event.detail?.profileName;
      if (profileName) {
        this.handleProfileSwitch(profileName);
      }
    });
  }

  private setupUIEvents(): void {
    // Settings button
    const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.modalManager.showSettingsModal();
      });
    }

    // Import words button
    const importWordsBtn = document.getElementById('import-words-btn') as HTMLButtonElement;
    if (importWordsBtn) {
      importWordsBtn.addEventListener('click', () => {
        this.modalManager.showImportWordsModal();
      });
    }

    // Howto button
    const howtoBtn = document.getElementById('howto-btn') as HTMLButtonElement;
    if (howtoBtn) {
      howtoBtn.addEventListener('click', () => {
        this.modalManager.showHowtoModal();
      });
    }

    // More button and inline actions
    const moreBtn = document.getElementById('more-btn') as HTMLButtonElement;
    const inlineActions = document.getElementById('inline-actions') as HTMLElement;

    if (moreBtn && inlineActions) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.uiUtils.toggleInlineActions();
      });
    }

    // Sort button
    const sortBtn = document.getElementById('sort-btn') as HTMLButtonElement;
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        this.handleSortToggle();
      });
    }

    // Resize functionality
    const mainContent = document.getElementById('main-content') as HTMLElement;
    if (mainContent) {
      mainContent.addEventListener('mousedown', (e) => this.uiUtils.startResize(e));
    }

    // Global mouse events for resizing
    document.addEventListener('mousemove', (e) => this.uiUtils.handleResize(e));
    document.addEventListener('mouseup', () => this.uiUtils.stopResize());
  }

  private setupStreamingEvents(): void {
    // Set up word meaning streaming listener
    window.electronAPI.onWordMeaningStreaming((content: string) => {
      this.handleWordMeaningStreaming(content);
    });

    // Set up word metadata ready listener
    window.electronAPI.onWordMetadataReady((wordMeta: any) => {
      this.handleWordMetadataReady(wordMeta);
    });

    // Set up protocol navigation event listeners
    window.electronAPI.onProtocolNavigateWord(async (wordName: string) => {
      await this.handleProtocolNavigateWord(wordName);
    });

    window.electronAPI.onProtocolSwitchProfile(async (profileName: string) => {
      await this.handleProtocolSwitchProfile(profileName);
    });
  }

  // Event handler implementations
  private async handleSearchInput(query: string): Promise<void> {
    await this.wordManager.handleSearchInput(query);
  }

  private updateGenerateBtnState(query: string, hasExactMatch?: boolean): void {
    const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
    const generateIcon = document.getElementById('generate-icon') as unknown as SVGElement;

    if (!generateBtn || !generateIcon) return;

    generateBtn.disabled = query.length === 0;

    if (hasExactMatch !== undefined) {
      // Update the word manager's search mode
      // This will be handled by the word manager
      if (hasExactMatch) {
        generateBtn.title = 'View Existing Word';
        generateIcon.innerHTML = `
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        `;
      } else {
        generateBtn.title = 'Generate';
        generateIcon.innerHTML = `
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
        `;
      }
    }
  }

  private async handleSearchExistingWord(): Promise<void> {
    await this.wordManager.handleSearchExistingWord();
  }

  private async handleProfileSwitch(newProfile: string, profileSelect?: HTMLSelectElement): Promise<void> {
    // Show loading overlay
    this.uiUtils.showLoadingOverlay();

    // Get profile select element if not provided
    const selectElement = profileSelect || document.getElementById('profile-select') as HTMLSelectElement;

    // Disable profile select during switching
    if (selectElement) {
      selectElement.disabled = true;
    }

    try {
      const success = await this.profileService.switchProfile(newProfile);
      if (success) {
        // Successful switch - reset UI and load words
        await this.resetUIForProfileSwitch();
        await this.wordManager.loadWords();
      } else {
        // Failed switch - but still switch UI to failed profile so user can delete it
        this.profileService.setCurrentProfile(newProfile); // Update UI state
        if (selectElement) {
          selectElement.value = newProfile; // Keep dropdown on failed profile
        }
        this.toastManager.showError('Failed to load profile data. You can delete this profile in Settings.');
      }
    } catch (error) {
      console.error('Error switching profile:', error);
      // Even on exception, switch UI to failed profile so user can delete it
      this.profileService.setCurrentProfile(newProfile);
      if (selectElement) {
        selectElement.value = newProfile;
      }
      this.toastManager.showError('Failed to load profile data. You can delete this profile in Settings.');
    } finally {
      setTimeout(() => {
        this.uiUtils.hideLoadingOverlay();
        if (selectElement) {
          selectElement.disabled = false;
        }
      }, 500);
    }
  }

  private async handleSortToggle(): Promise<void> {
    // Toggle sort order
    const currentSortOrder = this.wordManager.getSortOrder();
    const newSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
    this.wordManager.setSortOrder(newSortOrder);

    // Save to StoreManager
    await this.saveSortOrder(newSortOrder);

    // Update sort button icon
    this.updateSortButtonIcon(newSortOrder);

    // Reload words with new sort order
    await this.wordManager.loadWords();
  }

  private async saveSortOrder(sortOrder: 'asc' | 'desc'): Promise<void> {
    try {
      // Save to electron-store via IPC
      await window.electronAPI.saveSortOrder(sortOrder);
    } catch (error) {
      console.error('Error saving sort order:', error);
    }
  }

  private updateSortButtonIcon(sortOrder: 'asc' | 'desc'): void {
    const sortBtn = document.getElementById('sort-btn') as HTMLButtonElement;
    if (!sortBtn) return;

    const iconContainer = sortBtn.querySelector('.sort-icon');
    if (!iconContainer) return;

    if (sortOrder === 'desc') {
      // Down arrow for descending (newest first) - more elegant design
      iconContainer.innerHTML = `
        <svg class="w-4 h-4" viewBox="0 0 6.4 6.4" xmlns="http://www.w3.org/2000/svg"><path d="m5.741 4.341-1 1-.001.001-.014.013-.007.005-.009.006-.009.005-.008.005-.009.004-.009.004-.009.003-.019.005-.01.002-.01.002-.009.001h-.039l-.009-.001-.011-.002-.01-.002-.009-.002-.01-.003-.009-.003-.009-.004-.009-.004-.008-.005-.009-.005-.008-.006-.008-.006-.013-.011-.002-.002-1-1a.2.2 0 0 1 .283-.283l.662.659V2.8a.2.2 0 0 1 .4 0v1.917l.659-.658a.2.2 0 1 1 .283.283M3 3H1.2a.2.2 0 0 0 0 .4H3A.2.2 0 1 0 3 3M1.2 1.8h3.4a.2.2 0 0 0 0-.4H1.2a.2.2 0 1 0 0 .4m1.4 2.8H1.2a.2.2 0 0 0 0 .4h1.4a.2.2 0 0 0 0-.4"/></svg>
      `;
      sortBtn.title = 'Newest first → Oldest first';
    } else {
      // Up arrow for ascending (oldest first) - more elegant design
      iconContainer.innerHTML = `
        <svg class="w-4 h-4" viewBox="0 0 6.4 6.4" xmlns="http://www.w3.org/2000/svg"><path d="M5.741 2.341a.2.2 0 0 1-.283 0L4.8 1.683V3.6a.2.2 0 0 1-.4 0V1.683l-.659.658a.2.2 0 0 1-.283-.283l1-1 .002-.002.013-.011.007-.006.008-.006.009-.005.008-.005.009-.004.009-.004.009-.003.01-.004.008-.002.011-.003.009-.001.10-.001L4.595 1h.009l.015.001.01.002.009.001.011.003.008.002.01.004.008.003.009.004.009.004.009.005.008.005.009.007.007.005.014.013.001.001 1 1a.2.2 0 0 1 0 .283M1.2 3.4H3A.2.2 0 1 0 3 3H1.2a.2.2 0 0 0 0 .4m0-1.6h1.4a.2.2 0 0 0 0-.4H1.2a.2.2 0 1 0 0 .4m3.4 2.8H1.2a.2.2 0 0 0 0 .4h3.4a.2.2 0 0 0 0-.4"/></svg>
      `;
      sortBtn.title = 'Oldest first → Newest first';
    }
  }

  private handleWordMeaningStreaming(content: string): void {
    this.wordManager.handleWordMeaningStreaming(content);
  }

  private handleWordMetadataReady(wordMeta: any): void {
    this.wordManager.handleWordMetadataReady(wordMeta);
  }

  private async handleProtocolNavigateWord(wordName: string): Promise<void> {
    // This should be handled by the ProtocolManager, but for now we'll handle it directly
    try {
      console.log('🎯 EventManager: Handling protocol navigation to word:', wordName);

      // Try to find the word by name
      const word = await window.electronAPI.getWordByName(wordName);
      if (word) {
        // Word found, select it using WordManager
        await this.wordManager.selectWord(word);
        this.toastManager.showSuccess(`Navigated to word: ${wordName}`);
      } else {
        // Word not found, auto-generate it
        console.log('🎯 EventManager: Word not found, auto-generating:', wordName);
        await this.handleProtocolAutoGenerateWord(wordName);
      }
    } catch (error) {
      console.error('Error handling protocol navigation:', error);
      this.toastManager.showError('Failed to navigate to word');
    }
  }

  private async handleProtocolSwitchProfile(profileName: string): Promise<void> {
    try {
      console.log('EventManager: Handling protocol profile switch to:', profileName);

      // Check if the profile exists
      const profiles = await window.electronAPI.getProfiles();
      if (profiles.includes(profileName)) {
        // Profile exists, switch to it
        await this.handleProfileSwitch(profileName);
        this.toastManager.showSuccess(`Switched to profile: ${profileName}`);
      } else {
        this.toastManager.showError(`Profile "${profileName}" not found`);
      }
    } catch (error) {
      console.error('Error handling protocol profile switch:', error);
      this.toastManager.showError('Failed to switch profile');
    }
  }

  private async handleProtocolAutoGenerateWord(wordName: string): Promise<void> {
    try {
      // Check if we're already generating something
      if (this.wordManager.getIsGenerating()) {
        this.toastManager.showWarning('Please wait for current generation to complete');
        return;
      }

      // Set the word in input field
      const wordInput = document.getElementById('word-input') as HTMLInputElement;
      wordInput.value = wordName;

      // Show loading message
      this.toastManager.showInfo(`Generating word: ${wordName}...`);

      // Trigger generation using WordManager
      await this.wordManager.handleGenerate();

      // The word should now be generated and selected
      this.toastManager.showSuccess(`Word "${wordName}" generated and selected!`);

    } catch (error) {
      console.error('Error auto-generating word:', error);
      this.toastManager.showError(`Failed to generate word: ${wordName}`);
    }
  }

  private async resetUIForProfileSwitch(): Promise<void> {
    // Reset word manager state
    this.wordManager.setCurrentWord(null);
    this.uiUtils.clearWordDetails();

    // Clear word input
    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    if (wordInput) {
      wordInput.value = '';
    }

    // Clear suggestions
    this.uiUtils.clearSuggestions();

    // Reset generation state
    // Note: WordManager handles its own generation state

    // Clear word list UI
    const wordList = document.getElementById('word-list')!;
    if (wordList) {
      wordList.innerHTML = '';
    }

    // Clear associated list UI
    const associatedList = document.getElementById('associated-list')!;
    if (associatedList) {
      associatedList.innerHTML = '';
    }

    // Reset associated words manager
    // Note: AssociatedWordsManager handles its own cleanup

    // Update generate button state
    this.updateGenerateBtnState('', false);

    // Update word counts
    this.uiUtils.updateWordCount(0);
    this.uiUtils.updateAssociatedCount(0);

    // Reload panel widths
    await this.uiUtils.loadPanelWidths();
  }
}
