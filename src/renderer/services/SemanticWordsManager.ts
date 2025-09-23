import { WordListItem } from '../types.js';
import { WordRenderer } from '../components/WordRenderer.js';
import { ToastManager } from '../components/ToastManager.js';
import { UIUtils } from '../utils/UIUtils.js';

// Constants for pagination
const SEMANTIC_WORDS_PAGE_SIZE = 10;

export interface SemanticSearchResult {
  word: WordListItem;
  similarity: number;
}

export interface SemanticWordsState {
  results: SemanticSearchResult[];
  currentPage: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  hasMore: boolean;
  searchQuery: string;
}

export class SemanticWordsManager {
  private wordRenderer: WordRenderer;
  private toastManager: ToastManager;
  private uiUtils: UIUtils;

  // Semantic words state
  private semanticWordsState: SemanticWordsState = {
    results: [],
    currentPage: 0,
    pageSize: SEMANTIC_WORDS_PAGE_SIZE,
    totalPages: 0,
    isLoading: false,
    hasMore: false,
    searchQuery: ''
  };

  constructor(wordRenderer: WordRenderer, toastManager: ToastManager, uiUtils: UIUtils) {
    this.wordRenderer = wordRenderer;
    this.toastManager = toastManager;
    this.uiUtils = uiUtils;
  }

  /**
   * Set semantic search results and initialize pagination
   */
  public setSearchResults(query: string, results: SemanticSearchResult[]): void {
    
    // Record all search results && Update state
    this.semanticWordsState = {
      results,
      currentPage: 0,
      pageSize: SEMANTIC_WORDS_PAGE_SIZE,
      totalPages: Math.ceil(results.length / SEMANTIC_WORDS_PAGE_SIZE),
      isLoading: false,
      hasMore: results.length > SEMANTIC_WORDS_PAGE_SIZE,
      searchQuery: query
    };

    // Clear associated words list and display semantic search results
    this.clearAssociatedWordsList();
    this.displayCurrentPage();
    this.updateAssociatedCount(results.length);
  }

  /**
   * Display current page of semantic search results
   */
  private displayCurrentPage(): void {
    const startIndex = this.semanticWordsState.currentPage * this.semanticWordsState.pageSize;
    const endIndex = startIndex + this.semanticWordsState.pageSize;
    const currentPageResults = this.semanticWordsState.results.slice(startIndex, endIndex);

    // Convert to WordListItem format for rendering
    const wordListItems: WordListItem[] = currentPageResults.map((result, index) => (
      result.word
    ));

    // Render the current page
    this.wordRenderer.renderAssociatedWordListIncremental(wordListItems);

    // Add pagination controls if needed
    this.addPaginationControls();
  }

  /**
   * Add pagination controls to the associated words list
   */
  private addPaginationControls(): void {
    const associatedList = document.getElementById('associated-list');
    if (!associatedList) return;

    // Remove existing pagination controls
    const existingControls = associatedList.querySelector('.semantic-pagination-controls');
    if (existingControls) {
      existingControls.remove();
    }

    // Add pagination controls if there are multiple pages
    if (this.semanticWordsState.totalPages > 1) {
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'semantic-pagination-controls flex justify-between items-center mt-4 p-2 bg-slate-50 rounded-lg';

      controlsDiv.innerHTML = `
        <div class="flex items-center space-x-2">
          <button id="semantic-prev-page" class="px-3 py-1 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            ${this.semanticWordsState.currentPage === 0 ? 'disabled' : ''}>
            Previous
          </button>
          <span class="text-sm text-slate-600">
            Page ${this.semanticWordsState.currentPage + 1} of ${this.semanticWordsState.totalPages}
          </span>
          <button id="semantic-next-page" class="px-3 py-1 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            ${!this.semanticWordsState.hasMore || this.semanticWordsState.currentPage >= this.semanticWordsState.totalPages - 1 ? 'disabled' : ''}>
            Next
          </button>
        </div>
        <div class="text-xs text-slate-500">
          ${this.semanticWordsState.results.length} results for "${this.semanticWordsState.searchQuery}"
        </div>
      `;

      // Add event listeners
      const prevBtn = controlsDiv.querySelector('#semantic-prev-page') as HTMLButtonElement;
      const nextBtn = controlsDiv.querySelector('#semantic-next-page') as HTMLButtonElement;

      prevBtn.addEventListener('click', () => this.previousPage());
      nextBtn.addEventListener('click', () => this.nextPage());

      associatedList.appendChild(controlsDiv);
    }
  }

  /**
   * Navigate to previous page
   */
  public previousPage(): void {
    if (this.semanticWordsState.currentPage > 0) {
      this.semanticWordsState.currentPage--;
      this.clearAssociatedWordsList();
      this.displayCurrentPage();
    }
  }

  /**
   * Navigate to next page
   */
  public nextPage(): void {
    if (this.semanticWordsState.currentPage < this.semanticWordsState.totalPages - 1) {
      this.semanticWordsState.currentPage++;
      this.clearAssociatedWordsList();
      this.displayCurrentPage();
    }
  }

  /**
   * Clear the associated words list
   */
  private clearAssociatedWordsList(): void {
    const associatedList = document.getElementById('associated-list');
    if (associatedList) {
      associatedList.innerHTML = '';
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
    this.semanticWordsState = {
      results: [],
      currentPage: 0,
      pageSize: SEMANTIC_WORDS_PAGE_SIZE,
      totalPages: 0,
      isLoading: false,
      hasMore: false,
      searchQuery: ''
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
    return this.semanticWordsState.results.length > 0;
  }
}