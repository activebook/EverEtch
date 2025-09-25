import { WordListItem } from '../types.js';
import { WordRenderer } from '../components/WordRenderer.js';
import { ToastManager } from '../components/ToastManager.js';
import { UIUtils } from '../utils/UIUtils.js';

// Constants for virtual scrolling
const SEMANTIC_WORDS_INCREMENT_SIZE = 10;

export interface SemanticSearchResult {
  word: WordListItem;
  similarity: number;
}

export interface SemanticWordsState {
  allResults: SemanticSearchResult[];      // All loaded results
  displayedResults: SemanticSearchResult[]; // Currently visible results
  displayOffset: number;                    // How many results to show
  incrementSize: number;                    // How many to add on scroll
  isLoading: boolean;                       // Loading state for UI
  hasMoreToShow: boolean;                   // Whether more results exist to display
  searchQuery: string;                      // Current search query
  scrollObserver: IntersectionObserver | null; // For scroll detection
}

export class SemanticWordsManager {
  private wordRenderer: WordRenderer;
  private toastManager: ToastManager;
  private uiUtils: UIUtils;

  // Semantic words state
  private semanticWordsState: SemanticWordsState = {
    allResults: [],
    displayedResults: [],
    displayOffset: 0,
    incrementSize: SEMANTIC_WORDS_INCREMENT_SIZE,
    isLoading: false,
    hasMoreToShow: false,
    searchQuery: '',
    scrollObserver: null
  };

  constructor(wordRenderer: WordRenderer, toastManager: ToastManager, uiUtils: UIUtils) {
    this.wordRenderer = wordRenderer;
    this.toastManager = toastManager;
    this.uiUtils = uiUtils;
  }

  /**
   * Set semantic search results and initialize virtual scrolling
   */
  public setSearchResults(query: string, results: SemanticSearchResult[]): void {
    // Clean up existing observer
    if (this.semanticWordsState.scrollObserver) {
      this.semanticWordsState.scrollObserver.disconnect();
      this.semanticWordsState.scrollObserver = null;
    }

    // Record all search results and initialize virtual scrolling state
    this.semanticWordsState = {
      allResults: results,
      displayedResults: [],
      displayOffset: 0,
      incrementSize: SEMANTIC_WORDS_INCREMENT_SIZE,
      isLoading: false,
      hasMoreToShow: results.length > 0,
      searchQuery: query,
      scrollObserver: null
    };

    // Clear associated words list and display initial results
    this.clearAssociatedWordsList();
    this.displayIncrementalResults();
    this.updateAssociatedCount(results.length);
    this.setupScrollObserver();
  }

  /**
    * Display incremental results using virtual scrolling
    */
  private displayIncrementalResults(): void {
    // Calculate how many results to show
    const endIndex = Math.min(this.semanticWordsState.displayOffset + this.semanticWordsState.incrementSize, this.semanticWordsState.allResults.length);
    const newResults = this.semanticWordsState.allResults.slice(this.semanticWordsState.displayOffset, endIndex);

    // Update displayed results
    this.semanticWordsState.displayedResults = this.semanticWordsState.allResults.slice(0, endIndex);
    this.semanticWordsState.displayOffset = endIndex;

    // Check if there are more results to show
    this.semanticWordsState.hasMoreToShow = this.semanticWordsState.displayOffset < this.semanticWordsState.allResults.length;


    // Convert to WordListItem format for rendering
    const wordListItems: WordListItem[] = newResults.map((result) => result.word);

    // Render the new results
    this.wordRenderer.renderAssociatedWordListIncremental(wordListItems);

    // Add loading indicator if there are more results
    if (this.semanticWordsState.hasMoreToShow) {
      this.addLoadingIndicator();
    } else {
      // Remove loading indicator if no more results
      const existingIndicator = document.getElementById('semantic-loading-indicator');
      if (existingIndicator) {
        existingIndicator.remove();
      }
    }
  }

  /**
    * Set up scroll observer for progressive loading
    */
  private setupScrollObserver(): void {
    // Don't set up observer if there are no more results to show
    if (!this.semanticWordsState.hasMoreToShow) {
      return;
    }

    const loadingIndicator = document.getElementById('semantic-loading-indicator');
    if (!loadingIndicator) {
      this.addLoadingIndicator();
    }

    const indicator = document.getElementById('semantic-loading-indicator')!;
    let isTriggering = false;

    // Use the same approach as AssociatedWordsManager
    const associatedList = document.getElementById('associated-list');
    const scrollRoot = associatedList || null;

    this.semanticWordsState.scrollObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry.isIntersecting && !isTriggering && this.semanticWordsState.hasMoreToShow && !this.semanticWordsState.isLoading) {
          isTriggering = true;
          this.loadMoreResults().finally(() => {
            isTriggering = false;
          });
        }
      },
      {
        root: scrollRoot,
        rootMargin: '0px 0px 0px 0px',
        threshold: 0.1
      }
    );

    this.semanticWordsState.scrollObserver.observe(indicator);

    // Add scroll event listener as fallback
    if (associatedList && !associatedList._listenerAdded) {
      associatedList._listenerAdded = true;
      associatedList.addEventListener('scroll', () => {
        this.handleScrollFallback();
      });
    }
  }

  /**
    * Fallback scroll handler when IntersectionObserver doesn't work
    */
  private handleScrollFallback(): void {
    const associatedList = document.getElementById('associated-list');
    const loadingIndicator = document.getElementById('semantic-loading-indicator');

    if (!associatedList || !loadingIndicator || this.semanticWordsState.isLoading || !this.semanticWordsState.hasMoreToShow) {
      // Clean up if no more results
      if (!this.semanticWordsState.hasMoreToShow && loadingIndicator) {
        loadingIndicator.remove();
      }
      return;
    }

    const listRect = associatedList.getBoundingClientRect();
    const indicatorRect = loadingIndicator.getBoundingClientRect();

    // Check if loading indicator is near the bottom of the visible area
    const isNearBottom = indicatorRect.top <= listRect.bottom + 100;

    if (isNearBottom) {
      this.loadMoreResults();
    }
  }

  /**
    * Load more results when user scrolls to the loading indicator
    */
  private async loadMoreResults(): Promise<void> {
    if (this.semanticWordsState.isLoading || !this.semanticWordsState.hasMoreToShow) {
      // Clean up observer if no more results
      if (!this.semanticWordsState.hasMoreToShow && this.semanticWordsState.scrollObserver) {
        this.semanticWordsState.scrollObserver.disconnect();
        this.semanticWordsState.scrollObserver = null;
        const indicator = document.getElementById('semantic-loading-indicator');
        if (indicator) {
          indicator.remove();
        }
      }
      return;
    }

    this.semanticWordsState.isLoading = true;
    this.updateLoadingIndicator();

    // Use setTimeout to simulate async loading (in real implementation, this would be an API call)
    setTimeout(() => {
      this.displayIncrementalResults();
      this.semanticWordsState.isLoading = false;
      this.updateLoadingIndicator();
    }, 100);
  }

  /**
   * Add loading indicator at the bottom of results
   */
  private addLoadingIndicator(): void {
    const associatedList = document.getElementById('associated-list');
    if (!associatedList) return;

    // Remove existing loading indicator
    const existingIndicator = document.getElementById('semantic-loading-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }

    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'semantic-loading-indicator';
    loadingDiv.className = 'flex justify-center items-center py-4 text-slate-500';
    loadingDiv.innerHTML = `
      <div class="rounded-full h-6 w-6 border-2 border-slate-400 flex items-center justify-center">
        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
      </div>
      <span class="ml-2 text-sm text-slate-400">Scroll for more words</span>
    `;

    associatedList.appendChild(loadingDiv);
  }

  /**
    * Update loading indicator based on current state
    */
  private updateLoadingIndicator(): void {
    const loadingIndicator = document.getElementById('semantic-loading-indicator');
    if (!loadingIndicator) {
      return;
    }

    if (this.semanticWordsState.isLoading) {
      loadingIndicator.innerHTML = `
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-500"></div>
        <span class="ml-2 text-sm text-slate-500">Loading more words...</span>
      `;
    } else if (!this.semanticWordsState.hasMoreToShow) {
      loadingIndicator.innerHTML = `
        <div class="rounded-full h-6 w-6 border-2 border-slate-300 flex items-center justify-center">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <span class="ml-2 text-sm text-slate-400">All results loaded</span>
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


  /**
   * Clear the associated words list
   */
  private clearAssociatedWordsList(): void {
    const associatedList = document.getElementById('associated-list');
    if (associatedList) {
      associatedList.innerHTML = '';
      associatedList.scrollTop = 0;
    }
  }

  /**
   * Update associated words count display
   */
  private updateAssociatedCount(count: number): void {
    const countElement = document.getElementById('associated-count');
    if (countElement) {
      countElement.textContent = count.toString();
    }
  }

  /**
   * Handle word selection from semantic search results
   */
  public selectWord(wordName: string): void {
    // Create a custom event to trigger word selection in the main app
    const selectEvent = new CustomEvent('select-word-from-search', {
      detail: { wordName }
    });
    document.dispatchEvent(selectEvent);
  }

  /**
   * Clear semantic search results
   */
  public clearResults(): void {
    // Clean up observer
    if (this.semanticWordsState.scrollObserver) {
      this.semanticWordsState.scrollObserver.disconnect();
      this.semanticWordsState.scrollObserver = null;
    }

    this.semanticWordsState = {
      allResults: [],
      displayedResults: [],
      displayOffset: 0,
      incrementSize: SEMANTIC_WORDS_INCREMENT_SIZE,
      isLoading: false,
      hasMoreToShow: false,
      searchQuery: '',
      scrollObserver: null
    };

    this.clearAssociatedWordsList();
    this.updateAssociatedCount(0);
  }

  /**
   * Get current semantic words state
   */
  public getSemanticWordsState(): SemanticWordsState {
    return { ...this.semanticWordsState };
  }

  /**
   * Check if there are semantic search results
   */
  public hasResults(): boolean {
    return this.semanticWordsState.allResults.length > 0;
  }

  /**
   * Manual trigger for loading more results (fallback if IntersectionObserver fails)
   */
  public triggerLoadMore(): void {
    if (this.semanticWordsState.hasMoreToShow && !this.semanticWordsState.isLoading) {
      this.loadMoreResults();
    }
  }

  /**
   * Get current loading state for debugging
   */
  public getLoadingState(): any {
    return {
      hasMoreToShow: this.semanticWordsState.hasMoreToShow,
      isLoading: this.semanticWordsState.isLoading,
      displayOffset: this.semanticWordsState.displayOffset,
      totalResults: this.semanticWordsState.allResults.length,
      displayedCount: this.semanticWordsState.displayedResults.length
    };
  }
}