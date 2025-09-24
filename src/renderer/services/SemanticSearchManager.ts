import { ToastManager } from '../components/ToastManager.js';
import { SemanticWordsManager, SemanticSearchResult } from './SemanticWordsManager.js';

export class SemanticSearchManager {
  private toastManager: ToastManager;
  private semanticWordsManager: SemanticWordsManager;
  private isEnabled: boolean = false;

  // UI Elements
  private searchContainer: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private searchButton: HTMLButtonElement | null = null;

  constructor(
    toastManager: ToastManager,
    semanticWordsManager: SemanticWordsManager,
  ) {
    this.toastManager = toastManager;
    this.semanticWordsManager = semanticWordsManager;

    this.initialize();
  }

  /**
   * Initialize the semantic search manager
   */
  private initialize(): void {
    this.findElements();
    this.attachEventListeners();
    this.checkSemanticSearchStatus();
  }

  /**
   * Find DOM elements
   */
  private findElements(): void {
    this.searchContainer = document.getElementById('semantic-search-container') as HTMLElement;
    this.searchInput = document.getElementById('semantic-search-input') as HTMLInputElement;
    this.searchButton = document.getElementById('semantic-search-btn') as HTMLButtonElement;
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (this.searchInput && !this.searchInput._listenerAdded) {
      this.searchInput._listenerAdded = true;
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleSearch();
        }
      });
    }

    if (this.searchButton && !this.searchButton._listenerAdded) {
      this.searchButton._listenerAdded = true;
      this.searchButton.addEventListener('click', () => {
        this.handleSearch();
      });
    }    
  }


  /**
   * Check if semantic search is enabled
   */
  async checkSemanticSearchStatus(): Promise<void> {
    try {
      const profile = await window.electronAPI.getProfileConfig();
      const isEnabled = profile?.embedding_config?.enabled || false;
      this.setEnabled(isEnabled);
    } catch (error) {
      console.error('Error checking semantic search status:', error);
      this.setEnabled(false);
    }
  }

  /**
   * Enable or disable semantic search
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;

    if (this.searchContainer) {
      if (enabled) {
        this.searchContainer.classList.remove('hidden');
        this.searchContainer.classList.add('animate-fadeIn');
      } else {
        this.searchContainer.classList.add('hidden');
        this.searchContainer.classList.remove('animate-fadeIn');
      }
    }

    // Update search button state
    if (this.searchButton) {
      this.searchButton.disabled = !enabled;
      this.searchButton.title = enabled ? 'Search' : 'Semantic search disabled';
    }

    // Update search input state
    if (this.searchInput) {
      this.searchInput.disabled = !enabled;
    }

    // Clear results if disabled
    if (!enabled) {
      this.semanticWordsManager.clearResults();
    }
  }

  /**
   * Handle search input
   */
  public async handleSearch(): Promise<void> {
    if (!this.isEnabled) {
      this.toastManager.showError('Semantic search is not enabled');
      return;
    }

    const query = this.searchInput?.value?.trim();
    if (!query) {
      this.toastManager.showError('Please enter a search query');
      return;
    }

    try {
      // Show loading state
      this.setSearchLoading(true);

      // Perform actual semantic search via IPC
      const result = await window.electronAPI.performSemanticSearch(query, 50); // Get more results for pagination

      if (result.success && result.results && result.results.length > 0) {
        // Convert API results to our format
        const searchResults: SemanticSearchResult[] = result.results.map((word: any) => ({
          word: word.word_item,
          similarity: word.similarity,
        }));

        // Set results in SemanticWordsManager
        this.semanticWordsManager.setSearchResults(query, searchResults);
        // this.toastManager.showSuccess(`Found ${result.results.length} similar words for "${query}"`);
      } else {
        this.toastManager.showInfo(`No similar words found for "${query}"`);
        this.semanticWordsManager.clearResults();
      }

    } catch (error) {
      console.error('Error performing semantic search:', error);
      this.toastManager.showError('Failed to perform semantic search');
    } finally {
      this.setSearchLoading(false);
    }
  }

  /**
   * Set search loading state
   */
  private setSearchLoading(loading: boolean): void {
    if (this.searchButton) {
      this.searchButton.disabled = loading;
      this.searchButton.innerHTML = loading ? `
        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      ` : `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
      `;
    }

    if (this.searchInput) {
      this.searchInput.disabled = loading;
    }
  }


  /**
   * Check if semantic search is enabled
   */
  public isSemanticSearchEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Clear search results
   */
  public clearSearchResults(): void {
    this.semanticWordsManager.clearResults();
  }


  /**
   * Clean up resources
   */
  public destroy(): void {
    // Remove event listeners
    if (this.searchInput) {
      this.searchInput.removeEventListener('keydown', this.handleSearch);
    }

    if (this.searchButton) {
      this.searchButton.removeEventListener('click', this.handleSearch);
    }
  }
}