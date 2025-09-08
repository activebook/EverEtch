// Type definitions for Electron API
declare global {
  interface Window {
    electronAPI: {
      getProfiles: () => Promise<string[]>;
      switchProfile: (profileName: string) => Promise<boolean>;
      getWords: () => Promise<any[]>;
      searchWords: (query: string) => Promise<any[]>;
      getWord: (wordId: string) => Promise<any>;
      addWord: (wordData: any) => Promise<any>;
      updateWord: (wordId: string, wordData: any) => Promise<any>;
      deleteWord: (wordId: string) => Promise<boolean>;
      generateMeaningOnly: (word: string) => Promise<string>;
      generateTagsAndSummary: (word: string, meaning: string) => Promise<any>;
      generateMeaning: (word: string) => Promise<string>;
      getAssociatedWords: (tag: string) => Promise<any[]>;
      getProfileConfig: () => Promise<any>;
      updateProfileConfig: (config: any) => Promise<boolean>;
      processMarkdown: (markdown: string) => Promise<string>;
      onStreamingContent: (callback: Function) => void;
      onToolResult: (callback: Function) => void;
      removeAllListeners: (event: string) => void;
    };
  }
}

export {}; // This makes the file a module

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
  private profiles: string[] = [];
  private currentProfile: string = '';
  private streamingContent: string = '';
  private isResizing: boolean = false;
  private resizeHandle: HTMLElement | null = null;
  private startX: number = 0;
  private startLeftWidth: number = 0;
  private startMiddleWidth: number = 0;
  private startRightWidth: number = 0;

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
      const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;

      profileSelect.innerHTML = '';
      this.profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile;
        option.textContent = profile;
        profileSelect.appendChild(option);
      });

      // Set current profile
      if (this.profiles.length > 0) {
        this.currentProfile = this.profiles[0];
        profileSelect.value = this.currentProfile;
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  }

  private async loadWords() {
    try {
      const words = await window.electronAPI.getWords();
      this.renderWordList(words);
    } catch (error) {
      console.error('Error loading words:', error);
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
      if (query.length > 0) {
        this.handleSearchInput(query);
      } else {
        this.clearSuggestions();
      }
    });

    // Generate button
    const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
    generateBtn.addEventListener('click', () => this.handleGenerate());

    // Action buttons
    const addBtn = document.getElementById('add-btn') as HTMLButtonElement;
    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    const deleteBtn = document.getElementById('delete-btn') as HTMLButtonElement;

    addBtn.addEventListener('click', () => this.handleAddWord());
    refreshBtn.addEventListener('click', () => this.handleRefreshWord());
    deleteBtn.addEventListener('click', () => this.handleDeleteWord());

    // Enter key on input
    wordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleGenerate();
      }
    });

    // Settings button
    const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
    settingsBtn.addEventListener('click', () => this.showSettingsModal());

    // Settings modal buttons
    const cancelSettingsBtn = document.getElementById('cancel-settings') as HTMLButtonElement;
    const saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;

    cancelSettingsBtn.addEventListener('click', () => this.hideSettingsModal());
    saveSettingsBtn.addEventListener('click', () => this.saveSettings());

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
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

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
        const tagsResult = await window.electronAPI.generateTagsAndSummary(word, meaning);
        console.log('generateTagsAndSummary completed:', tagsResult);

        // Set a timeout to ensure UI updates even if event is delayed
        setTimeout(() => {
          if (this.currentWord && this.currentWord.tags.includes('Generating tags...')) {
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
        // Clear loading states on error
        if (this.currentWord) {
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
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate';
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
      await this.loadWords(); // Refresh word list
      this.showSuccess('Word added successfully');
    } catch (error) {
      console.error('Error adding word:', error);
      this.showError('Failed to add word');
    }
  }

  private async handleRefreshWord() {
    if (!this.currentWord) {
      this.showError('No word selected');
      return;
    }

    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    wordInput.value = this.currentWord.word;
    await this.handleGenerate();
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
        this.currentWord = null;
        this.clearWordDetails();
        await this.loadWords();
        this.showSuccess('Word deleted successfully');
      } else {
        this.showError('Failed to delete word');
      }
    } catch (error) {
      console.error('Error deleting word:', error);
      this.showError('Failed to delete word');
    }
  }

  private renderWordList(words: WordDocument[]) {
    const wordList = document.getElementById('word-list')!;
    wordList.innerHTML = '';

    words.forEach(word => {
      const wordItem = document.createElement('div');
      wordItem.className = 'p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer rounded-md mb-2';
      wordItem.innerHTML = `
        <div class="font-medium text-gray-800">${word.word}</div>
        <div class="text-sm text-gray-600 truncate">${word.one_line_desc || 'No description'}</div>
      `;

      wordItem.addEventListener('click', () => {
        this.selectWord(word);
      });

      wordList.appendChild(wordItem);
    });
  }

  private renderSuggestions(suggestions: WordDocument[]) {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.innerHTML = '';

    if (suggestions.length === 0) {
      suggestionsDiv.innerHTML = '<div class="text-gray-500 text-sm p-2">No suggestions found</div>';
      return;
    }

    suggestions.forEach(word => {
      const suggestionItem = document.createElement('div');
      suggestionItem.className = 'p-2 hover:bg-gray-100 cursor-pointer rounded';
      suggestionItem.innerHTML = `
        <div class="font-medium text-gray-800">${word.word}</div>
        <div class="text-sm text-gray-600">${word.one_line_desc || ''}</div>
      `;

      suggestionItem.addEventListener('click', () => {
        this.selectWord(word);
        this.clearSuggestions();
      });

      suggestionsDiv.appendChild(suggestionItem);
    });
  }

  private async renderWordDetails(word: WordDocument) {
    const wordDetails = document.getElementById('word-details')!;
    const isLoadingSummary = word.one_line_desc === 'Generating summary...';
    const isLoadingTags = word.tags.includes('Generating tags...');

    // Process markdown content via IPC
    const renderedDetails = await window.electronAPI.processMarkdown(word.details || '');

    wordDetails.innerHTML = `
      <div class="space-y-4">
        <div>
          <h3 class="text-2xl font-bold text-gray-800 mb-2">${word.word}</h3>
          <p class="text-gray-600 mb-4 ${isLoadingSummary ? 'animate-pulse' : ''}">${word.one_line_desc || 'No description available'}</p>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-gray-800 mb-2">Details</h4>
          <div class="text-gray-700 prose prose-sm max-w-none">${renderedDetails}</div>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-gray-800 mb-2">Tags</h4>
          <div id="tags-container" class="flex flex-wrap">
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
  }

  private async loadAssociatedWords(tag: string) {
    try {
      const associatedWords = await window.electronAPI.getAssociatedWords(tag);
      this.renderAssociatedList(associatedWords, tag);
    } catch (error) {
      console.error('Error loading associated words:', error);
    }
  }

  private renderAssociatedList(words: WordDocument[], tag: string) {
    const associatedList = document.getElementById('associated-list')!;
    associatedList.innerHTML = `
      <div class="mb-4">
        <h4 class="font-semibold text-gray-800">Words tagged with "${tag}"</h4>
      </div>
    `;

    words.forEach(word => {
      const wordItem = document.createElement('div');
      wordItem.className = 'p-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer rounded mb-2';
      wordItem.innerHTML = `
        <div class="font-medium text-gray-800">${word.word}</div>
        <div class="text-sm text-gray-600 truncate">${word.one_line_desc || ''}</div>
      `;

      wordItem.addEventListener('click', () => {
        this.selectWord(word);
      });

      associatedList.appendChild(wordItem);
    });
  }

  private selectWord(word: WordDocument) {
    this.currentWord = word;
    this.renderWordDetails(word);

    // Update input field
    const wordInput = document.getElementById('word-input') as HTMLInputElement;
    wordInput.value = word.word;

    // Clear suggestions
    this.clearSuggestions();
  }

  private clearWordDetails() {
    const wordDetails = document.getElementById('word-details')!;
    wordDetails.innerHTML = `
      <div class="text-center text-gray-500 mt-8">
        Select a word or enter a new one to get started
      </div>
    `;
  }

  private clearSuggestions() {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.innerHTML = '';
  }

  private showError(message: string) {
    // Simple error display - could be enhanced with a toast notification
    alert(`Error: ${message}`);
  }

  private showSuccess(message: string) {
    // Simple success display - could be enhanced with a toast notification
    alert(`Success: ${message}`);
  }

  private handleStreamingContent(content: string) {
    this.streamingContent += content;
    if (this.currentWord) {
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
    if (this.currentWord && toolData) {
      // Update the current word with tool data
      if (toolData.summary) {
        this.currentWord.one_line_desc = toolData.summary;
      }
      if (toolData.tags) {
        this.currentWord.tags = toolData.tags;
      }
      if (toolData.tag_colors) {
        this.currentWord.tag_colors = toolData.tag_colors;
      }

      // Re-render with updated data (use regular render, not streaming)
      this.renderWordDetails(this.currentWord);
    }
  }

  private async renderStreamingWordDetails(word: WordDocument) {
    const wordDetails = document.getElementById('word-details')!;

    // Process markdown content via IPC
    const formattedDetails = await window.electronAPI.processMarkdown(word.details || '');

    wordDetails.innerHTML = `
      <div class="space-y-4">
        <div>
          <h3 class="text-2xl font-bold text-gray-800 mb-2">${word.word}</h3>
          <p class="text-gray-600 mb-4">${word.one_line_desc || 'No description available'}</p>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-gray-800 mb-2">Details</h4>
          <div class="text-gray-700 prose prose-sm max-w-none">${formattedDetails}<span class="animate-pulse">|</span></div>
        </div>

        <div>
          <h4 class="text-lg font-semibold text-gray-800 mb-2">Tags</h4>
          <div id="tags-container" class="flex flex-wrap">
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
  }

  private async showSettingsModal() {
    try {
      const profileConfig = await window.electronAPI.getProfileConfig();
      if (profileConfig) {
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
    const systemPrompt = (document.getElementById('system-prompt') as HTMLTextAreaElement).value;
    const modelProvider = (document.getElementById('model-provider') as HTMLSelectElement).value;
    const modelName = (document.getElementById('model-name') as HTMLInputElement).value;
    const apiEndpoint = (document.getElementById('api-endpoint') as HTMLInputElement).value;
    const apiKey = (document.getElementById('api-key') as HTMLInputElement).value;

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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded');
  new EverEtchApp();
});
