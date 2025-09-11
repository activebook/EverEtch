import { WordDocument, WordListItem } from '../types.js';
import { WordService } from '../services/WordService.js';
import { ToastManager } from './ToastManager.js';

export class WordRenderer {
  private wordService: WordService;
  private toastManager: ToastManager;

  constructor(wordService: WordService, toastManager: ToastManager) {
    this.wordService = wordService;
    this.toastManager = toastManager;
  }

  createWordItem(word: WordListItem): HTMLElement {
    const wordItem = document.createElement('div');
    wordItem.className = 'word-item p-1.5 mb-0.5 cursor-pointer transition-all duration-200 hover:bg-amber-50/20 relative';
    wordItem.setAttribute('data-word-id', word.id); // Add data attribute for scrolling
    wordItem.innerHTML = `
      <div class="font-semibold text-slate-800 text-base mb-0.5">${word.word}</div>
      <div class="text-sm text-slate-500 line-clamp-2">${word.one_line_desc || 'No description'}</div>
      <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-200/60 via-amber-300/80 to-amber-200/60 opacity-0 transition-opacity duration-200"></div>
    `;

    wordItem.addEventListener('click', () => {
      // Prevent clicking during generation to avoid wasteful API calls
      if (this.isGenerating()) {
        console.log('⚠️ Word item click ignored - generation in progress');
        return;
      }
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

  createWordItemFromList(word: WordListItem): HTMLElement {
    const wordItem = document.createElement('div');
    wordItem.className = 'word-item p-1.5 mb-0.5 cursor-pointer transition-all duration-200 hover:bg-amber-50/20 relative';
    wordItem.setAttribute('data-word-id', word.id); // Add data attribute for scrolling
    wordItem.innerHTML = `
      <div class="font-semibold text-slate-800 text-base mb-0.5">${word.word}</div>
      <div class="text-sm text-slate-500 line-clamp-2">${word.one_line_desc || 'No description'}</div>
      <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-200/60 via-amber-300/80 to-amber-200/60 opacity-0 transition-opacity duration-200"></div>
    `;

    wordItem.addEventListener('click', async () => {
      // Prevent clicking during generation to avoid wasteful API calls
      if (this.isGenerating()) {
        console.log('⚠️ Word list item click ignored - generation in progress');
        return;
      }

      // For WordListItem, we need to fetch the full WordDocument when clicked
      try {
        const fullWord = await this.wordService.getWord(word.id);
        if (fullWord) {
          this.selectWord(fullWord);
        } else {
          console.error('Failed to fetch full word details for:', word.id);
        }
      } catch (error) {
        console.error('Error fetching word details:', error);
      }
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

  async renderWordDetails(word: WordDocument): Promise<void> {
    const wordDetails = document.getElementById('word-details')!;
    const isLoadingSummary = word.one_line_desc === 'Generating summary...';
    const isLoadingTags = word.tags.includes('Analyzing word...');

    // Process markdown content via IPC
    const renderedDetails = await this.wordService.processMarkdown(word.details || '');

    wordDetails.innerHTML = `
      <div class="space-y-6">
        <div>
          <h3 class="text-2xl font-bold text-slate-800 mb-2">${word.word}</h3>
          <p class="text-slate-600 mb-4 ${isLoadingSummary ? 'animate-pulse' : ''}">${word.one_line_desc}</p>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-slate-800 mb-3 flex items-center">
            <svg class="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Details
          </h4>
          <div class="markdown-details prose prose-sm max-w-none">${renderedDetails}</div>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-slate-800 mb-3 flex items-center">
            <svg class="w-4 h-4 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
            </svg>
            Tags
          </h4>
          <div id="tags-container" class="flex flex-wrap gap-2 mb-4">
            ${word.tags.map(tag => {
      const isLoadingTags = tag === 'Analyzing word...';
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
        </div>

        ${word.synonyms && word.synonyms.length > 0 ? `
          <div>
            <h4 class="text-lg font-semibold text-slate-800 mb-3 flex items-center">
              <svg class="w-4 h-4 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
              </svg>
              Synonyms
            </h4>
            <div class="flex flex-wrap gap-2 mb-4">
              ${word.synonyms.map(synonym => `
                <span class="synonym-button px-3 py-1.5 text-sm font-medium bg-green-100 text-green-800 rounded-full border border-green-200 hover:bg-green-200 hover:scale-105 transition-all duration-200 cursor-pointer">
                  ${synonym}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${word.antonyms && word.antonyms.length > 0 ? `
          <div>
            <h4 class="text-lg font-semibold text-slate-800 mb-3 flex items-center">
              <svg class="w-4 h-4 mr-2 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
              Antonyms
            </h4>
            <div class="flex flex-wrap gap-2 mb-4">
              ${word.antonyms.map(antonym => `
                <span class="antonym-button px-3 py-1.5 text-sm font-medium bg-red-100 text-red-800 rounded-full border border-red-200 hover:bg-red-200 hover:scale-105 transition-all duration-200 cursor-pointer">
                  ${antonym}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Action buttons will be loaded separately after word details are complete -->
        <div id="action-buttons-container"></div>
      </div>
    `;

    // Add click handlers for tags (skip loading tags)
    const tagElements = wordDetails.querySelectorAll('.tag-button:not([data-loading])');
    tagElements.forEach(tagEl => {
      tagEl.addEventListener('click', async (e) => {
        // Prevent clicking during generation to avoid wasteful API calls
        if (this.isGenerating()) {
          console.log('⚠️ Tag click ignored - generation in progress');
          return;
        }

        const target = e.target as HTMLElement;
        const tag = target.dataset.tag!;
        // This will be handled by the main app
        this.onTagClick?.(tag);
      });
    });

    // Add click handlers for synonyms
    const synonymElements = wordDetails.querySelectorAll('.synonym-button');
    synonymElements.forEach(synonymEl => {
      synonymEl.addEventListener('click', async (e) => {
        // Prevent clicking during generation to avoid wasteful API calls
        if (this.isGenerating()) {
          console.log('⚠️ Synonym click ignored - generation in progress');
          return;
        }

        const target = e.target as HTMLElement;
        const synonym = target.textContent!.trim();
        // Set the input field to the synonym and show related words
        const wordInput = document.getElementById('word-input') as HTMLInputElement;
        wordInput.value = synonym;
        this.onSynonymClick?.(synonym);
      });
    });

    // Add click handlers for antonyms
    const antonymElements = wordDetails.querySelectorAll('.antonym-button');
    antonymElements.forEach(antonymEl => {
      antonymEl.addEventListener('click', async (e) => {
        // Prevent clicking during generation to avoid wasteful API calls
        if (this.isGenerating()) {
          console.log('⚠️ Antonym click ignored - generation in progress');
          return;
        }

        const target = e.target as HTMLElement;
        const antonym = target.textContent!.trim();
        // Set the input field to the antonym and show related words
        const wordInput = document.getElementById('word-input') as HTMLInputElement;
        wordInput.value = antonym;
        this.onAntonymClick?.(antonym);
      });
    });

    // Load action buttons only after word details are complete
    if (!isLoadingSummary && !isLoadingTags) {
      this.loadActionButtons(word);
    }
  }

  loadActionButtons(word: WordDocument): void {
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
      copyBtn.addEventListener('click', () => this.handleCopyWord(word));
    }
    if (addBtn) {
      addBtn.addEventListener('click', () => this.onAddWord?.(word));
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.onRefreshWord?.(word));
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.onDeleteWord?.(word));
    }
  }

  async renderStreamingWordDetails(word: WordDocument): Promise<void> {
    const wordDetails = document.getElementById('word-details')!;

    // Process markdown content via IPC
    const formattedDetails = await this.wordService.processMarkdown(word.details || '');

    wordDetails.innerHTML = `
      <div class="space-y-6">
        <div>
          <h3 class="text-2xl font-bold text-slate-800 mb-2">${word.word}</h3>
          <p class="text-slate-600 mb-4">${word.one_line_desc}</p>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-slate-800 mb-3 flex items-center">
            <svg class="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Details
          </h4>
          <div class="markdown-details prose prose-sm max-w-none">${formattedDetails}<span class="animate-pulse">|</span></div>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-slate-800 mb-3 flex items-center">
            <svg class="w-4 h-4 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
            </svg>
            Tags
          </h4>
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
        this.onTagClick?.(tag);
      });
    });

    // For streaming, we don't load action buttons since content is still being generated
    // Action buttons will be loaded when renderWordDetails is called after generation completes
  }

  renderSuggestions(suggestions: WordListItem[]): void {
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

      suggestionItem.addEventListener('click', async () => {
        // Prevent clicking during generation to avoid wasteful API calls
        if (this.isGenerating()) {
          console.log('⚠️ Suggestion item click ignored - generation in progress');
          return;
        }

        // For WordListItem, we need to fetch the full WordDocument when clicked
        try {
          const fullWord = await this.wordService.getWord(word.id);
          if (fullWord) {
            this.selectWord(fullWord);
          } else {
            console.error('Failed to fetch full word details for:', word.id);
          }
        } catch (error) {
          console.error('Error fetching word details:', error);
        }
        this.hideSuggestions();
      });

      suggestionsDiv.appendChild(suggestionItem);
    });

    this.showSuggestions();
  }

  renderWordListIncremental(newWords: WordListItem[]): void {
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
      const wordItem = this.createWordItemFromList(word);
      // Insert before loading indicator if it exists, otherwise append
      if (loadingIndicator && wordList.contains(loadingIndicator)) {
        wordList.insertBefore(wordItem, loadingIndicator);
      } else {
        wordList.appendChild(wordItem);
      }
    });
  }

  renderWordItemAtTop(word: WordDocument): void {
    const wordList = document.getElementById('word-list')!;

    // Create new word item
    const wordItem = this.createWordItemFromList({
      id: word.id,
      word: word.word,
      one_line_desc: word.one_line_desc
    });

    // Insert at the top of the list
    const firstChild = wordList.firstChild;
    if (firstChild) {
      wordList.insertBefore(wordItem, firstChild);
    } else {
      wordList.appendChild(wordItem);
    }
  }

  // Event callbacks - to be set by the main app
  onTagClick?: (tag: string) => void;
  onSynonymClick?: (synonym: string) => void;
  onAntonymClick?: (antonym: string) => void;
  onAddWord?: (word: WordDocument) => void;
  onRefreshWord?: (word: WordDocument) => void;
  onDeleteWord?: (word: WordDocument) => void;
  onWordSelect?: (word: WordDocument | WordListItem) => void;

  private async selectWord(word: WordDocument | WordListItem): Promise<void> {
    if (this.onWordSelect) {
      this.onWordSelect(word);
    }
  }

  private async handleCopyWord(word: WordDocument): Promise<void> {
    try {
      await this.wordService.copyWordToClipboard(word);
      this.toastManager.showSuccess('Word copied to clipboard!');
    } catch (error) {
      console.error('Error copying word:', error);
      this.toastManager.showError('Failed to copy word to clipboard');
    }
  }

  private isGenerating(): boolean {
    // This will be checked by the main app
    return false;
  }

  private showSuggestions(): void {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.classList.remove('hidden');
  }

  private hideSuggestions(): void {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.classList.add('hidden');
  }
}
