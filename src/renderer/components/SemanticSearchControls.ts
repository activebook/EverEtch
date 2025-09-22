import { ToastManager } from './ToastManager.js';
import { UIUtils } from '../utils/UIUtils.js';

export class SemanticSearchControls {
  private toastManager: ToastManager;
  private uiUtils: UIUtils;
  private isEnabled: boolean = false;
  private searchInput: HTMLInputElement | null = null;
  private searchButton: HTMLButtonElement | null = null;
  private searchContainer: HTMLElement | null = null;

  constructor(toastManager: ToastManager, uiUtils: UIUtils) {
    this.toastManager = toastManager;
    this.uiUtils = uiUtils;
    this.initialize();
  }

  /**
   * Initialize the semantic search controls
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
    if (this.searchInput) {
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleSearch();
        }
      });
    }

    if (this.searchButton) {
      this.searchButton.addEventListener('click', () => {
        this.handleSearch();
      });
    }
  }

  /**
   * Check if semantic search is enabled
   */
  private async checkSemanticSearchStatus(): Promise<void> {
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
      this.searchInput.placeholder = enabled
        ? 'Search by meaning...'
        : 'Semantic search disabled';
    }
  }

  /**
   * Handle search input
   */
  private async handleSearch(): Promise<void> {
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
      const result = await window.electronAPI.performSemanticSearch(query, 10);

      if (result.success && result.results && result.results.length > 0) {
        this.displaySearchResults(query, result.results);
        this.toastManager.showSuccess(`Found ${result.results.length} similar words for "${query}"`);
      } else {
        this.toastManager.showInfo(`No similar words found for "${query}"`);
        this.clearSearchResults();
      }

    } catch (error) {
      console.error('Error performing semantic search:', error);
      this.toastManager.showError('Failed to perform semantic search');
    } finally {
      this.setSearchLoading(false);
    }
  }

  /**
   * Display search results
   */
  private displaySearchResults(query: string, results: Array<{word: string, similarity: number, meaning: string}>): void {
    const associatedList = document.getElementById('associated-list');
    if (!associatedList) return;

    // Clear existing content
    associatedList.innerHTML = '';

    // Add search results header
    const header = document.createElement('div');
    header.className = 'mb-3 pb-2 border-b border-blue-200/60';
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-blue-700 flex items-center">
          <svg class="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          Search Results for "${query}"
        </h3>
        <button id="clear-search-results" title="Clear search results"
          class="text-xs text-slate-500 hover:text-slate-700 p-1 rounded hover:bg-slate-100">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `;

    // Add clear button functionality
    const clearBtn = header.querySelector('#clear-search-results');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearSearchResults();
      });
    }

    associatedList.appendChild(header);

    // Add results
    results.forEach((result, index) => {
      const resultItem = document.createElement('div');
      resultItem.className = 'p-2 mb-2 bg-white/60 rounded-lg border border-blue-100/60 hover:border-blue-200/80 hover:bg-white/80 transition-all duration-200 cursor-pointer group';
      resultItem.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <div class="flex items-center space-x-2">
              <span class="font-medium text-slate-800 truncate">${result.word}</span>
              <span class="text-xs font-medium text-blue-600 bg-blue-100/70 px-1.5 py-0.5 rounded-full">
                ${(result.similarity * 100).toFixed(0)}%
              </span>
            </div>
            <p class="text-xs text-slate-600 mt-1 line-clamp-2">${result.meaning}</p>
          </div>
        </div>
      `;

      // Add click handler to select word
      resultItem.addEventListener('click', () => {
        this.selectSearchResult(result.word);
      });

      associatedList.appendChild(resultItem);
    });

    // Update count
    this.updateAssociatedCount(results.length);
  }

  /**
   * Clear search results
   */
  private clearSearchResults(): void {
    const associatedList = document.getElementById('associated-list');
    if (associatedList) {
      associatedList.innerHTML = '<!-- Associated words will be populated here -->';
    }
    this.updateAssociatedCount(0);

    // Clear search input
    if (this.searchInput) {
      this.searchInput.value = '';
    }
  }

  /**
   * Select a search result
   */
  private selectSearchResult(word: string): void {
    // TODO: Implement word selection logic
    // This should trigger the word selection in the main app
    this.toastManager.showInfo(`Selected word: ${word}`);
  }

  /**
   * Update associated words count
   */
  private updateAssociatedCount(count: number): void {
    const countElement = document.getElementById('associated-count');
    if (countElement) {
      countElement.textContent = count.toString();
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
   * Get current search query
   */
  public getSearchQuery(): string {
    return this.searchInput?.value?.trim() || '';
  }

  /**
   * Set search query
   */
  public setSearchQuery(query: string): void {
    if (this.searchInput) {
      this.searchInput.value = query;
    }
  }

  /**
   * Focus search input
   */
  public focusSearchInput(): void {
    if (this.searchInput) {
      this.searchInput.focus();
    }
  }

  /**
   * Check if semantic search is enabled
   */
  public isSemanticSearchEnabled(): boolean {
    return this.isEnabled;
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
