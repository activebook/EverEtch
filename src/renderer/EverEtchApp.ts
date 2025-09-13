import { WordDocument, WordListItem, PaginationState, AssociatedWordsState } from './types.js';
import { ProfileService } from './services/ProfileService.js';
import { WordService } from './services/WordService.js';
import { WordImportService, ImportProgress, ImportCallbacks } from './services/WordImportService.js';
import { ToastManager } from './components/ToastManager.js';
import { WordRenderer } from './components/WordRenderer.js';
import { UIUtils } from './utils/UIUtils.js';
import { generateGenerationId } from './utils/Common.js';

// Constants for pagination
const WORDS_PAGE_SIZE = 10; // For release builds, set to 10, debug 5
const ASSOCIATED_WORDS_PAGE_SIZE = 10; // For release builds, set to 10, debug 5

export class EverEtchApp {
  private profileService: ProfileService;
  private wordService: WordService;
  private wordImportService: WordImportService;
  private toastManager: ToastManager;
  private wordRenderer: WordRenderer;
  private uiUtils: UIUtils;

  // App state
  private currentWord: WordDocument | null = null;
  private currentGenerationId: string = '';
  private streamingContent: string = '';
  private words: WordListItem[] = [];
  private wordsPagination: PaginationState = {
    offset: 0,
    pageSize: WORDS_PAGE_SIZE,
    isLoading: false,
    hasMore: true,
    total: 0
  };
  private associatedWordsState: AssociatedWordsState = {
    words: [],
    offset: 0,
    pageSize: ASSOCIATED_WORDS_PAGE_SIZE,
    isLoading: false,
    hasMore: true,
    total: 0,
    currentTag: '',
    scrollObserver: null
  };
  private isSearchMode: boolean = false;
  private isGenerating: boolean = false;
  private isImporting: boolean = false;
  private scrollObserver: IntersectionObserver | null = null;
  private sortOrder: 'asc' | 'desc' = 'desc';

  constructor() {
    this.profileService = new ProfileService();
    this.wordService = new WordService();
    this.toastManager = new ToastManager();
    this.uiUtils = new UIUtils();
    this.wordImportService = new WordImportService(this.wordService, this.toastManager);

    this.wordRenderer = new WordRenderer(this.wordService, this.toastManager);

    // Set up event callbacks
    this.setupWordRendererCallbacks();

    this.initializeApp();
  }

  private showLoadingOverlay(): void {
    const loadingOverlay = document.getElementById('loading-overlay')!;
    loadingOverlay.classList.remove('hidden');
  }

  private hideLoadingOverlay(): void {
    const loadingOverlay = document.getElementById('loading-overlay')!;
    loadingOverlay.classList.add('hidden');
  }

  private setupWordRendererCallbacks(): void {
    this.wordRenderer.onTagClick = (tag: string) => this.loadAssociatedWords(tag);
    this.wordRenderer.onSynonymClick = (synonym: string) => this.loadAssociatedWords(synonym);
    this.wordRenderer.onAntonymClick = (antonym: string) => this.loadAssociatedWords(antonym);
    this.wordRenderer.onAddWord = (word: WordDocument) => this.handleAddWord(word);
    this.wordRenderer.onRefreshWord = (word: WordDocument) => this.handleRefreshWord(word);
    this.wordRenderer.onDeleteWord = (word: WordDocument) => this.handleDeleteWord(word);
    this.wordRenderer.onWriteRemark = (word: WordDocument) => this.handleWriteRemark(word);
    this.wordRenderer.onWordSelect = (word: WordDocument | WordListItem) => this.selectWord(word);
  }

  private async initializeApp(): Promise<void> {
    try {
      // Load profiles first
      console.log('Loading profiles...');
      await this.profileService.loadProfiles();
      console.log('Loaded profiles:', this.profileService.getProfiles());

      // Load saved sort order BEFORE loading words
      await this.loadSortOrder();

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

      // Update sort button icon after loading
      this.updateSortButtonIcon();

      // Signal to main process that app is fully ready
      console.log('🎯 Renderer: App fully initialized, sending app-ready signal');
      window.electronAPI.sendAppRenderReady();

    } catch (error) {
      console.error('Error initializing app:', error);
      this.toastManager.showError('Failed to initialize application');
    }
  }

  private async loadWords(): Promise<void> {
    try {
      // Reset pagination state
      this.words = [];
      this.wordsPagination = {
        offset: 0,
        pageSize: WORDS_PAGE_SIZE,
        isLoading: false,
        hasMore: true,
        total: 0
      };

      // Clean up existing observer
      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
      }

      // Clear the word list UI before loading new data
      const wordList = document.getElementById('word-list')!;
      if (wordList) {
        wordList.innerHTML = '';
      }

      // Load first page first, then setup observer after content is rendered
      await this.loadMoreWords();

      // Setup scroll observer after content is rendered to ensure proper detection
      setTimeout(() => {
        this.setupScrollObserver();

        // Force show the loading indicator if there are more words
        if (this.wordsPagination.hasMore) {
          this.showLoadingIndicator();
        }
      }, 100);

    } catch (error) {
      console.error('Error loading words:', error);
    }
  }

  private async loadMoreWords(): Promise<void> {
    if (this.wordsPagination.isLoading || !this.wordsPagination.hasMore) return;

    this.wordsPagination.isLoading = true;
    this.showLoadingIndicator();

    try {
      const result = await window.electronAPI.getWordsPaginated(
        this.wordsPagination.offset,
        this.wordsPagination.pageSize,
        this.sortOrder
      );

      // Filter out duplicates based on word ID
      const existingIds = new Set(this.words.map(word => word.id));
      const newWords = result.words.filter(word => !existingIds.has(word.id));

      // Add new words to our collection (only non-duplicates)
      this.words.push(...newWords);
      this.wordsPagination.hasMore = result.hasMore;
      this.wordsPagination.total = result.total;
      this.wordsPagination.offset += this.wordsPagination.pageSize;

      // Render the new words (only non-duplicates)
      if (newWords.length > 0) {
        this.wordRenderer.renderWordListIncremental(newWords);
      }

      // Update word count display
      this.uiUtils.updateWordCount(this.wordsPagination.total);
    } catch (error) {
      console.error('Error loading more words:', error);
      this.toastManager.showError('Failed to load more words');
    } finally {
      this.wordsPagination.isLoading = false;
      this.updateLoadingIndicator();
    }
  }

  private setupScrollObserver(): void {
    // Create loading indicator element if it doesn't exist
    let loadingIndicator = document.getElementById('loading-indicator');
    if (!loadingIndicator) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'loading-indicator';
      loadingIndicator.className = 'flex justify-center items-center py-4 text-slate-500';
      loadingIndicator.innerHTML = `
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-500"></div>
        <span class="ml-2 text-sm">Loading more words...</span>
      `;
      loadingIndicator.style.display = 'none';

      const wordList = document.getElementById('word-list')!;
      wordList.appendChild(loadingIndicator);
    }

    // Setup intersection observer with robust duplicate prevention
    let isTriggering = false;

    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry.isIntersecting && !isTriggering && this.wordsPagination.hasMore && !this.wordsPagination.isLoading) {
          isTriggering = true;
          this.loadMoreWords().finally(() => {
            isTriggering = false;
          });
        }
      },
      {
        root: document.getElementById('word-list'),
        rootMargin: '0px 0px 0px 0px',
        threshold: 0.1
      }
    );

    this.scrollObserver.observe(loadingIndicator);
  }

  private showLoadingIndicator(): void {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'flex';
    }
  }

  private updateLoadingIndicator(): void {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (!loadingIndicator) return;

    if (this.wordsPagination.isLoading) {
      loadingIndicator.innerHTML = `
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-500"></div>
        <span class="ml-2 text-sm text-slate-500">Loading more words...</span>
      `;
    } else if (!this.wordsPagination.hasMore) {
      loadingIndicator.innerHTML = `
        <div class="rounded-full h-6 w-6 border-2 border-slate-300 flex items-center justify-center">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <span class="ml-2 text-sm text-slate-400">No more words to load</span>
      `;
    } else {
      loadingIndicator.innerHTML = `
        <div class="rounded-full h-6 w-6 border-2 border-slate-400 flex items-center justify-center">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
          </svg>
        </div>
        <span class="ml-2 text-sm text-slate-400">Scroll for more words</span>
      `;
    }
  }

  private setupEventListeners(): void {
    // Set up word meaning streaming listener
    window.electronAPI.onWordMeaningStreaming((content: string) => {
      this.handleWordMeaningStreaming(content);
    });

    // Set up word metadata ready listener
    window.electronAPI.onWordMetadataReady((wordMeta: any) => {
      this.handleWordMetadataReady(wordMeta);
    });

    // Set up protocol handlers for custom URL scheme
    window.electronAPI.onProtocolNavigateWord((wordName: string) => {
      console.log('🎯 Renderer: Received protocol navigation request for word:', wordName);
      this.handleProtocolNavigateWord(wordName);
    });

    window.electronAPI.onProtocolSwitchProfile((profileName: string) => {
      console.log('🎯 Renderer: Received protocol profile switch request for:', profileName);
      this.handleProtocolSwitchProfile(profileName);
    });

    // Profile selector
    const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
    profileSelect.addEventListener('change', async (e) => {
      const target = e.target as HTMLSelectElement;
      const newProfile = target.value;
      if (newProfile && newProfile !== this.profileService.getCurrentProfile()) {
        // Show loading overlay
        this.showLoadingOverlay();

        // Disable profile select during switching
        profileSelect.disabled = true;

        try {
          const success = await this.profileService.switchProfile(newProfile);
          if (success) {
            // Successful switch - load words normally
            this.resetUIForProfileSwitch();
            await this.loadWords();
          } else {
            // Failed switch - but still switch UI to failed profile so user can delete it
            this.profileService.setCurrentProfile(newProfile); // Update UI state
            profileSelect.value = newProfile; // Keep dropdown on failed profile
            this.resetUIForProfileSwitch(); // Reset UI
            // Don't load words - just show empty state

            this.toastManager.showError('Failed to load profile data. You can delete this profile in Settings.');
          }
        } catch (error) {
          console.error('Error switching profile:', error);
          // Even on exception, switch UI to failed profile so user can delete it
          this.profileService.setCurrentProfile(newProfile);
          profileSelect.value = newProfile;
          this.resetUIForProfileSwitch();
          this.toastManager.showError('Failed to load profile data. You can delete this profile in Settings.');
        } finally {
          setTimeout(() => {
              this.hideLoadingOverlay();
              profileSelect.disabled = false;
            }, 500);
        }
      }
    });

    // Word input
    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    wordInput.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const query = target.value.trim();
      this.updateGenerateBtnState(query);
      if (query.length > 0) {
        this.handleSearchInput(query);
      } else {
        this.uiUtils.clearSuggestions();
      }
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const suggestionsDiv = document.getElementById('suggestions')!;
      const wordInput = document.getElementById('word-input')!;

      if (!suggestionsDiv.contains(target) && target !== wordInput) {
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
    generateBtn.addEventListener('click', () => {
      if (this.isSearchMode) {
        this.handleSearchExistingWord();
      } else {
        this.handleGenerate();
      }
    });

    // Initially disable the generate button
    generateBtn.disabled = true;

    // Enter key on input
    wordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
        if (this.isGenerating || (generateBtn && generateBtn.disabled)) {
          return;
        }

        if (this.isSearchMode) {
          this.handleSearchExistingWord();
        } else {
          this.handleGenerate();
        }
      }
    });

    // More button and inline actions
    const moreBtn = document.getElementById('more-btn') as HTMLButtonElement;
    const inlineActions = document.getElementById('inline-actions') as HTMLElement;

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.uiUtils.toggleInlineActions();
    });

    // Add profile button
    const addProfileBtn = document.getElementById('add-profile-btn') as HTMLButtonElement;
    addProfileBtn.addEventListener('click', () => {
      this.showAddProfileModal();
    });

    // Export button
    const exportBtn = document.getElementById('export-profile-btn') as HTMLButtonElement;
    exportBtn.addEventListener('click', () => {
      this.handleExportProfile();
    });

    // Import button
    const importBtn = document.getElementById('import-profile-btn') as HTMLButtonElement;
    importBtn.addEventListener('click', () => {
      this.handleImportProfile();
    });

    // Import words button
    const importWordsBtn = document.getElementById('import-words-btn') as HTMLButtonElement;
    if (importWordsBtn) {
      importWordsBtn.addEventListener('click', () => {
        this.showImportWordsModal();
      });
    }

    // Import words modal buttons
    const selectFileBtn = document.getElementById('select-import-file') as HTMLButtonElement;
    const startImportBtn = document.getElementById('start-import-btn') as HTMLButtonElement;
    const cancelImportBtn = document.getElementById('cancel-import-btn') as HTMLButtonElement;
    const closeImportModalBtn = document.getElementById('close-import-modal') as HTMLButtonElement;

    if (selectFileBtn) {
      selectFileBtn.addEventListener('click', () => {
        this.selectImportFile();
      });
    }

    if (startImportBtn) {
      startImportBtn.addEventListener('click', () => {
        this.startWordImport();
      });
    }

    if (cancelImportBtn) {
      cancelImportBtn.addEventListener('click', () => {
        this.cancelWordImport();
      });
    }

    if (closeImportModalBtn) {
      closeImportModalBtn.addEventListener('click', () => {
        this.hideImportWordsModal();
      });
    }

    // Howto button
    const howtoBtn = document.getElementById('howto-btn') as HTMLButtonElement;
    howtoBtn.addEventListener('click', () => {
      this.showHowtoModal();
    });

    // Close howto modal
    const closeHowtoBtn = document.getElementById('close-howto-btn') as HTMLButtonElement;
    closeHowtoBtn.addEventListener('click', () => this.hideHowtoModal());

    // Add profile modal buttons
    const cancelAddProfileBtn = document.getElementById('cancel-add-profile') as HTMLButtonElement;
    const createProfileBtn = document.getElementById('create-profile') as HTMLButtonElement;

    cancelAddProfileBtn.addEventListener('click', () => this.hideAddProfileModal());
    createProfileBtn.addEventListener('click', () => this.handleCreateProfile());

    // Settings button
    const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
    settingsBtn.addEventListener('click', () => this.showSettingsModal());

    // Settings modal buttons
    const cancelSettingsBtn = document.getElementById('cancel-settings') as HTMLButtonElement;
    const saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;
    const deleteProfileBtn = document.getElementById('delete-profile-btn') as HTMLButtonElement;
    const toggleApiKeyBtn = document.getElementById('toggle-api-key-visibility') as HTMLButtonElement;

    cancelSettingsBtn.addEventListener('click', () => this.hideSettingsModal());
    saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    deleteProfileBtn.addEventListener('click', () => this.handleDeleteProfile());
    toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility());

    // Sort button
    const sortBtn = document.getElementById('sort-btn') as HTMLButtonElement;
    if (sortBtn) {
      sortBtn.addEventListener('click', () => this.handleSortToggle());
    }

    // Resize functionality
    const mainContent = document.getElementById('main-content') as HTMLElement;
    mainContent.addEventListener('mousedown', (e) => this.uiUtils.startResize(e));

    // Global mouse events for resizing
    document.addEventListener('mousemove', (e) => this.uiUtils.handleResize(e));
    document.addEventListener('mouseup', () => this.uiUtils.stopResize());
  }

  private async handleSearchInput(query: string): Promise<void> {
    try {
      const suggestions = await this.wordService.searchWords(query);
      this.wordRenderer.renderSuggestions(suggestions);

      const hasExactMatch = suggestions.some((word: WordListItem) =>
        word.word.toLowerCase() === query.toLowerCase()
      );
      this.updateGenerateBtnState(query, hasExactMatch);
    } catch (error) {
      console.error('Error searching words:', error);
    }
  }

  private async handleGenerate(): Promise<void> {
    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    const word = wordInput.value.trim();

    if (!word) {
      this.toastManager.showError('Please enter a word');
      return;
    }

    const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
    const generateIcon = document.getElementById('generate-icon') as unknown as SVGElement;
    const loadingIcon = document.getElementById('loading-icon') as unknown as SVGElement;

    const generationId = generateGenerationId();
    console.log('🔄 Renderer: Generated new generationId:', generationId);

    if (!generationId || typeof generationId !== 'string' || generationId.length === 0) {
      console.error('❌ Renderer: Invalid generationId generated:', generationId);
      this.toastManager.showError('Failed to generate request ID. Please try again.');
      return;
    }

    this.currentGenerationId = generationId;
    this.isGenerating = true;
    this.wordRenderer.setGenerationState(true); // Update WordRenderer generation state
    generateBtn.disabled = true;
    generateIcon.classList.add('hidden');
    loadingIcon.classList.remove('hidden');

    try {
      this.uiUtils.clearWordDetails();
      this.streamingContent = '';

      const tempWord: WordDocument = {
        id: 'temp',
        word,
        one_line_desc: '',
        details: '',
        tags: [],
        tag_colors: {},
        synonyms: [],
        antonyms: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.currentWord = tempWord;
      await this.wordRenderer.renderStreamingWordDetails(tempWord);

      const meaning = await this.wordService.generateWordMeaning(word);
      tempWord.details = meaning;
      this.currentWord = tempWord;

      tempWord.one_line_desc = 'Generating summary...';
      tempWord.tags = ['Analyzing word...'];
      tempWord.tag_colors = { 'Analyzing word...': '#6b7280' };
      await this.wordRenderer.renderWordDetails(tempWord);

      setTimeout(() => {
        const wordDetails = document.getElementById('word-details');
        if (wordDetails && wordDetails.parentElement) {
          wordDetails.parentElement.scrollTop = wordDetails.parentElement.scrollHeight;
        }
      }, 100);

      try {
        console.log('Starting generateWordMetas call...');
        const tagsResult = await this.wordService.generateWordMetas(word, meaning, generationId);
        console.log('generateWordMetas completed:', tagsResult);

        setTimeout(() => {
          if (this.currentGenerationId === generationId &&
            this.currentWord &&
            this.currentWord.tags.includes('Analyzing word...')) {
            console.log('Tool result timeout - forcing UI update');
            this.currentWord.one_line_desc = `Summary for: ${word}`;
            this.currentWord.tags = ['general'];
            this.currentWord.tag_colors = { 'general': '#6b7280' };
            this.wordRenderer.renderWordDetails(this.currentWord);
          }
        }, 10000);

      } catch (error) {
        console.error('Error in generateWordMetas:', error);
        this.toastManager.showError('Failed to generate tags and summary. Please check your API configuration.');
        if (this.currentGenerationId === generationId && this.currentWord) {
          this.currentWord.one_line_desc = 'Failed to generate summary';
          this.currentWord.tags = ['Failed to generate tags'];
          this.currentWord.tag_colors = { 'Failed to generate tags': '#ef4444' };
          this.wordRenderer.renderWordDetails(this.currentWord);
        }
      }

    } catch (error) {
      console.error('Error generating meaning:', error);
      this.toastManager.showError('Failed to generate meaning. Please check your API configuration.');
    } finally {
      this.isGenerating = false;
      this.wordRenderer.setGenerationState(false); // Update WordRenderer generation state
      generateBtn.disabled = false;
      generateIcon.classList.remove('hidden');
      loadingIcon.classList.add('hidden');
    }
  }

  private async handleAddWord(word: WordDocument): Promise<void> {
    if (!this.currentWord) {
      this.toastManager.showError('No word to add');
      return;
    }

    try {
      const wordData = {
        word: this.currentWord.word,
        one_line_desc: this.currentWord.one_line_desc,
        details: this.currentWord.details,
        tags: this.currentWord.tags,
        tag_colors: this.currentWord.tag_colors,
        synonyms: this.currentWord.synonyms || [],
        antonyms: this.currentWord.antonyms || []
      };

      const addedWord = await this.wordService.addWord(wordData);
      this.currentWord = addedWord;

      this.words.unshift({
        id: addedWord.id,
        word: addedWord.word,
        one_line_desc: addedWord.one_line_desc
      });

      this.wordsPagination.total++;
      this.wordRenderer.renderWordItemAtTop(addedWord);
      this.uiUtils.updateWordCount(this.wordsPagination.total);

      if (this.currentWord) {
        await this.wordRenderer.renderWordDetails(this.currentWord);
      }

      this.updateGenerateBtnState(addedWord.word, true);
      this.toastManager.showSuccess('Word added successfully');
    } catch (error) {
      console.error('Error adding word:', error);
      this.toastManager.showError('Failed to add word');
    }
  }

  private async handleRefreshWord(word: WordDocument): Promise<void> {
    if (!this.currentWord || this.currentWord.id === 'temp') {
      this.toastManager.showError('No word selected');
      return;
    }

    const originalWordId = this.currentWord.id;
    const originalCreatedAt = this.currentWord.created_at;

    try {
      const wordInput = document.getElementById('word-input') as HTMLInputElement;
      wordInput.value = this.currentWord.word;

      await this.handleGenerate();

      if (this.currentWord && this.currentWord.id === 'temp') {
        const updatedWordData = {
          word: this.currentWord.word,
          one_line_desc: this.currentWord.one_line_desc,
          details: this.currentWord.details,
          tags: this.currentWord.tags,
          tag_colors: this.currentWord.tag_colors,
          synonyms: this.currentWord.synonyms || [],
          antonyms: this.currentWord.antonyms || []
        };

        const updatedWord = await this.wordService.updateWord(originalWordId, updatedWordData);

        if (updatedWord) {
          updatedWord.id = originalWordId;
          updatedWord.created_at = originalCreatedAt;
          updatedWord.updated_at = new Date().toISOString();

          this.currentWord = updatedWord;

          const wordIndex = this.words.findIndex(word => word.id === originalWordId);
          if (wordIndex !== -1) {
            Object.assign(this.words[wordIndex], {
              id: updatedWord.id,
              word: updatedWord.word,
              one_line_desc: updatedWord.one_line_desc
            });
          }

          if (this.currentWord) {
            await this.wordRenderer.renderWordDetails(this.currentWord);
            this.uiUtils.updateWordInList(originalWordId, this.currentWord);
          }
        } else {
          this.toastManager.showError('Failed to update word');
        }

        this.toastManager.showSuccess('Word refreshed successfully');
      }
    } catch (error) {
      console.error('Error refreshing word:', error);
      this.toastManager.showError('Failed to refresh word');
    }
  }

  private async handleDeleteWord(word: WordDocument): Promise<void> {
    if (!this.currentWord || this.currentWord.id === 'temp') {
      this.toastManager.showError('No word to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${this.currentWord.word}"?`)) {
      return;
    }

    try {
      const success = await this.wordService.deleteWord(this.currentWord.id);
      if (success) {
        const deletedWordId = this.currentWord.id;

        this.words = this.words.filter(word => word.id !== deletedWordId);

        const wordItem = document.querySelector(`[data-word-id="${deletedWordId}"]`) as HTMLElement;
        if (wordItem) {
          wordItem.remove();
        }

        this.wordsPagination.total = Math.max(0, this.wordsPagination.total - 1);
        this.uiUtils.updateWordCount(this.wordsPagination.total);

        this.currentWord = null;
        this.uiUtils.clearWordDetails();
        this.updateLoadingIndicator();

        this.toastManager.showSuccess('Word deleted successfully');
      } else {
        this.toastManager.showError('Failed to delete word');
      }
    } catch (error) {
      console.error('Error deleting word:', error);
      this.toastManager.showError('Failed to delete word');
    }
  }

  private async loadAssociatedWords(tag: string): Promise<void> {
    if (this.associatedWordsState.scrollObserver) {
      this.associatedWordsState.scrollObserver.disconnect();
      this.associatedWordsState.scrollObserver = null;
    }

    this.associatedWordsState = {
      words: [],
      offset: 0,
      pageSize: ASSOCIATED_WORDS_PAGE_SIZE,
      isLoading: false,
      hasMore: true,
      total: 0,
      currentTag: tag,
      scrollObserver: null
    };

    const associatedList = document.getElementById('associated-list')!;
    associatedList.innerHTML = '';

    await this.loadMoreAssociatedWords();

    setTimeout(() => {
      this.setupAssociatedScrollObserver();

      if (this.associatedWordsState.hasMore) {
        this.showAssociatedLoadingIndicator();
      }
    }, 100);
  }

  private async loadMoreAssociatedWords(): Promise<void> {
    if (this.associatedWordsState.isLoading || !this.associatedWordsState.hasMore) {
      return;
    }

    this.associatedWordsState.isLoading = true;
    this.showAssociatedLoadingIndicator();

    try {
      const result = await window.electronAPI.getRelatedWordsPaginated(
        this.associatedWordsState.currentTag,
        this.associatedWordsState.offset,
        this.associatedWordsState.pageSize
      );

      const existingIds = new Set(this.associatedWordsState.words.map(word => word.id));
      const newWords = result.words.filter(word => !existingIds.has(word.id));

      this.associatedWordsState.words.push(...newWords);
      this.associatedWordsState.hasMore = result.hasMore;
      this.associatedWordsState.offset += this.associatedWordsState.pageSize;

      if (newWords.length > 0) {
        this.wordRenderer.renderAssociatedWordListIncremental(newWords);
      }

      this.uiUtils.updateAssociatedCount(result.total);
    } catch (error) {
      console.error('Error loading more associated words:', error);
      this.toastManager.showError('Failed to load more associated words');
    } finally {
      this.associatedWordsState.isLoading = false;
      this.updateAssociatedLoadingIndicator();
    }
  }

  private setupAssociatedScrollObserver(): void {
    let loadingIndicator = document.getElementById('associated-loading-indicator');
    if (!loadingIndicator) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'associated-loading-indicator';
      loadingIndicator.className = 'flex justify-center items-center py-4 text-slate-500';
      loadingIndicator.innerHTML = `
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-500"></div>
        <span class="ml-2 text-sm">Loading more words...</span>
      `;
      loadingIndicator.style.display = 'none';

      const associatedList = document.getElementById('associated-list')!;
      associatedList.appendChild(loadingIndicator);
    }

    let isTriggering = false;

    this.associatedWordsState.scrollObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry.isIntersecting && !isTriggering && this.associatedWordsState.hasMore && !this.associatedWordsState.isLoading) {
          isTriggering = true;
          this.loadMoreAssociatedWords().finally(() => {
            isTriggering = false;
          });
        }
      },
      {
        root: document.getElementById('associated-list'),
        rootMargin: '0px 0px 0px 0px',
        threshold: 0.1
      }
    );

    this.associatedWordsState.scrollObserver.observe(loadingIndicator);
  }

  private showAssociatedLoadingIndicator(): void {
    const loadingIndicator = document.getElementById('associated-loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'flex';
    }
  }

  private updateAssociatedLoadingIndicator(): void {
    const loadingIndicator = document.getElementById('associated-loading-indicator');
    if (!loadingIndicator) return;

    if (this.associatedWordsState.isLoading) {
      loadingIndicator.innerHTML = `
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-500"></div>
        <span class="ml-2 text-sm text-slate-500">Loading more words...</span>
      `;
    } else if (!this.associatedWordsState.hasMore) {
      loadingIndicator.innerHTML = `
        <div class="rounded-full h-6 w-6 border-2 border-slate-300 flex items-center justify-center">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <span class="ml-2 text-sm text-slate-400">No more words to load</span>
      `;
    } else {
      loadingIndicator.innerHTML = `
        <div class="rounded-full h-6 w-6 border-2 border-slate-400 flex items-center justify-center">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
          </svg>
        </div>
        <span class="ml-2 text-sm text-slate-400">Scroll for more words</span>
      `;
    }
  }

  private async selectWord(word: WordDocument | WordListItem): Promise<void> {
    if (this.isGenerating) {
      console.log('⚠️ selectWord: Generation in progress, ignoring word selection');
      return;
    }

    let fullWord: WordDocument;

    if ('details' in word && 'tags' in word && 'tag_colors' in word) {
      fullWord = word as WordDocument;
    } else {
      try {
        const fetchedWord = await this.wordService.getWord(word.id);
        if (!fetchedWord) {
          console.error('Failed to fetch full word details for:', word.id);
          this.toastManager.showError('Failed to load word details');
          return;
        }
        fullWord = fetchedWord;
      } catch (error) {
        console.error('Error fetching word details:', error);
        this.toastManager.showError('Failed to load word details');
        return;
      }
    }

    this.currentWord = fullWord;
    await this.wordRenderer.renderWordDetails(fullWord);

    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    wordInput.value = fullWord.word;

    this.uiUtils.clearSuggestions();
    this.updateGenerateBtnState(fullWord.word, true);
  }

  private resetUIForProfileSwitch(): void {
    this.currentWord = null;
    this.uiUtils.clearWordDetails();

    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    if (wordInput) {
      wordInput.value = '';
    }

    this.uiUtils.clearSuggestions();

    this.isGenerating = false;
    this.wordRenderer.setGenerationState(false); // Reset WordRenderer generation state
    this.currentGenerationId = '';
    this.streamingContent = '';

    const wordList = document.getElementById('word-list')!;
    if (wordList) {
      wordList.innerHTML = '';
    }

    const associatedList = document.getElementById('associated-list')!;
    if (associatedList) {
      associatedList.innerHTML = '';
    }

    this.words = [];
    this.wordsPagination = {
      offset: 0,
      pageSize: WORDS_PAGE_SIZE,
      isLoading: false,
      hasMore: true,
      total: 0
    };

    this.associatedWordsState = {
      words: [],
      offset: 0,
      pageSize: ASSOCIATED_WORDS_PAGE_SIZE,
      isLoading: false,
      hasMore: true,
      total: 0,
      currentTag: '',
      scrollObserver: null
    };

    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
    if (this.associatedWordsState.scrollObserver) {
      this.associatedWordsState.scrollObserver.disconnect();
      this.associatedWordsState.scrollObserver = null;
    }

    this.updateGenerateBtnState('', false);
    this.isSearchMode = false;

    this.uiUtils.updateWordCount(0);
    this.uiUtils.updateAssociatedCount(0);

    // Reload panel widths for the new profile
    this.uiUtils.loadPanelWidths();
  }

  private handleWordMeaningStreaming(content: string): void {
    this.streamingContent += content;
    if (this.currentWord && this.currentWord.id === 'temp') {
      const streamingWord = { ...this.currentWord, details: this.streamingContent };
      this.wordRenderer.renderStreamingWordDetails(streamingWord);

      const wordDetails = document.getElementById('word-details');
      if (wordDetails && wordDetails.parentElement) {
        wordDetails.parentElement.scrollTop = wordDetails.parentElement.scrollHeight;
      }
    }
  }

  private handleWordMetadataReady(wordMeta: any): void {
    // Simple check: if we have metadata and a current word, update it
    if (!wordMeta || !this.currentWord || this.currentWord.id !== 'temp') {
      return;
    }

    // Update word metadata
    if (wordMeta.summary) {
      this.currentWord.one_line_desc = wordMeta.summary;
    }
    if (wordMeta.tags) {
      this.currentWord.tags = wordMeta.tags;
    }
    if (wordMeta.tag_colors) {
      this.currentWord.tag_colors = wordMeta.tag_colors;
    }
    if (wordMeta.synonyms) {
      this.currentWord.synonyms = wordMeta.synonyms;
    }
    if (wordMeta.antonyms) {
      this.currentWord.antonyms = wordMeta.antonyms;
    }

    // Re-render word details
    this.wordRenderer.renderWordDetails(this.currentWord);
  }

  private updateGenerateBtnState(query: string, hasExactMatch?: boolean): void {
    const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
    const generateIcon = document.getElementById('generate-icon') as unknown as SVGElement;

    if (!generateBtn || !generateIcon) return;

    generateBtn.disabled = query.length === 0;

    if (hasExactMatch !== undefined) {
      this.isSearchMode = hasExactMatch;

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
    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    const query = wordInput.value.trim().toLowerCase();

    if (!query) {
      this.toastManager.showError('Please enter a word');
      return;
    }

    try {
      const suggestions = await this.wordService.searchWords(query);
      const exactMatch = suggestions.find(word =>
        word.word.toLowerCase() === query
      );

      if (exactMatch) {
        this.selectWord(exactMatch);
        this.uiUtils.clearSuggestions();
      } else {
        this.toastManager.showError('Word not found. Try generating it instead.');
      }
    } catch (error) {
      console.error('Error searching for existing word:', error);
      this.toastManager.showError('Failed to find existing word');
    }
  }

  // Profile modal methods
  private showAddProfileModal(): void {
    const input = document.getElementById('new-profile-name') as HTMLInputElement;
    if (input) {
      input.value = '';
    }

    const modal = document.getElementById('add-profile-modal')!;
    modal.classList.remove('hidden');

    setTimeout(() => {
      if (input) {
        input.focus();
      }
    }, 100);
  }

  private hideAddProfileModal(): void {
    const modal = document.getElementById('add-profile-modal')!;
    modal.classList.add('hidden');
  }

  private async handleCreateProfile(): Promise<void> {
    const input = document.getElementById('new-profile-name') as HTMLInputElement;
    const profileName = input ? input.value.trim() : '';

    if (!profileName) {
      this.toastManager.showError('Profile name cannot be empty');
      return;
    }

    if (this.profileService.getProfiles().includes(profileName)) {
      this.toastManager.showError('A profile with this name already exists');
      return;
    }

    try {
      const success = await this.profileService.createProfile(profileName);
      if (success) {
        this.resetUIForProfileSwitch();
        this.toastManager.showSuccess(`Profile "${profileName}" created successfully`);
      } else {
        this.toastManager.showError('Failed to create profile');
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      this.toastManager.showError('Failed to create profile');
    }

    this.hideAddProfileModal();
  }

  private async handleDeleteProfile(): Promise<void> {
    if (this.profileService.getProfiles().length <= 1) {
      this.toastManager.showError('Cannot delete the last remaining profile');
      return;
    }

    const confirmed = confirm(`Are you sure you want to delete the profile "${this.profileService.getCurrentProfile()}"? This action cannot be undone and will delete all words in this profile.`);
    if (!confirmed) {
      return;
    }

    try {
      const success = await this.profileService.deleteProfile(this.profileService.getCurrentProfile());
      if (success) {
        this.resetUIForProfileSwitch();
        await this.loadWords();
        this.toastManager.showSuccess(`Profile "${this.profileService.getCurrentProfile()}" deleted successfully.`);
      } else {
        this.toastManager.showError('Failed to delete profile');
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      this.toastManager.showError('Failed to delete profile');
    }

    this.hideSettingsModal();
  }

  private async handleExportProfile(): Promise<void> {
    try {
      const result = await this.profileService.exportProfile();
      if (result.success) {
        this.toastManager.showSuccess(result.message);
      } else {
        this.toastManager.showError(result.message);
      }
    } catch (error) {
      console.error('Error exporting profile:', error);
      this.toastManager.showError('Failed to export profile');
    }
  }

  private async handleImportProfile(): Promise<void> {
    try {
      const result = await this.profileService.importProfile();
      if (result.success) {
        this.toastManager.showSuccess(result.message);

        if (result.profileName) {
          // Refresh the profile list to include the new profile
          await this.profileService.loadProfiles();

          this.profileService.setCurrentProfile(result.profileName);
          const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
          profileSelect.value = result.profileName;

          this.resetUIForProfileSwitch();
          await this.loadWords();
        }
      } else {
        this.toastManager.showError(result.message);
      }
    } catch (error) {
      console.error('Error importing profile:', error);
      this.toastManager.showError('Failed to import profile');
    }
  }

  // Settings modal methods
  private async showSettingsModal(): Promise<void> {
    try {
      const profileConfig = await this.profileService.getProfileConfig();
      if (profileConfig) {
        const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
        if (profileNameInput) {
          profileNameInput.value = this.profileService.getCurrentProfile() || '';
        }
        (document.getElementById('system-prompt') as HTMLTextAreaElement).value = profileConfig.system_prompt || '';
        (document.getElementById('model-provider') as HTMLSelectElement).value = profileConfig.model_config.provider || 'openai';
        (document.getElementById('model-name') as HTMLInputElement).value = profileConfig.model_config.model || '';
        (document.getElementById('api-endpoint') as HTMLInputElement).value = profileConfig.model_config.endpoint || '';
        (document.getElementById('api-key') as HTMLInputElement).value = profileConfig.model_config.api_key || '';
      }
    } catch (error) {
      console.error('Error loading profile config:', error);
      this.toastManager.showError('Failed to load profile settings');
    }

    const modal = document.getElementById('settings-modal')!;
    modal.classList.remove('hidden');
  }

  private hideSettingsModal(): void {
    const modal = document.getElementById('settings-modal')!;
    modal.classList.add('hidden');
  }

  private async saveSettings(): Promise<void> {
    const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
    const profileName = profileNameInput ? profileNameInput.value.trim() : '';
    const systemPrompt = (document.getElementById('system-prompt') as HTMLTextAreaElement).value;
    const modelProvider = (document.getElementById('model-provider') as HTMLSelectElement).value;
    const modelName = (document.getElementById('model-name') as HTMLInputElement).value;
    const apiEndpoint = (document.getElementById('api-endpoint') as HTMLInputElement).value;
    const apiKey = (document.getElementById('api-key') as HTMLInputElement).value;

    if (!profileName) {
      this.toastManager.showError('Profile name cannot be empty');
      return;
    }

    const config = {
      system_prompt: systemPrompt,
      model_config: {
        provider: modelProvider,
        model: modelName,
        endpoint: apiEndpoint,
        api_key: apiKey
      }
    };

    try {
      const success = await this.profileService.updateProfileConfig(config);
      if (success) {
        if (profileName !== this.profileService.getCurrentProfile()) {
          const success = await this.profileService.renameProfile(this.profileService.getCurrentProfile(), profileName);
          if (success) {
            await this.profileService.loadProfiles();
            this.profileService.setCurrentProfile(profileName);
            const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
            profileSelect.value = profileName;
          } else {
            this.toastManager.showError('Failed to rename profile');
            return;
          }
        }

        this.toastManager.showSuccess('Settings saved successfully');
        this.hideSettingsModal();
      } else {
        this.toastManager.showError('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      this.toastManager.showError('Failed to save settings');
    }
  }

  // Howto modal methods
  private async showHowtoModal(): Promise<void> {
    try {
      // Load markdown content from assets/howto.md
      const response = await fetch('../../assets/howto.md');
      if (!response.ok) {
        throw new Error(`Failed to load howto.md: ${response.status}`);
      }

      const markdown = await response.text();

      // Convert markdown to HTML using the existing IPC method
      const htmlContent = await window.electronAPI.processMarkdown(markdown);

      // Insert into modal
      const contentDiv = document.getElementById('howto-content')!;
      contentDiv.innerHTML = htmlContent;

      // Show modal
      const modal = document.getElementById('howto-modal')!;
      modal.classList.remove('hidden');
    } catch (error) {
      console.error('Error loading howto content:', error);
      this.toastManager.showError('Failed to load help content');
    }
  }

  private hideHowtoModal(): void {
    const modal = document.getElementById('howto-modal')!;
    modal.classList.add('hidden');
  }

  private async handleWriteRemark(word: WordDocument): Promise<void> {
    if (!word || word.id === 'temp') {
      this.toastManager.showError('Cannot add remark to temporary word');
      return;
    }

    // Find the word details container
    const wordDetails = document.getElementById('word-details');
    if (!wordDetails) {
      this.toastManager.showError('Word details not found');
      return;
    }

    let remarkContainer: HTMLElement;
    let remarkDisplay: HTMLElement | null = document.querySelector('.remark-display') as HTMLElement;

    if (remarkDisplay) {
      // Existing remark - replace the display
      remarkContainer = remarkDisplay.parentElement!;
    } else {
      // No existing remark - create the remark section
      remarkContainer = document.createElement('div');
      remarkContainer.innerHTML = `
        <h4 class="text-lg font-semibold text-slate-800 mb-3 flex items-center">
          <svg class="w-4 h-4 mr-2 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
          Remark
        </h4>
      `;

      // Find the action buttons container and its parent (the content container)
      const actionButtonsContainer = document.getElementById('action-buttons-container');
      if (actionButtonsContainer) {
        const contentContainer = actionButtonsContainer.parentNode as HTMLElement;
        if (contentContainer) {
          // Insert the remark section right before the action buttons
          contentContainer.insertBefore(remarkContainer, actionButtonsContainer);
        } else {
          // Fallback: append to word details
          wordDetails.appendChild(remarkContainer);
        }
      } else {
        // Fallback: append to word details
        wordDetails.appendChild(remarkContainer);
      }
    }

    // Create input field
    const input = document.createElement('input');
    const originalRemark = word.remark || '';
    input.type = 'text';
    input.value = originalRemark;
    input.className = 'w-full px-3 py-2 focus:outline-none focus:ring-0 text-slate-700';
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.boxShadow = 'none';
    input.style.borderRadius = '0';
    input.style.padding = '0.5rem 0.75rem';
    input.style.color = '#334155';
    input.placeholder = 'Enter your remark...';

    if (remarkDisplay) {
      // Replace existing display
      remarkContainer.replaceChild(input, remarkDisplay);
    } else {
      // Add to new container
      remarkContainer.appendChild(input);
    }

    // Focus and select all text
    input.focus();
    input.select();

    let saved = false;
    let cancelled = false;

    const saveRemark = async () => {
      if (saved) return;
      saved = true;

      const remarkValue = input.value.trim();

      // Check if the remark has actually changed
      if (remarkValue === originalRemark) {
        // No change, just restore the display without saving
        if (remarkDisplay) {
          remarkContainer.replaceChild(remarkDisplay, input);
        } else {
          // If there was no original display, remove the input and the remark section
          remarkContainer.remove();
        }
        return;
      }

      try {
        // Update word in database
        const updatedWord = await this.wordService.updateWord(word.id, { remark: remarkValue });

        if (updatedWord) {
          // Update current word
          this.currentWord = { ...this.currentWord!, remark: remarkValue };

          // Update word in list if it exists
          const wordIndex = this.words.findIndex(w => w.id === word.id);
          if (wordIndex !== -1) {
            this.words[wordIndex] = {
              ...this.words[wordIndex],
              remark: remarkValue
            };
          }

          // Update the DOM element for this word in the word list
          const wordItem = document.querySelector(`[data-word-id="${word.id}"]`) as HTMLElement;
          if (wordItem) {
            // Find the existing remark display
            const existingRemark = wordItem.querySelector('.text-orange-600');
            if (existingRemark) {
              if (remarkValue && remarkValue.trim()) {
                // Update existing remark
                const remarkText = existingRemark.querySelector('.truncate') as HTMLElement;
                if (remarkText) {
                  remarkText.textContent = remarkValue;
                }
              } else {
                // Remove remark if it's empty
                existingRemark.remove();
              }
            } else if (remarkValue && remarkValue.trim()) {
              // Add new remark if it didn't exist before
              const remarkHtml = `
                <div class="text-xs text-orange-600 mt-1 italic flex items-center pr-1">
                  <svg class="w-3 h-3 mr-1 flex-shrink-0 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828z"/>
                  </svg>
                  <span class="truncate pr-0.5">${remarkValue}</span>
                </div>
              `;

              // Find the description element and add remark after it
              const description = wordItem.querySelector('.text-slate-500');
              if (description && description.parentNode) {
                const remarkDiv = document.createElement('div');
                remarkDiv.innerHTML = remarkHtml;
                description.parentNode.insertBefore(remarkDiv.firstElementChild!, description.nextSibling);
              }
            }
          }

          // Also update in associated words list if it exists there
          const associatedWordItem = document.querySelector(`#associated-list [data-word-id="${word.id}"]`) as HTMLElement;
          if (associatedWordItem) {
            const existingRemark = associatedWordItem.querySelector('.text-orange-600');
            if (existingRemark) {
              if (remarkValue && remarkValue.trim()) {
                // Update existing remark
                const remarkText = existingRemark.querySelector('.truncate') as HTMLElement;
                if (remarkText) {
                  remarkText.textContent = remarkValue;
                }
              } else {
                // Remove remark if it's empty
                existingRemark.remove();
              }
            } else if (remarkValue && remarkValue.trim()) {
              // Add new remark if it didn't exist before
              const remarkHtml = `
                <div class="text-xs text-orange-600 mt-1 italic flex items-center pr-1">
                  <svg class="w-3 h-3 mr-1 flex-shrink-0 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828z"/>
                  </svg>
                  <span class="truncate pr-0.5">${remarkValue}</span>
                </div>
              `;

              // Find the description element and add remark after it
              const description = associatedWordItem.querySelector('.text-slate-500');
              if (description && description.parentNode) {
                const remarkDiv = document.createElement('div');
                remarkDiv.innerHTML = remarkHtml;
                description.parentNode.insertBefore(remarkDiv.firstElementChild!, description.nextSibling);
              }
            }
          }

          // Re-render word details to show updated remark
          await this.wordRenderer.renderWordDetails(this.currentWord);

          if (remarkValue) {
            this.toastManager.showSuccess('Remark saved successfully');
          } else {
            this.toastManager.showSuccess('Remark removed');
          }
        } else {
          this.toastManager.showError('Failed to save remark');
          // Restore original display
          await this.wordRenderer.renderWordDetails(word);
        }
      } catch (error) {
        console.error('Error saving remark:', error);
        this.toastManager.showError('Failed to save remark');
        // Restore original display
        await this.wordRenderer.renderWordDetails(word);
      }
    };

    const cancelEdit = () => {
      if (saved) return;
      // Restore original display
      if (remarkDisplay) {
        remarkContainer.replaceChild(remarkDisplay, input);
      } else {
        // If there was no original display, remove the input and the remark section
        remarkContainer.remove();
      }
    };

    // Handle key events
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await saveRemark();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelled = true;
        cancelEdit();
      }
    });

    // Handle blur (clicking outside)
    input.addEventListener('blur', async () => {
      // Small delay to allow for button clicks
      setTimeout(async () => {
        if (!saved && !cancelled) {
          await saveRemark();
        }
      }, 150);
    });
  }

  // Word Import methods
  private selectedImportFile: File | null = null;

  private showImportWordsModal(): void {
    const modal = document.getElementById('import-words-modal')!;
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  private hideImportWordsModal(): void {
    const modal = document.getElementById('import-words-modal')!;
    if (modal) {
      modal.classList.add('hidden');
    }
    this.selectedImportFile = null;
    this.updateImportUI();
  }

  private selectImportFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.csv';
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        this.selectedImportFile = file;
        this.updateImportUI();
      }
    };
    input.click();
  }

  private updateImportUI(): void {
    const fileNameElement = document.getElementById('import-file-name') as HTMLElement;
    const startBtn = document.getElementById('start-import-btn') as HTMLButtonElement;

    if (fileNameElement && startBtn) {
      if (this.selectedImportFile) {
        fileNameElement.textContent = this.selectedImportFile.name;
        startBtn.disabled = false;
      } else {
        fileNameElement.textContent = 'No file selected';
        startBtn.disabled = true;
      }
    }
  }

  private async startWordImport(): Promise<void> {
    if (!this.selectedImportFile || this.isImporting) {
      return;
    }

    try {
      const content = await this.readFileContent(this.selectedImportFile);
      this.showImportProgressOverlay();

      const callbacks: ImportCallbacks = {
        onProgress: (progress: ImportProgress) => {
          this.updateImportProgress(progress);
        },
        onComplete: (progress: ImportProgress) => {
          this.handleImportComplete(progress);
        },
        onError: (progress: ImportProgress) => {
          this.handleImportError(progress);
        },
        onCancel: (progress?: ImportProgress) => {
          this.handleImportCancel(progress);
        },
      };

      this.isImporting = true;
      await this.wordImportService.startImport(content, callbacks);
    } catch (error) {
      console.error('Error starting import:', error);
      this.toastManager.showError('Failed to start import');
    }
  }

  private cancelWordImport(): void {
    if (!this.isImporting) return;

    this.wordImportService.cancelImport();
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  private showImportProgressOverlay(): void {
    const overlay = document.getElementById('import-progress-overlay')!;
    if (overlay) {
      overlay.classList.remove('hidden');
    }
  }

  private hideImportProgressOverlay(): void {
    const overlay = document.getElementById('import-progress-overlay')!;
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  private updateImportProgress(progress: ImportProgress): void {
    const progressText = document.getElementById('import-progress-text')!;
    const progressBar = document.getElementById('import-progress-bar') as HTMLDivElement;

    if (progressText) {
      progressText.textContent = `${progress.current}/${progress.total} - ${progress.currentWord || 'Processing...'}`;
    }

    if (progressBar) {
      const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
      progressBar.style.width = `${percentage}%`;
    }
  }

  private handleImportComplete(progress: ImportProgress): void {
    this.isImporting = false;
    this.hideImportProgressOverlay();

    // Show completion modal
    const modal = document.getElementById('import-complete-modal')!;
    const messageElement = document.getElementById('import-complete-message')!;
    const okBtn = document.getElementById('import-complete-ok') as HTMLButtonElement;

    if (messageElement) {
      const successCount = progress.total - progress.errors.length - progress.skipped;
      let html = `<span>Import completed!</span><br><span>${successCount}/${progress.total} words imported successfully.</span>`;

      if (progress.skipped > 0) {
        html += `<br><span>${progress.skipped} words were skipped (already exist).</span>`;
      }

      if (progress.errors.length > 0) {
        html += `<br><span>${progress.errors.length} words had errors.</span>`;
      }

      messageElement.innerHTML = html;
    }

    if (modal) {
      modal.classList.remove('hidden');
    }

    // Refresh word list
    this.loadWords();

    if (okBtn) {
      okBtn.onclick = () => {
        if (modal) {
          modal.classList.add('hidden');
        }
      };
    }
  }

  private handleImportError(progress: ImportProgress): void {
    this.isImporting = false;
    this.hideImportProgressOverlay();

    // If we have progress info and at least one word was successfully imported, reload the word list
    if (progress && progress.success > 0) {
      console.log(`Import failed but ${progress.success} words were successfully imported. Reloading word list...`);
      this.loadWords();
    }

    const error = progress?.errors?.[0];
    this.toastManager.showError(`Import failed: ${error}`);
  }

  private handleImportCancel(progress?: ImportProgress): void {
    this.isImporting = false;
    this.hideImportProgressOverlay();

    // If we have progress info and at least one word was successfully imported, reload the word list
    if (progress && progress.success > 0) {
      console.log(`Import cancelled but ${progress.success} words were successfully imported. Reloading word list...`);
      this.loadWords();
    }

    this.toastManager.showWarning('Import cancelled');
  }

  private toggleApiKeyVisibility(): void {
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const eyeIcon = document.getElementById('eye-icon') as HTMLElement;
    const eyeOffIcon = document.getElementById('eye-off-icon') as HTMLElement;

    if (apiKeyInput && eyeIcon && eyeOffIcon) {
      if (apiKeyInput.type === 'password') {
        // Show password
        apiKeyInput.type = 'text';
        eyeIcon.classList.add('hidden');
        eyeOffIcon.classList.remove('hidden');
      } else {
        // Hide password
        apiKeyInput.type = 'password';
        eyeIcon.classList.remove('hidden');
        eyeOffIcon.classList.add('hidden');
      }
    }
  }

  private async handleSortToggle(): Promise<void> {
    // Toggle sort order
    this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';

    // Save to StoreManager
    await this.saveSortOrder();

    // Update sort button icon
    this.updateSortButtonIcon();

    // Reload words with new sort order
    await this.loadWords();
  }

  private async saveSortOrder(): Promise<void> {
    try {
      // Save to electron-store via IPC
      await window.electronAPI.saveSortOrder(this.sortOrder);
    } catch (error) {
      console.error('Error saving sort order:', error);
    }
  }

  private async loadSortOrder(): Promise<void> {
    try {
      // Load from electron-store via IPC
      const savedSortOrder = await window.electronAPI.loadSortOrder();
      if (savedSortOrder) {
        this.sortOrder = savedSortOrder;
      }
    } catch (error) {
      console.error('Error loading sort order:', error);
      // Keep default 'desc'
    }
  }

  private updateSortButtonIcon(): void {
    const sortBtn = document.getElementById('sort-btn') as HTMLButtonElement;
    if (!sortBtn) return;

    const iconContainer = sortBtn.querySelector('.sort-icon');
    if (!iconContainer) return;

    if (this.sortOrder === 'desc') {
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

  // Protocol handlers
  private async handleProtocolNavigateWord(wordName: string): Promise<void> {
    try {
      console.log('Handling protocol navigation to word:', wordName);

      // Try to find the word by name
      const word = await this.wordService.getWordByName(wordName);
      if (word) {
        // Word found, select it
        this.selectWord(word);
        this.toastManager.showSuccess(`Navigated to word: ${wordName}`);
      } else {
        // Word not found, set the input field and show a message
        const wordInput = document.getElementById('word-input') as HTMLInputElement;
        if (wordInput) {
          wordInput.value = wordName;
          this.updateGenerateBtnState(wordName);
        }
        this.toastManager.showInfo(`Word "${wordName}" not found. You can generate it now.`);
      }
    } catch (error) {
      console.error('Error handling protocol navigation:', error);
      this.toastManager.showError('Failed to navigate to word');
    }
  }

  private async handleProtocolSwitchProfile(profileName: string): Promise<void> {
    try {
      console.log('Handling protocol profile switch to:', profileName);

      // Check if the profile exists
      const profiles = await this.profileService.getProfiles();
      if (profiles.includes(profileName)) {
        // Show loading overlay
        this.showLoadingOverlay();

        try {
          const success = await this.profileService.switchProfile(profileName);
          if (success) {
            // Successful switch - load words normally
            this.resetUIForProfileSwitch();
            await this.loadWords();
            this.toastManager.showSuccess(`Switched to profile: ${profileName}`);
          } else {
            this.toastManager.showError(`Failed to switch to profile: ${profileName}`);
          }
        } catch (error) {
          console.error('Error switching profile:', error);
          this.toastManager.showError(`Failed to switch to profile: ${profileName}`);
        } finally {
          setTimeout(() => {
            this.hideLoadingOverlay();
          }, 500);
        }
      } else {
        this.toastManager.showError(`Profile "${profileName}" not found`);
      }
    } catch (error) {
      console.error('Error handling protocol profile switch:', error);
      this.toastManager.showError('Failed to switch profile');
    }
  }
}
