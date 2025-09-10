// Type definitions for Electron API
declare global {
  interface Window {
    electronAPI: {
      getProfiles: () => Promise<string[]>;
      getCurrentProfileName: () => Promise<string | null>;
      switchProfile: (profileName: string) => Promise<boolean>;
  createProfile: (profileName: string) => Promise<boolean>;
  renameProfile: (oldName: string, newName: string) => Promise<boolean>;
  deleteProfile: (profileName: string) => Promise<boolean>;
      getWords: () => Promise<any[]>;
      getWordsPaginated: (offset: number, limit: number) => Promise<{ words: any[], hasMore: boolean, total: number }>;
      searchWords: (query: string) => Promise<any[]>;
      getWord: (wordId: string) => Promise<any>;
      addWord: (wordData: any) => Promise<any>;
      updateWord: (wordId: string, wordData: any) => Promise<any>;
      deleteWord: (wordId: string) => Promise<boolean>;
      generateMeaningOnly: (word: string) => Promise<string>;
      generateTagsAndSummary: (word: string, meaning: string, generationId: string) => Promise<any>;
      generateMeaning: (word: string) => Promise<string>;
      getAssociatedWords: (tag: string) => Promise<any[]>;
      getAssociatedWordsPaginated: (tag: string, offset: number, limit: number) => Promise<{ words: any[], hasMore: boolean, total: number }>;
      getProfileConfig: () => Promise<any>;
      updateProfileConfig: (config: any) => Promise<boolean>;
      processMarkdown: (markdown: string) => Promise<string>;

      // Profile import/export
      exportProfile: () => Promise<any>;
      importProfile: () => Promise<any>;

      onStreamingContent: (callback: Function) => void;
      onToolResult: (callback: Function) => void;
      removeAllListeners: (event: string) => void;
    };
  }
}

export { }; // This makes the file a module

interface WordDocument {
  id: string;
  word: string;
  one_line_desc: string;
  details: string;
  tags: string[];
  tag_colors: Record<string, string>;
  created_at: string;
  updated_at: string;
}

class EverEtchApp {
  private currentWord: WordDocument | null = null;
  private currentGenerationId: string = '';
  private profiles: string[] = [];
  private currentProfile: string = '';
  private streamingContent: string = '';
  private isResizing: boolean = false;
  private resizeHandle: HTMLElement | null = null;
  private startX: number = 0;
  private startLeftWidth: number = 0;
  private startMiddleWidth: number = 0;
  private startRightWidth: number = 0;

  // Lazy loading state
  private words: WordDocument[] = [];
  private currentOffset: number = 0;
  private pageSize: number = 5;
  private isLoading: boolean = false;
  private hasMoreWords: boolean = true;
  private totalWords: number = 0;
  private scrollObserver: IntersectionObserver | null = null;

  // Associated words lazy loading state
  private associatedWords: WordDocument[] = [];
  private associatedCurrentOffset: number = 0;
  private associatedPageSize: number = 5;
  private associatedIsLoading: boolean = false;
  private associatedHasMore: boolean = true;
  private associatedScrollObserver: IntersectionObserver | null = null;
  private currentTag: string = '';
  private isSearchMode: boolean = false;
  private isGenerating: boolean = false;

  constructor() {
    this.initializeApp();
  }

  private async initializeApp() {
    try {
      // Load profiles
      console.log('Loading profiles...');
      await this.loadProfiles();
      console.log('Loaded profiles:', this.profiles);

      // Load words for current profile
      await this.loadWords();

      // Set up event listeners
      this.setupEventListeners();

    } catch (error) {
      console.error('Error initializing app:', error);
      this.showError('Failed to initialize application');
    }
  }

  private async loadProfiles() {
    try {
      this.profiles = await window.electronAPI.getProfiles();
      const currentProfileName = await window.electronAPI.getCurrentProfileName();
      const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;

      profileSelect.innerHTML = '';
      this.profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile;
        option.textContent = profile;
        profileSelect.appendChild(option);
      });

      // Set current profile to the actual current profile from backend
      if (currentProfileName && this.profiles.includes(currentProfileName)) {
        this.currentProfile = currentProfileName;
        profileSelect.value = this.currentProfile;
      } else if (this.profiles.length > 0) {
        // Fallback to first profile if current profile is not found
        this.currentProfile = this.profiles[0];
        profileSelect.value = this.currentProfile;
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  }

  private async loadWords() {
    try {
      // Reset pagination state
      this.words = [];
      this.currentOffset = 0;
      this.hasMoreWords = true;
      this.isLoading = false;

      // Clean up existing observer
      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
      }

      // Load first page first, then setup observer after content is rendered
      await this.loadMoreWords();

      // Setup scroll observer after content is rendered to ensure proper detection
      // Use setTimeout to ensure DOM updates are complete
      setTimeout(() => {
        this.setupScrollObserver();

        // Force show the loading indicator if there are more words
        if (this.hasMoreWords) {
          this.showLoadingIndicator();
        }
      }, 100);

    } catch (error) {
      console.error('Error loading words:', error);
    }
  }

  private async loadMoreWords() {
    if (this.isLoading || !this.hasMoreWords) return;

    this.isLoading = true;
    this.showLoadingIndicator();

    try {
      const result = await window.electronAPI.getWordsPaginated(this.currentOffset, this.pageSize);

      // Filter out duplicates based on word ID
      const existingIds = new Set(this.words.map(word => word.id));
      const newWords = result.words.filter(word => !existingIds.has(word.id));

      // Add new words to our collection (only non-duplicates)
      this.words.push(...newWords);
      this.hasMoreWords = result.hasMore;
      this.totalWords = result.total;
      this.currentOffset += this.pageSize;

      // Render the new words (only non-duplicates)
      if (newWords.length > 0) {
        this.renderWordListIncremental(newWords);
      }

      // Update word count display
      this.updateWordCount();
    } catch (error) {
      console.error('Error loading more words:', error);
      this.showError('Failed to load more words');
    } finally {
      this.isLoading = false;
      this.updateLoadingIndicator();
    }
  }

  private setupScrollObserver() {
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
    let isTriggering = false; // Flag to prevent concurrent triggers

    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        // Only trigger if:
        // 1. Element is intersecting (visible)
        // 2. Not currently triggering another load
        // 3. There are more words to load
        // 4. Not already loading
        if (entry.isIntersecting && !isTriggering && this.hasMoreWords && !this.isLoading) {
          isTriggering = true; // Set flag immediately

          this.loadMoreWords().finally(() => {
            // Reset flag after loading completes (success or failure)
            isTriggering = false;
          });
        }
      },
      {
        root: document.getElementById('word-list'),
        rootMargin: '0px 0px 0px 0px', // Add bottom margin to trigger earlier
        threshold: 0.1 // Higher threshold for more reliable triggering
      }
    );

    // Observe the loading indicator
    this.scrollObserver.observe(loadingIndicator);
  }

  private showLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'flex';
    }
  }

  private hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  }

  private updateLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (!loadingIndicator) return;

    // Update the indicator based on loading state and whether there are more words
    if (this.isLoading) {
      // Currently loading - show spinner and loading text
      loadingIndicator.innerHTML = `
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-500"></div>
        <span class="ml-2 text-sm text-slate-500">Loading more words...</span>
      `;
    } else if (!this.hasMoreWords) {
      // No more words to load - show different message without spinner
      loadingIndicator.innerHTML = `
        <div class="rounded-full h-6 w-6 border-2 border-slate-300 flex items-center justify-center">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <span class="ml-2 text-sm text-slate-400">No more words to load</span>
      `;
    } else {
      // Ready for next load - show ready state
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

  private setupEventListeners() {
    // Set up streaming content listener
    window.electronAPI.onStreamingContent((content: string) => {
      this.handleStreamingContent(content);
    });

    // Set up tool result listener
    window.electronAPI.onToolResult((toolData: any) => {
      this.handleToolResult(toolData);
    });

    // Profile selector
    const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
    profileSelect.addEventListener('change', async (e) => {
      const target = e.target as HTMLSelectElement;
      const newProfile = target.value;
      if (newProfile && newProfile !== this.currentProfile) {
        const success = await window.electronAPI.switchProfile(newProfile);
        if (success) {
          this.currentProfile = newProfile;

          // Clear the word list UI before loading new words
          const wordList = document.getElementById('word-list')!;
          wordList.innerHTML = '';

          // Clear the associated words list as well
          const associatedList = document.getElementById('associated-list')!;
          associatedList.innerHTML = '';

          await this.loadWords();
          this.clearWordDetails();
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
        this.clearSuggestions();
      }
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const suggestionsDiv = document.getElementById('suggestions')!;
      const wordInput = document.getElementById('word-input')!;

      if (!suggestionsDiv.contains(target) && target !== wordInput) {
        this.hideSuggestions();
      }
    });

    // Hide suggestions when input loses focus (with a small delay to allow clicking on suggestions)
    wordInput.addEventListener('blur', () => {
      setTimeout(() => {
        this.hideSuggestions();
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

    // Action buttons are now handled dynamically in renderWordDetails() and renderStreamingWordDetails()

    // Enter key on input
    wordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        // Prevent Enter key from working if generation is in progress or button is disabled
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
      this.toggleInlineActions();
    });

    // Add profile button (now inline)
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

    // Resize functionality on main content area
    const mainContent = document.getElementById('main-content') as HTMLElement;
    mainContent.addEventListener('mousedown', (e) => this.startResize(e));

    // Global mouse events for resizing
    document.addEventListener('mousemove', (e) => this.handleResize(e));
    document.addEventListener('mouseup', () => this.stopResize());
  }

  private async handleSearchInput(query: string) {
    try {
      const suggestions = await window.electronAPI.searchWords(query);
      this.renderSuggestions(suggestions);

      // Check if there's an exact match and update button accordingly
      const hasExactMatch = suggestions.some(word =>
        word.word.toLowerCase() === query.toLowerCase()
      );
      this.updateGenerateBtnState(query, hasExactMatch);
    } catch (error) {
      console.error('Error searching words:', error);
    }
  }

  private async handleGenerate() {
    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    const word = wordInput.value.trim();

    if (!word) {
      this.showError('Please enter a word');
      return;
    }

    const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
    const generateIcon = document.getElementById('generate-icon') as unknown as SVGElement;
    const loadingIcon = document.getElementById('loading-icon') as unknown as SVGElement;

    // Generate a unique ID for this generation request
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('🔄 Renderer: Generated new generationId:', generationId);

    // Defensive check: ensure generationId is valid
    if (!generationId || typeof generationId !== 'string' || generationId.length === 0) {
      console.error('❌ Renderer: Invalid generationId generated:', generationId);
      this.showError('Failed to generate request ID. Please try again.');
      return;
    }

    this.currentGenerationId = generationId;

    // Set generation flag to prevent duplicate requests
    this.isGenerating = true;
    generateBtn.disabled = true;
    generateIcon.classList.add('hidden');
    loadingIcon.classList.remove('hidden');

    try {
      // Clear previous content and reset streaming
      this.clearWordDetails();
      this.streamingContent = '';

      // Create initial word display
      const tempWord: WordDocument = {
        id: 'temp',
        word,
        one_line_desc: '',
        details: '',
        tags: [],
        tag_colors: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.currentWord = tempWord;
      this.renderStreamingWordDetails(tempWord);

      // First call: Generate meaning only
      const meaning = await window.electronAPI.generateMeaningOnly(word);

      // Update the word with the meaning
      tempWord.details = meaning;
      this.currentWord = tempWord;

      // Show loading states for summary and tags
      tempWord.one_line_desc = 'Generating summary...';
      tempWord.tags = ['Generating tags...'];
      tempWord.tag_colors = { 'Generating tags...': '#6b7280' };
      this.renderWordDetails(tempWord);

      // Second call: Generate tags and summary using the meaning
      try {
        console.log('Starting generateTagsAndSummary call...');
        const tagsResult = await window.electronAPI.generateTagsAndSummary(word, meaning, generationId);
        console.log('generateTagsAndSummary completed:', tagsResult);

        // Set a timeout to ensure UI updates even if event is delayed
        setTimeout(() => {
          // Only update if this is still the current generation and word has loading states
          if (this.currentGenerationId === generationId &&
              this.currentWord &&
              this.currentWord.tags.includes('Generating tags...')) {
            console.log('Tool result timeout - forcing UI update');
            // Force update with fallback data
            this.currentWord.one_line_desc = `Summary for: ${word}`;
            this.currentWord.tags = ['general'];
            this.currentWord.tag_colors = { 'general': '#6b7280' };
            this.renderWordDetails(this.currentWord);
          }
        }, 10000); // 10 second timeout

      } catch (error) {
        console.error('Error in generateTagsAndSummary:', error);
        this.showError('Failed to generate tags and summary. Please check your API configuration.');
        // Clear loading states on error (only if this is still the current generation)
        if (this.currentGenerationId === generationId && this.currentWord) {
          this.currentWord.one_line_desc = 'Failed to generate summary';
          this.currentWord.tags = ['Failed to generate tags'];
          this.currentWord.tag_colors = { 'Failed to generate tags': '#ef4444' };
          this.renderWordDetails(this.currentWord);
        }
      }

      // The tool results will be handled by handleToolResult callback
      // which will update the UI with tags and summary

    } catch (error) {
      console.error('Error generating meaning:', error);
      this.showError('Failed to generate meaning. Please check your API configuration.');
    } finally {
      // Clear generation flag
      this.isGenerating = false;
      generateBtn.disabled = false;
      generateIcon.classList.remove('hidden');
      loadingIcon.classList.add('hidden');
    }
  }

  private async handleAddWord() {
    if (!this.currentWord) {
      this.showError('No word to add');
      return;
    }

    try {
      const wordData = {
        word: this.currentWord.word,
        one_line_desc: this.currentWord.one_line_desc,
        details: this.currentWord.details,
        tags: this.currentWord.tags,
        tag_colors: this.currentWord.tag_colors
      };

      const addedWord = await window.electronAPI.addWord(wordData);
      this.currentWord = addedWord;

      // Disconnect scroll observer to prevent interference
      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
      }

      // Clear the current word list UI and reset pagination state
      const wordList = document.getElementById('word-list')!;
      wordList.innerHTML = '';
      this.words = [];
      this.currentOffset = 0;
      this.hasMoreWords = true;
      this.isLoading = false;

      // Load fresh data from the database (this will setup observer after content loads)
      await this.loadWords();

      // Re-render word details with updated action buttons
      if (this.currentWord) {
        await this.renderWordDetails(this.currentWord);
      }

      // Since the word is now in the database, switch to search mode
      this.updateGenerateBtnState(addedWord.word, true);

      this.showSuccess('Word added successfully');
    } catch (error) {
      console.error('Error adding word:', error);
      this.showError('Failed to add word');
    }
  }

  private async handleRefreshWord() {
    if (!this.currentWord || this.currentWord.id === 'temp') {
      this.showError('No word selected');
      return;
    }

    const originalWordId = this.currentWord.id;
    const originalCreatedAt = this.currentWord.created_at;

    try {
      // Generate new content
      const wordInput = document.getElementById('word-input') as HTMLInputElement;
      wordInput.value = this.currentWord.word;

      // Generate new content (this will create a temp word)
      await this.handleGenerate();

      // After generation completes, update the database with the new content
      if (this.currentWord && this.currentWord.id === 'temp') {
        const updatedWordData = {
          word: this.currentWord.word,
          one_line_desc: this.currentWord.one_line_desc,
          details: this.currentWord.details,
          tags: this.currentWord.tags,
          tag_colors: this.currentWord.tag_colors
        };

        // Update the word in database
        const updatedWord = await window.electronAPI.updateWord(originalWordId, updatedWordData);

        // Restore original metadata
        updatedWord.id = originalWordId;
        updatedWord.created_at = originalCreatedAt;
        updatedWord.updated_at = new Date().toISOString();

        // Update current word reference
        this.currentWord = updatedWord;

        // Update the word in the words array
        const wordIndex = this.words.findIndex(word => word.id === originalWordId);
        if (wordIndex !== -1) {
          // Update the existing object in place to preserve references in click handlers
          Object.assign(this.words[wordIndex], updatedWord);
          console.log('Updated word in words array:', this.words[wordIndex]);
        }

        // Re-render word details with updated content
        if (this.currentWord) {
          this.renderWordDetails(this.currentWord);
        
          // Update the word item in the list
          this.updateWordInList(originalWordId, this.currentWord);
        }

        this.showSuccess('Word refreshed successfully');
      }
    } catch (error) {
      console.error('Error refreshing word:', error);
      this.showError('Failed to refresh word');
    }
  }

  private async handleDeleteWord() {
    if (!this.currentWord || this.currentWord.id === 'temp') {
      this.showError('No word to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${this.currentWord.word}"?`)) {
      return;
    }

    try {
      const success = await window.electronAPI.deleteWord(this.currentWord.id);
      if (success) {
        const deletedWordId = this.currentWord.id;

        // Remove word from the words array
        this.words = this.words.filter(word => word.id !== deletedWordId);

        // Remove word item from DOM
        const wordItem = document.querySelector(`[data-word-id="${deletedWordId}"]`) as HTMLElement;
        if (wordItem) {
          wordItem.remove();
        }

        // Update total words count
        this.totalWords = Math.max(0, this.totalWords - 1);
        this.updateWordCount();

        // Clear word details if it was the selected word
        this.currentWord = null;
        this.clearWordDetails();

        // Update loading indicator in case the deletion affects pagination state
        this.updateLoadingIndicator();

        this.showSuccess('Word deleted successfully');
      } else {
        this.showError('Failed to delete word');
      }
    } catch (error) {
      console.error('Error deleting word:', error);
      this.showError('Failed to delete word');
    }
  }

  private async handleCopyWord() {
    if (!this.currentWord) {
      this.showError('No word to copy');
      return;
    }

    try {
      const wordText = `${this.currentWord.word}\n\n${this.currentWord.one_line_desc}\n\n${this.currentWord.details}`;
      await navigator.clipboard.writeText(wordText);
      this.showSuccess('Word copied to clipboard!');
    } catch (error) {
      console.error('Error copying word:', error);
      this.showError('Failed to copy word to clipboard');
    }
  }

  private showAddProfileModal() {
    // Clear any previous input
    const input = document.getElementById('new-profile-name') as HTMLInputElement;
    if (input) {
      input.value = '';
    }

    const modal = document.getElementById('add-profile-modal')!;
    modal.classList.remove('hidden');

    // Focus on the input field
    setTimeout(() => {
      if (input) {
        input.focus();
      }
    }, 100);
  }

  private hideAddProfileModal() {
    const modal = document.getElementById('add-profile-modal')!;
    modal.classList.add('hidden');
  }

  private async handleCreateProfile() {
    const input = document.getElementById('new-profile-name') as HTMLInputElement;
    const profileName = input ? input.value.trim() : '';

    if (!profileName) {
      this.showError('Profile name cannot be empty');
      return;
    }

    // Check if profile already exists
    if (this.profiles.includes(profileName)) {
      this.showError('A profile with this name already exists');
      return;
    }

    try {
      // Call backend API to create the profile and database
      const success = await window.electronAPI.createProfile(profileName);

      if (success) {
        // Refresh the profile list from backend
        await this.loadProfiles();
        this.currentProfile = profileName;

        // Switch to the newly created profile
        const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
        profileSelect.value = profileName;

        // Clear current word list and details since we're switching to empty profile
        this.clearWordDetails();
        const wordList = document.getElementById('word-list')!;
        wordList.innerHTML = '';

        this.hideAddProfileModal();
        this.showSuccess(`Profile "${profileName}" created successfully`);
      } else {
        this.showError('Failed to create profile');
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      this.showError('Failed to create profile');
    }
  }

  private async handleDeleteProfile() {
    // Don't allow deletion if there's only one profile
    if (this.profiles.length <= 1) {
      this.showError('Cannot delete the last remaining profile');
      return;
    }

    // Confirm deletion
    const confirmed = confirm(`Are you sure you want to delete the profile "${this.currentProfile}"? This action cannot be undone and will delete all words in this profile.`);
    if (!confirmed) {
      return;
    }

    try {
      // Call backend API to delete the profile
      const success = await window.electronAPI.deleteProfile(this.currentProfile);

      if (success) {
        // Refresh the profile list from backend
        await this.loadProfiles();

        // Switch to the first available profile (backend should have switched to another profile)
        const currentProfileName = await window.electronAPI.getCurrentProfileName();
        if (currentProfileName) {
          this.currentProfile = currentProfileName;

          // Update the profile selector
          const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
          profileSelect.value = this.currentProfile;

          // Clear current word list and details since we're switching to a different profile
          this.clearWordDetails();
          const wordList = document.getElementById('word-list')!;
          wordList.innerHTML = '';

          // Load words for the new current profile
          await this.loadWords();
        }

        this.hideSettingsModal();
        this.showSuccess(`Profile "${this.currentProfile}" deleted successfully.`);
      } else {
        this.showError('Failed to delete profile');
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      this.showError('Failed to delete profile');
    }
  }

  private renderWordList(words: WordDocument[]) {
    const wordList = document.getElementById('word-list')!;
    wordList.innerHTML = '';

    words.forEach(word => {
      const wordItem = this.createWordItem(word);
      wordList.appendChild(wordItem);
    });
  }

  private renderWordListIncremental(newWords: WordDocument[]) {
    const wordList = document.getElementById('word-list')!;

    // Ensure loading indicator exists and is at the end
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
      wordList.appendChild(loadingIndicator);
    } else {
      // Remove and re-append loading indicator to ensure it's at the end
      loadingIndicator.remove();
      wordList.appendChild(loadingIndicator);
    }

    newWords.forEach(word => {
      const wordItem = this.createWordItem(word);
      // Insert before loading indicator if it exists, otherwise append
      if (loadingIndicator && wordList.contains(loadingIndicator)) {
        wordList.insertBefore(wordItem, loadingIndicator);
      } else {
        wordList.appendChild(wordItem);
      }
    });

    // Always update the loading indicator state after rendering
    this.updateLoadingIndicator();
  }

  private createWordItem(word: WordDocument): HTMLElement {
    const wordItem = document.createElement('div');
    wordItem.className = 'word-item p-1.5 mb-0.5 cursor-pointer transition-all duration-200 hover:bg-amber-50/20 relative';
    wordItem.setAttribute('data-word-id', word.id); // Add data attribute for scrolling
    wordItem.innerHTML = `
      <div class="font-semibold text-slate-800 text-base mb-0.5">${word.word}</div>
      <div class="text-sm text-slate-500 line-clamp-2">${word.one_line_desc || 'No description'}</div>
      <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-200/60 via-amber-300/80 to-amber-200/60 opacity-0 transition-opacity duration-200"></div>
    `;

    wordItem.addEventListener('click', () => {
      this.selectWord(word);
    });

    // Add hover effect for underline
    wordItem.addEventListener('mouseenter', () => {
      const underline = wordItem.querySelector('div:last-child') as HTMLElement;
      if (underline) {
        underline.style.opacity = '1';
      }
    });

    wordItem.addEventListener('mouseleave', () => {
      const underline = wordItem.querySelector('div:last-child') as HTMLElement;
      if (underline) {
        underline.style.opacity = '0.0';
      }
    });

    return wordItem;
  }

  private scrollToWord(wordId: string) {
    // Find the word item in the word list
    const wordItem = document.querySelector(`[data-word-id="${wordId}"]`) as HTMLElement;
    if (wordItem) {
      // Scroll the word item into view
      wordItem.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      // Add a temporary highlight effect
      wordItem.classList.add('ring-2', 'ring-blue-400', 'ring-opacity-75');
      setTimeout(() => {
        wordItem.classList.remove('ring-2', 'ring-blue-400', 'ring-opacity-75');
      }, 2000);
    }
  }

  private renderSuggestions(suggestions: WordDocument[]) {
    const suggestionsDiv = document.getElementById('suggestions')!;

    if (suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    suggestionsDiv.innerHTML = '';

    suggestions.forEach(word => {
      const suggestionItem = document.createElement('div');
      suggestionItem.className = 'p-3 hover:bg-amber-100/70 cursor-pointer rounded-lg transition-colors duration-150 border-b border-amber-200/60 last:border-b-0';
      suggestionItem.innerHTML = `
        <div class="font-medium text-slate-800 mb-1">${word.word}</div>
        <div class="text-sm text-slate-600 line-clamp-2">${word.one_line_desc || 'No description'}</div>
      `;

      suggestionItem.addEventListener('click', () => {
        // Always show the word details directly when clicking a suggestion
        this.selectWord(word);
        this.hideSuggestions();
      });

      suggestionsDiv.appendChild(suggestionItem);
    });

    this.showSuggestions();
  }

  private showSuggestions() {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.classList.remove('hidden');
  }

  private hideSuggestions() {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.classList.add('hidden');
  }

  private async renderWordDetails(word: WordDocument) {
    const wordDetails = document.getElementById('word-details')!;
    const isLoadingSummary = word.one_line_desc === 'Generating summary...';
    const isLoadingTags = word.tags.includes('Generating tags...');

    // Process markdown content via IPC
    const renderedDetails = await window.electronAPI.processMarkdown(word.details || '');

    wordDetails.innerHTML = `
      <div class="space-y-6">
        <div>
          <h3 class="text-2xl font-bold text-slate-800 mb-2">${word.word}</h3>
          <p class="text-slate-600 mb-4 ${isLoadingSummary ? 'animate-pulse' : ''}">${word.one_line_desc}</p>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-slate-800 mb-3">Details</h4>
          <div class="text-slate-700 prose prose-sm max-w-none">${renderedDetails}</div>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-slate-800 mb-3">Tags</h4>
          <div id="tags-container" class="flex flex-wrap gap-2 mb-4">
            ${word.tags.map(tag => {
      const isLoadingTags = tag === 'Generating tags...';
      return `
                <span
                  class="tag-button ${isLoadingTags ? 'animate-pulse' : ''}"
                  style="background-color: ${word.tag_colors[tag] || '#e5e7eb'}; color: white;"
                  data-tag="${tag}"
                  ${isLoadingTags ? 'data-loading="true"' : ''}
                >
                  ${tag}
                </span>
              `;
    }).join('')}
          </div>

          <!-- Action buttons will be loaded separately after word details are complete -->
          <div id="action-buttons-container"></div>
        </div>
      </div>
    `;

    // Add click handlers for tags (skip loading tags)
    const tagElements = wordDetails.querySelectorAll('.tag-button:not([data-loading])');
    tagElements.forEach(tagEl => {
      tagEl.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const tag = target.dataset.tag!;
        await this.loadAssociatedWords(tag);
      });
    });

    // Load action buttons only after word details are complete
    if (!isLoadingSummary && !isLoadingTags) {
      this.loadActionButtons(word);
    }
  }

  private loadActionButtons(word: WordDocument) {
    const actionButtonsContainer = document.getElementById('action-buttons-container')!;
    const isNewWord = !word.id || word.id === 'temp';

    actionButtonsContainer.innerHTML = `
      <!-- Action Buttons - Minimal, icon only -->
      <div class="flex items-center space-x-1">
        <button
          id="copy-btn"
          title="Copy to Clipboard"
          class="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-amber-100/70 rounded-md transition-all duration-200 hover:shadow-sm"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        </button>

        ${isNewWord ? `
          <button
            id="add-btn"
            title="Add Word"
            class="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-amber-100/70 rounded-md transition-all duration-200 hover:shadow-sm"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
          </button>
        ` : `
          <button
            id="delete-btn"
            title="Delete it"
            class="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-amber-100/70 rounded-md transition-all duration-200 hover:shadow-sm"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        `}

        <button
          id="refresh-btn"
          title="Regenerate meaning"
          class="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-amber-100/70 rounded-md transition-all duration-200 hover:shadow-sm"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
        </button>
      </div>
    `;

    // Add click handlers for action buttons
    const copyBtn = document.getElementById('copy-btn');
    const addBtn = document.getElementById('add-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const deleteBtn = document.getElementById('delete-btn');

    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.handleCopyWord());
    }
    if (addBtn) {
      addBtn.addEventListener('click', () => this.handleAddWord());
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.handleRefreshWord());
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.handleDeleteWord());
    }
  }

  private async loadAssociatedWords(tag: string) {
    // Clean up existing observer first
    if (this.associatedScrollObserver) {
      this.associatedScrollObserver.disconnect();
      this.associatedScrollObserver = null;
    }

    // Reset associated words pagination state
    this.associatedWords = [];
    this.associatedCurrentOffset = 0;
    this.associatedHasMore = true;
    this.associatedIsLoading = false;
    this.currentTag = tag;

    // Clear the associated list DOM
    const associatedList = document.getElementById('associated-list')!;
    associatedList.innerHTML = '';

    // Load first page first, then setup observer after content is rendered
    await this.loadMoreAssociatedWords();

    // Setup scroll observer after content is rendered to ensure proper detection
    // Use setTimeout to ensure DOM updates are complete
    setTimeout(() => {
      this.setupAssociatedScrollObserver();

      // Force show the loading indicator if there are more words
      if (this.associatedHasMore) {
        this.showAssociatedLoadingIndicator();
      }
    }, 100);
  }

  private async loadMoreAssociatedWords() {
    if (this.associatedIsLoading || !this.associatedHasMore) {
      return;
    }

    this.associatedIsLoading = true;
    this.showAssociatedLoadingIndicator();

    try {
      const result = await window.electronAPI.getAssociatedWordsPaginated(
        this.currentTag,
        this.associatedCurrentOffset,
        this.associatedPageSize
      );

      // Filter out duplicates based on word ID
      const existingIds = new Set(this.associatedWords.map(word => word.id));
      const newWords = result.words.filter(word => !existingIds.has(word.id));

      // Add new words to our collection (only non-duplicates)
      this.associatedWords.push(...newWords);
      this.associatedHasMore = result.hasMore;
      this.associatedCurrentOffset += this.associatedPageSize;

      // Render the new words (only non-duplicates)
      if (newWords.length > 0) {
        this.renderAssociatedListIncremental(newWords);
      }

      // Update associated count
      this.updateAssociatedCount(result.total);
    } catch (error) {
      console.error('Error loading more associated words:', error);
      this.showError('Failed to load more associated words');
    } finally {
      this.associatedIsLoading = false;
      // Always update the loading indicator state
      this.updateAssociatedLoadingIndicator();
    }
  }

  private renderAssociatedList(words: WordDocument[], tag: string) {
    const associatedList = document.getElementById('associated-list')!;
    associatedList.innerHTML = `
      <div class="mb-4 p-3 bg-gradient-to-r from-purple-50/80 to-pink-50/80 rounded-lg border border-purple-200/60">
        <h4 class="font-semibold text-slate-800 flex items-center text-sm">
          <svg class="w-3 h-3 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
          </svg>
          Words tagged with "${tag}"
        </h4>
      </div>
    `;

    words.forEach(word => {
      const wordItem = document.createElement('div');
      wordItem.className = 'word-item p-3 mb-2 bg-amber-50/60 backdrop-blur-sm border border-amber-200/60 rounded-lg shadow-sm hover:bg-amber-100/70 hover:border-amber-300/70 transition-all duration-200';
      wordItem.innerHTML = `
        <div class="font-semibold text-slate-800 text-base mb-0.5">${word.word}</div>
        <div class="text-sm text-slate-600 line-clamp-2">${word.one_line_desc || 'No description'}</div>
      `;

      wordItem.addEventListener('click', () => {
        this.selectWord(word);
      });

      associatedList.appendChild(wordItem);
    });

    // Create loading indicator if it doesn't exist
    let loadingIndicator = document.getElementById('associated-loading-indicator');
    if (!loadingIndicator) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'associated-loading-indicator';
      loadingIndicator.className = 'flex justify-center items-center py-4 text-slate-500';
      loadingIndicator.style.display = 'none';
      associatedList.appendChild(loadingIndicator);
    }

    // Update the associated count
    this.updateAssociatedCount(words.length);

    // Always update the loading indicator state
    this.updateAssociatedLoadingIndicator();
  }

  private selectWord(word: WordDocument) {
    // Prevent selecting a word while generation is in progress
    if (this.isGenerating) {
      console.log('⚠️ selectWord: Generation in progress, ignoring word selection');
      return;
    }

    this.currentWord = word;
    this.renderWordDetails(word);

    // Update input field
    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    wordInput.value = word.word;

    // Clear suggestions
    this.clearSuggestions();

    // Update button state for the input value and switch to search mode
    this.updateGenerateBtnState(word.word, true);
  }

  private clearWordDetails() {
    const wordDetails = document.getElementById('word-details')!;
    wordDetails.innerHTML = `
      <div class="text-center text-slate-500 mt-8">
        Select a word or enter a new one to get started
      </div>
    `;
  }

  private clearSuggestions() {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.innerHTML = '';
    this.hideSuggestions();
  }

  private showToast(message: string, type: 'success' | 'error' = 'success') {
    const toastContainer = document.getElementById('toast-container')!;
    const toastId = `toast-${Date.now()}`;

    const toastColors = {
      success: 'bg-green-500',
      error: 'bg-red-500'
    };

    const toastIcons = {
      success: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>`,
      error: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>`
    };

    const toastElement = document.createElement('div');
    toastElement.id = toastId;
    toastElement.className = `flex items-center space-x-3 px-4 py-3 ${toastColors[type]} text-white rounded-lg shadow-lg transform translate-x-full transition-all duration-300 ease-out max-w-sm`;
    toastElement.innerHTML = `
      <div class="flex-shrink-0">
        ${toastIcons[type]}
      </div>
      <div class="flex-1 text-sm font-medium">
        ${message}
      </div>
      <button class="flex-shrink-0 hover:bg-white/20 rounded-full p-1 transition-colors duration-200" onclick="this.parentElement.remove()">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    `;

    toastContainer.appendChild(toastElement);

    // Trigger animation
    setTimeout(() => {
      toastElement.classList.remove('translate-x-full');
      toastElement.classList.add('translate-x-0');
    }, 10);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      if (toastElement.parentElement) {
        toastElement.classList.remove('translate-x-0');
        toastElement.classList.add('translate-x-full');
        setTimeout(() => {
          toastElement.remove();
        }, 300);
      }
    }, 3000);
  }

  private showError(message: string) {
    this.showToast(message, 'error');
  }

  private showSuccess(message: string) {
    this.showToast(message, 'success');
  }

  private handleStreamingContent(content: string) {
    this.streamingContent += content;
    if (this.currentWord && this.currentWord.id === 'temp') {
      const streamingWord = { ...this.currentWord, details: this.streamingContent };
      this.renderStreamingWordDetails(streamingWord);

      // Auto-scroll to bottom of the scrollable word details container
      const wordDetails = document.getElementById('word-details');
      if (wordDetails && wordDetails.parentElement) {
        // Scroll the parent container which has overflow-y-auto
        wordDetails.parentElement.scrollTop = wordDetails.parentElement.scrollHeight;
      }
    }
  }

  private handleToolResult(toolData: any) {
    console.log('📨 Renderer: Received tool result event:', toolData);
    console.log('📨 Renderer: Current generation ID:', this.currentGenerationId);
    console.log('📨 Renderer: Tool data generation ID:', toolData?.generationId);

    // Defensive checks: ensure toolData is valid
    if (!toolData) {
      console.error('❌ Renderer: Received null/undefined toolData');
      return;
    }

    if (!toolData.generationId || typeof toolData.generationId !== 'string') {
      console.error('❌ Renderer: Invalid generationId in toolData:', toolData.generationId);
      return;
    }

    if (!this.currentWord) {
      console.error('❌ Renderer: No current word to update');
      return;
    }

    // CRITICAL: Only process tool results for the current generation
    // This prevents old tool results from updating the current word
    if (toolData.generationId === this.currentGenerationId) {
      console.log('✅ Renderer: Processing tool result for current generation');

      // Double-check that this tool result is for the current word
      // This prevents race conditions where the word changed but generationId didn't
      if (this.currentWord.id === 'temp') {
        console.log('✅ Renderer: Current word is temp, proceeding with update');

        // Update the current word with tool data
        if (toolData.summary) {
          console.log('📝 Renderer: Updating summary:', toolData.summary);
          this.currentWord.one_line_desc = toolData.summary;
        }
        if (toolData.tags) {
          console.log('🏷️ Renderer: Updating tags:', toolData.tags);
          this.currentWord.tags = toolData.tags;
        }
        if (toolData.tag_colors) {
          console.log('🎨 Renderer: Updating tag colors:', toolData.tag_colors);
          this.currentWord.tag_colors = toolData.tag_colors;
        }

        console.log('🔄 Renderer: Re-rendering word details');
        // Re-render with updated data (use regular render, not streaming)
        // This will automatically show the appropriate action buttons based on word state
        if (this.currentWord) {
          this.renderWordDetails(this.currentWord);
        }
      } else {
        console.log('⚠️ Renderer: Current word is not temp, skipping tool result update');
      }
    } else {
      console.log('❌ Renderer: Ignoring tool result - generation ID mismatch');
      console.log('❌ Renderer: Expected:', this.currentGenerationId, 'Got:', toolData.generationId);
      console.log('❌ Renderer: Current word ID:', this.currentWord?.id);
    }
  }

  private async renderStreamingWordDetails(word: WordDocument) {
    const wordDetails = document.getElementById('word-details')!;

    // Process markdown content via IPC
    const formattedDetails = await window.electronAPI.processMarkdown(word.details || '');

    wordDetails.innerHTML = `
      <div class="space-y-6">
        <div>
          <h3 class="text-2xl font-bold text-slate-800 mb-2">${word.word}</h3>
          <p class="text-slate-600 mb-4">${word.one_line_desc}</p>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-slate-800 mb-3">Details</h4>
          <div class="text-slate-700 prose prose-sm max-w-none">${formattedDetails}<span class="animate-pulse">|</span></div>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-slate-800 mb-3">Tags</h4>
          <div id="tags-container" class="flex flex-wrap gap-2 mb-4">
            ${word.tags.map(tag => `
              <span
                class="tag-button"
                style="background-color: ${word.tag_colors[tag] || '#e5e7eb'}; color: white;"
                data-tag="${tag}"
              >
                ${tag}
              </span>
            `).join('')}
          </div>

          <!-- Action buttons will be loaded separately after word details are complete -->
          <div id="action-buttons-container"></div>
        </div>
      </div>
    `;

    // Add click handlers for tags
    const tagElements = wordDetails.querySelectorAll('.tag-button');
    tagElements.forEach(tagEl => {
      tagEl.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const tag = target.dataset.tag!;
        await this.loadAssociatedWords(tag);
      });
    });

    // For streaming, we don't load action buttons since content is still being generated
    // Action buttons will be loaded when renderWordDetails is called after generation completes
  }

  private async showSettingsModal() {
    try {
      const profileConfig = await window.electronAPI.getProfileConfig();
      if (profileConfig) {
        const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
        if (profileNameInput) {
          profileNameInput.value = this.currentProfile || '';
        }
        (document.getElementById('system-prompt') as HTMLTextAreaElement).value = profileConfig.system_prompt || '';
        (document.getElementById('model-provider') as HTMLSelectElement).value = profileConfig.model_config.provider || 'openai';
        (document.getElementById('model-name') as HTMLInputElement).value = profileConfig.model_config.model || '';
        (document.getElementById('api-endpoint') as HTMLInputElement).value = profileConfig.model_config.endpoint || '';
        (document.getElementById('api-key') as HTMLInputElement).value = profileConfig.model_config.api_key || '';
      }
    } catch (error) {
      console.error('Error loading profile config:', error);
      this.showError('Failed to load profile settings');
    }

    const modal = document.getElementById('settings-modal')!;
    modal.classList.remove('hidden');
  }

  private hideSettingsModal() {
    const modal = document.getElementById('settings-modal')!;
    modal.classList.add('hidden');
  }

  private async saveSettings() {
    const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
    const profileName = profileNameInput ? profileNameInput.value.trim() : '';
    const systemPrompt = (document.getElementById('system-prompt') as HTMLTextAreaElement).value;
    const modelProvider = (document.getElementById('model-provider') as HTMLSelectElement).value;
    const modelName = (document.getElementById('model-name') as HTMLInputElement).value;
    const apiEndpoint = (document.getElementById('api-endpoint') as HTMLInputElement).value;
    const apiKey = (document.getElementById('api-key') as HTMLInputElement).value;

    if (!profileName) {
      this.showError('Profile name cannot be empty');
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
      const success = await window.electronAPI.updateProfileConfig(config);
      if (success) {
        // Update the profile name if it changed
        if (profileName !== this.currentProfile) {
          const success = await window.electronAPI.renameProfile(this.currentProfile, profileName);
          if (success) {
            // Refresh the entire profile list from backend to show updated names
            await this.loadProfiles();
            this.currentProfile = profileName;

            // Ensure the dropdown shows the renamed profile as selected
            const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
            profileSelect.value = profileName;
          } else {
            this.showError('Failed to rename profile');
            return;
          }
        }

        this.showSuccess('Settings saved successfully');
        this.hideSettingsModal();
      } else {
        this.showError('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showError('Failed to save settings');
    }
  }

  private startResize(e: MouseEvent) {
    const mainContent = document.getElementById('main-content') as HTMLElement;
    const mainRect = mainContent.getBoundingClientRect();

    // Check if mouse is near the borders (within 5px)
    const mouseX = e.clientX - mainRect.left;
    const leftPanel = document.getElementById('left-panel') as HTMLElement;
    const rightPanel = document.getElementById('right-panel') as HTMLElement;

    const leftBorderEnd = leftPanel.offsetWidth;
    const rightBorderStart = mainRect.width - rightPanel.offsetWidth;

    // Determine which border is being dragged
    let resizeType: 'left' | 'right' | null = null;
    if (Math.abs(mouseX - leftBorderEnd) <= 5) {
      resizeType = 'left';
    } else if (Math.abs(mouseX - rightBorderStart) <= 5) {
      resizeType = 'right';
    }

    if (!resizeType) return; // Not near a border

    e.preventDefault();
    this.isResizing = true;
    this.resizeHandle = { id: resizeType === 'left' ? 'resize-handle-left' : 'resize-handle-right' } as HTMLElement;
    this.startX = e.clientX;

    const middlePanel = document.getElementById('middle-panel') as HTMLElement;

    this.startLeftWidth = (leftPanel.offsetWidth / mainRect.width) * 100;
    this.startMiddleWidth = (middlePanel.offsetWidth / mainRect.width) * 100;
    this.startRightWidth = (rightPanel.offsetWidth / mainRect.width) * 100;

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }

  private handleResize(e: MouseEvent) {
    if (!this.isResizing) return;

    const mainContent = document.getElementById('main-content') as HTMLElement;
    const mainRect = mainContent.getBoundingClientRect();
    const deltaX = e.clientX - this.startX;
    const deltaPercent = (deltaX / mainRect.width) * 100;

    const leftPanel = document.getElementById('left-panel') as HTMLElement;
    const middlePanel = document.getElementById('middle-panel') as HTMLElement;
    const rightPanel = document.getElementById('right-panel') as HTMLElement;

    const minWidthPercent = 15; // Minimum 15% width
    const maxWidthPercent = 70; // Maximum 70% width

    if (this.resizeHandle?.id === 'resize-handle-left') {
      // Resizing left-middle boundary
      let newLeftWidth = this.startLeftWidth + deltaPercent;
      let newMiddleWidth = this.startMiddleWidth - deltaPercent;

      // Constrain widths
      if (newLeftWidth < minWidthPercent) {
        newLeftWidth = minWidthPercent;
        newMiddleWidth = this.startMiddleWidth + (this.startLeftWidth - minWidthPercent);
      } else if (newMiddleWidth < minWidthPercent) {
        newMiddleWidth = minWidthPercent;
        newLeftWidth = this.startLeftWidth + (this.startMiddleWidth - minWidthPercent);
      }

      leftPanel.style.width = `${newLeftWidth}%`;
      middlePanel.style.width = `${newMiddleWidth}%`;

    } else if (this.resizeHandle?.id === 'resize-handle-right') {
      // Resizing middle-right boundary
      let newMiddleWidth = this.startMiddleWidth + deltaPercent;
      let newRightWidth = this.startRightWidth - deltaPercent;

      // Constrain widths
      if (newMiddleWidth < minWidthPercent) {
        newMiddleWidth = minWidthPercent;
        newRightWidth = this.startRightWidth + (this.startMiddleWidth - minWidthPercent);
      } else if (newRightWidth < minWidthPercent) {
        newRightWidth = minWidthPercent;
        newMiddleWidth = this.startMiddleWidth + (this.startRightWidth - minWidthPercent);
      }

      middlePanel.style.width = `${newMiddleWidth}%`;
      rightPanel.style.width = `${newRightWidth}%`;
    }
  }

  private stopResize() {
    if (!this.isResizing) return;

    this.isResizing = false;
    this.resizeHandle = null;

    // Restore normal cursor and text selection
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  private updateWordCount() {
    const wordCountElement = document.getElementById('word-count') as HTMLElement;
    if (wordCountElement) {
      wordCountElement.textContent = this.totalWords.toString();
    }
  }

  private updateAssociatedCount(count: number) {
    const associatedCountElement = document.getElementById('associated-count') as HTMLElement;
    if (associatedCountElement) {
      associatedCountElement.textContent = count.toString();
    }
  }

  private updateWordInList(wordId: string, updatedWord: WordDocument) {
    // Find the word item in the DOM
    const wordItem = document.querySelector(`[data-word-id="${wordId}"]`) as HTMLElement;
    if (!wordItem) {
      console.warn('Word item not found in DOM:', wordId);
      return;
    }

    // Update the word item content
    const wordElement = wordItem.querySelector('.font-semibold') as HTMLElement;
    const descElement = wordItem.querySelector('.text-sm') as HTMLElement;

    if (wordElement) {
      wordElement.textContent = updatedWord.word;
    }

    if (descElement) {
      descElement.textContent = updatedWord.one_line_desc || 'No description';
    }

    console.log('Updated word item in list:', wordId, updatedWord.word);
  }

  private updateGenerateBtnState(query: string, hasExactMatch?: boolean) {
    const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
    const generateIcon = document.getElementById('generate-icon') as unknown as SVGElement;

    if (!generateBtn || !generateIcon) return;

    // Update enabled/disabled state based on input content
    generateBtn.disabled = query.length === 0;

    // If we have exact match info, update the mode and icon
    if (hasExactMatch !== undefined) {
      this.isSearchMode = hasExactMatch;

      if (hasExactMatch) {
        // Change to search icon when there's an exact match
        generateBtn.title = 'View Existing Word';
        generateIcon.innerHTML = `
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        `;
      } else {
        // Change back to send/generate icon when no exact match
        generateBtn.title = 'Generate';
        generateIcon.innerHTML = `
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
        `;
      }
    }
  }

  private async handleSearchExistingWord() {
    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    const query = wordInput.value.trim().toLowerCase();

    if (!query) {
      this.showError('Please enter a word');
      return;
    }

    try {
      // Search for the exact word
      const suggestions = await window.electronAPI.searchWords(query);

      // Find the exact match
      const exactMatch = suggestions.find(word =>
        word.word.toLowerCase() === query
      );

      if (exactMatch) {
        // Show the existing word details
        this.selectWord(exactMatch);
        this.clearSuggestions();
      } else {
        // This shouldn't happen if button state is managed correctly, but handle it
        this.showError('Word not found. Try generating it instead.');
      }
    } catch (error) {
      console.error('Error searching for existing word:', error);
      this.showError('Failed to find existing word');
    }
  }

  private toggleInlineActions() {
    const inlineActions = document.getElementById('inline-actions') as HTMLElement;
    if (inlineActions) {
      const isVisible = inlineActions.classList.contains('w-0');

      if (isVisible) {
        // Show the inline actions - calculate the natural width
        inlineActions.classList.remove('w-0', 'pointer-events-none');
        inlineActions.classList.add('w-auto', 'pointer-events-auto');
      } else {
        // Hide the inline actions
        inlineActions.classList.remove('w-auto', 'pointer-events-auto');
        inlineActions.classList.add('w-0', 'pointer-events-none');
      }
    }
  }

  private expandMoreActions() {
    const expandedActions = document.getElementById('expanded-actions') as HTMLElement;
    const portal = document.getElementById('more-actions-portal') as HTMLElement;
    const moreBtn = document.getElementById('more-btn') as HTMLElement;

    if (expandedActions && portal && moreBtn) {
      // Move to portal for proper layering
      portal.appendChild(expandedActions);

      // Position the dropdown relative to the more button
      const rect = moreBtn.getBoundingClientRect();
      expandedActions.style.position = 'fixed';
      expandedActions.style.top = `${rect.bottom + 8}px`;
      expandedActions.style.left = `${rect.right - expandedActions.offsetWidth}px`;
      expandedActions.style.zIndex = '10000';

      // Show with animation
      expandedActions.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
      expandedActions.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
    }
  }

  private collapseMoreActions() {
    const expandedActions = document.getElementById('expanded-actions') as HTMLElement;
    const container = document.getElementById('more-actions-container') as HTMLElement;

    if (expandedActions && container) {
      // Move back to original container
      container.appendChild(expandedActions);

      // Reset positioning
      expandedActions.style.position = '';
      expandedActions.style.top = '';
      expandedActions.style.left = '';
      expandedActions.style.zIndex = '';

      // Hide with animation
      expandedActions.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
      expandedActions.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
    }
  }

  private async handleExportProfile() {
    try {
      const result = await window.electronAPI.exportProfile();

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

  private async handleImportProfile() {
    try {
      const result = await window.electronAPI.importProfile();

      if (result.success) {
        this.showSuccess(result.message);

        // If import was successful and we have a new profile name, refresh the profiles
        if (result.profileName) {
          // Refresh the profile list to include the new imported profile
          const profiles = await window.electronAPI.getProfiles();
          const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;

          // Clear existing options
          profileSelect.innerHTML = '';

          // Add all profiles
          profiles.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile;
            option.textContent = profile;
            profileSelect.appendChild(option);
          });

          // The import process already switched to the imported profile,
          // so we just need to update the UI
          profileSelect.value = result.profileName;
          this.currentProfile = result.profileName;

          // Clear current word list and details since we're switching to imported profile
          this.clearWordDetails();
          const wordList = document.getElementById('word-list')!;
          wordList.innerHTML = '';

          // Load words for the imported profile
          await this.loadWords();
        }
      } else {
        this.showError(result.message);
      }
    } catch (error) {
      console.error('Error importing profile:', error);
      this.showError('Failed to import profile');
    }
  }

  private setupAssociatedScrollObserver() {
    // Create loading indicator element if it doesn't exist
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

    // Setup intersection observer with robust duplicate prevention
    let isTriggering = false; // Flag to prevent concurrent triggers

    this.associatedScrollObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        // Only trigger if:
        // 1. Element is intersecting (visible)
        // 2. Not currently triggering another load
        // 3. There are more words to load
        // 4. Not already loading
        if (entry.isIntersecting && !isTriggering && this.associatedHasMore && !this.associatedIsLoading) {
          isTriggering = true; // Set flag immediately

          this.loadMoreAssociatedWords().finally(() => {
            // Reset flag after loading completes (success or failure)
            isTriggering = false;
          });
        }
      },
      {
        root: document.getElementById('associated-list'),
        rootMargin: '0px 0px 0px 0px', // Add bottom margin to trigger earlier
        threshold: 0.1 // Higher threshold for more reliable triggering
      }
    );

    // Observe the loading indicator
    this.associatedScrollObserver.observe(loadingIndicator);
  }

  private showAssociatedLoadingIndicator() {
    const loadingIndicator = document.getElementById('associated-loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'flex';
    }
  }

  private updateAssociatedLoadingIndicator() {
    const loadingIndicator = document.getElementById('associated-loading-indicator');
    if (!loadingIndicator) return;

    // Update the indicator based on loading state and whether there are more words
    if (this.associatedIsLoading) {
      // Currently loading - show spinner and loading text
      loadingIndicator.innerHTML = `
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-500"></div>
        <span class="ml-2 text-sm text-slate-500">Loading more words...</span>
      `;
    } else if (!this.associatedHasMore) {
      // No more words to load - show different message without spinner
      loadingIndicator.innerHTML = `
        <div class="rounded-full h-6 w-6 border-2 border-slate-300 flex items-center justify-center">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <span class="ml-2 text-sm text-slate-400">No more words to load</span>
      `;
    } else {
      // Ready for next load - show ready state
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

  private renderAssociatedListIncremental(newWords: WordDocument[]) {
    const associatedList = document.getElementById('associated-list')!;

    // Ensure loading indicator exists and is at the end
    let loadingIndicator = document.getElementById('associated-loading-indicator');
    if (!loadingIndicator) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'associated-loading-indicator';
      loadingIndicator.className = 'flex justify-center items-center py-4 text-slate-500';
      loadingIndicator.style.display = 'none';
      associatedList.appendChild(loadingIndicator);
    } else {
      // Remove and re-append loading indicator to ensure it's at the end
      loadingIndicator.remove();
      associatedList.appendChild(loadingIndicator);
    }

    newWords.forEach(word => {
      const wordItem = document.createElement('div');
      wordItem.className = 'word-item p-1.5 mb-0.5 cursor-pointer transition-all duration-200 hover:bg-amber-50/20 relative';
      wordItem.setAttribute('data-word-id', word.id); // Add data attribute for scrolling
      wordItem.innerHTML = `
        <div class="font-semibold text-slate-800 text-base mb-0.5">${word.word}</div>
        <div class="text-sm text-slate-500 line-clamp-2">${word.one_line_desc || 'No description'}</div>
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-200/60 via-amber-300/80 to-amber-200/60 opacity-0 transition-opacity duration-200"></div>
      `;

      wordItem.addEventListener('click', () => {
        this.selectWord(word);
      });

      // Add hover effect for underline
      wordItem.addEventListener('mouseenter', () => {
        const underline = wordItem.querySelector('div:last-child') as HTMLElement;
        if (underline) {
          underline.style.opacity = '1';
        }
      });

      wordItem.addEventListener('mouseleave', () => {
        const underline = wordItem.querySelector('div:last-child') as HTMLElement;
        if (underline) {
          underline.style.opacity = '0.0';
        }
      });

      // Insert before loading indicator
      associatedList.insertBefore(wordItem, loadingIndicator);
    });

    // Always update the loading indicator state after rendering
    this.updateAssociatedLoadingIndicator();
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded');
  new EverEtchApp();
});
