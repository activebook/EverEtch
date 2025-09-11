import { WordDocument, WordListItem, PaginationState, AssociatedWordsState } from './types.js';
import { ProfileService } from './services/ProfileService.js';
import { WordService } from './services/WordService.js';
import { ToastManager } from './components/ToastManager.js';
import { WordRenderer } from './components/WordRenderer.js';
import { UIUtils } from './utils/UIUtils.js';

export class EverEtchApp {
  private profileService: ProfileService;
  private wordService: WordService;
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
    pageSize: 5,
    isLoading: false,
    hasMore: true,
    total: 0
  };
  private associatedWordsState: AssociatedWordsState = {
    words: [],
    offset: 0,
    pageSize: 5,
    isLoading: false,
    hasMore: true,
    total: 0,
    currentTag: '',
    scrollObserver: null
  };
  private isSearchMode: boolean = false;
  private isGenerating: boolean = false;
  private scrollObserver: IntersectionObserver | null = null;

  constructor() {
    this.profileService = new ProfileService();
    this.wordService = new WordService();
    this.toastManager = new ToastManager();
    this.uiUtils = new UIUtils();

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
    this.wordRenderer.onWordSelect = (word: WordDocument | WordListItem) => this.selectWord(word);
  }

  private async initializeApp(): Promise<void> {
    try {
      // Load profiles first
      console.log('Loading profiles...');
      await this.profileService.loadProfiles();
      console.log('Loaded profiles:', this.profileService.getProfiles());

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
            // Load words for the switched profile
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
        pageSize: 5,
        isLoading: false,
        hasMore: true,
        total: 0
      };

      // Clean up existing observer
      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
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
        this.wordsPagination.pageSize
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
            this.resetUIForProfileSwitch();
            await this.loadWords();
          } else {
            this.toastManager.showError('Failed to switch profile');
          }
        } catch (error) {
          console.error('Error switching profile:', error);
          this.toastManager.showError('Failed to switch profile');
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

    cancelSettingsBtn.addEventListener('click', () => this.hideSettingsModal());
    saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    deleteProfileBtn.addEventListener('click', () => this.handleDeleteProfile());

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

    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      pageSize: 5,
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
      pageSize: 5,
      isLoading: false,
      hasMore: true,
      total: 0
    };

    this.associatedWordsState = {
      words: [],
      offset: 0,
      pageSize: 5,
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
    console.log('📨 Renderer: Received tool result event:', wordMeta);
    console.log('📨 Renderer: Current generation ID:', this.currentGenerationId);
    console.log('📨 Renderer: Tool data generation ID:', wordMeta?.generationId);

    if (!wordMeta) {
      console.error('❌ Renderer: Received null/undefined wordMeta');
      return;
    }

    if (!wordMeta.generationId || typeof wordMeta.generationId !== 'string') {
      console.error('❌ Renderer: Invalid generationId in wordMeta:', wordMeta.generationId);
      return;
    }

    if (!this.currentWord) {
      console.error('❌ Renderer: No current word to update');
      return;
    }

    if (wordMeta.generationId === this.currentGenerationId) {
      console.log('✅ Renderer: Processing tool result for current generation');

      if (this.currentWord.id === 'temp') {
        console.log('✅ Renderer: Current word is temp, proceeding with update');

        if (wordMeta.summary) {
          console.log('📝 Renderer: Updating summary:', wordMeta.summary);
          this.currentWord.one_line_desc = wordMeta.summary;
        }
        if (wordMeta.tags) {
          console.log('🏷️ Renderer: Updating tags:', wordMeta.tags);
          this.currentWord.tags = wordMeta.tags;
        }
        if (wordMeta.tag_colors) {
          console.log('🎨 Renderer: Updating tag colors:', wordMeta.tag_colors);
          this.currentWord.tag_colors = wordMeta.tag_colors;
        }
        if (wordMeta.synonyms) {
          console.log('🔄 Renderer: Updating synonyms:', wordMeta.synonyms);
          this.currentWord.synonyms = wordMeta.synonyms;
        }
        if (wordMeta.antonyms) {
          console.log('🔄 Renderer: Updating antonyms:', wordMeta.antonyms);
          this.currentWord.antonyms = wordMeta.antonyms;
        }

        console.log('🔄 Renderer: Re-rendering word details');
        if (this.currentWord) {
          this.wordRenderer.renderWordDetails(this.currentWord);
        }
      } else {
        console.log('⚠️ Renderer: Current word is not temp, skipping tool result update');
      }
    } else {
      console.log('❌ Renderer: Ignoring tool result - generation ID mismatch');
      console.log('❌ Renderer: Expected:', this.currentGenerationId, 'Got:', wordMeta.generationId);
      console.log('❌ Renderer: Current word ID:', this.currentWord?.id);
    }
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
}
