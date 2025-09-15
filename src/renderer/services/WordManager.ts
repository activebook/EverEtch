import { WordDocument, WordListItem, PaginationState } from '../types.js';
import { WordService } from './WordService.js';
import { ToastManager } from '../components/ToastManager.js';
import { WordRenderer } from '../components/WordRenderer.js';
import { UIUtils } from '../utils/UIUtils.js';
import { AssociatedWordsManager } from './AssociatedWordsManager.js';
import { generateGenerationId } from '../utils/Common.js';

// Constants for pagination
const WORDS_PAGE_SIZE = 10;

export class WordManager {
  private wordService: WordService;
  private toastManager: ToastManager;
  private wordRenderer: WordRenderer;
  private uiUtils: UIUtils;
  private associatedWordsManager: AssociatedWordsManager;

  // Word state
  private words: WordListItem[] = [];
  private wordsPagination: PaginationState = {
    offset: 0,
    pageSize: WORDS_PAGE_SIZE,
    isLoading: false,
    hasMore: true,
    total: 0
  };
  private scrollObserver: IntersectionObserver | null = null;
  private sortOrder: 'asc' | 'desc' = 'desc';
  private currentWord: WordDocument | null = null;
  private currentGenerationId: string = '';
  private streamingContent: string = '';
  private isGenerating: boolean = false;
  private isSearchMode: boolean = false;

  constructor(wordService: WordService, toastManager: ToastManager, wordRenderer: WordRenderer, uiUtils: UIUtils, associatedWordsManager: AssociatedWordsManager) {
    this.wordService = wordService;
    this.toastManager = toastManager;
    this.wordRenderer = wordRenderer;
    this.uiUtils = uiUtils;
    this.associatedWordsManager = associatedWordsManager;

    // Set up word renderer callbacks
    this.setupWordRendererCallbacks();
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

  // Getters for external access
  getWords(): WordListItem[] {
    return this.words;
  }

  getWordsPagination(): PaginationState {
    return this.wordsPagination;
  }

  getCurrentWord(): WordDocument | null {
    return this.currentWord;
  }

  getIsGenerating(): boolean {
    return this.isGenerating;
  }

  getIsSearchMode(): boolean {
    return this.isSearchMode;
  }

  getSortOrder(): 'asc' | 'desc' {
    return this.sortOrder;
  }

  // Setters for external access
  setCurrentWord(word: WordDocument | null): void {
    this.currentWord = word;
  }

  setSortOrder(sortOrder: 'asc' | 'desc'): void {
    this.sortOrder = sortOrder;
  }

  async loadWords(): Promise<void> {
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

  async handleGenerate(): Promise<void> {
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
    this.wordRenderer.setGenerationState(true);
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
      this.wordRenderer.setGenerationState(false);
      generateBtn.disabled = false;
      generateIcon.classList.remove('hidden');
      loadingIcon.classList.add('hidden');
    }
  }

  public async handleAddWord(word: WordDocument): Promise<void> {
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

  public async handleRefreshWord(word: WordDocument): Promise<void> {
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

  public async handleDeleteWord(word: WordDocument): Promise<void> {
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
    await this.associatedWordsManager.loadAssociatedWords(tag);
  }

  public async selectWord(word: WordDocument | WordListItem): Promise<void> {
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

  public async handleSearchInput(query: string): Promise<void> {
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

  public async handleSearchExistingWord(): Promise<void> {
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
        await this.selectWord(exactMatch);
        this.uiUtils.clearSuggestions();
      } else {
        this.toastManager.showError('Word not found. Try generating it instead.');
      }
    } catch (error) {
      console.error('Error searching for existing word:', error);
      this.toastManager.showError('Failed to find existing word');
    }
  }

  public async handleWriteRemark(word: WordDocument): Promise<void> {
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
                // Remove remark if it's empty'
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
                // Remove remark if it's empty'
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

  public async handleSortToggle(): Promise<void> {
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

  public async loadSortOrder(): Promise<void> {
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

    // Update the sort button icon after loading
    this.updateSortButtonIcon();
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
        <svg class="w-4 h-4" viewBox="0 0 6.4 6.4" xmlns="http://www.w3.org/2000/svg"><path d="M5.741 2.341a.2.2 0 0 1-.283 0L4.8 1.683V3.6a.2.2 0 0 1-.4 0V1.683l-.659.658a.2.2 0 0 1-.283-.283l1-1 .002-.002.013-.011.007-.006.008-.006.009-.005.008-.005.009-.004.009-.004.009-.003.01-.004.008-.002.011-.003.009-.001.10-.001L4.595 1h.009l-.015.001-.01-.002-.009-.001-.011-.003-.008-.002-.01-.004-.008-.003-.009-.004-.009-.004-.009-.005-.008-.005-.009-.007-.007-.005-.014-.013-.001-.001 1 1a.2.2 0 0 1 0 .283M1.2 3.4H3A.2.2 0 1 0 3 3H1.2a.2.2 0 0 0 0 .4m0-1.6h1.4a.2.2 0 0 0 0-.4H1.2a.2.2 0 1 0 0 .4m3.4 2.8H1.2a.2.2 0 0 0 0 .4h3.4a.2.2 0 0 0 0-.4"/></svg>
      `;
      sortBtn.title = 'Oldest first → Newest first';
    }
  }
}
