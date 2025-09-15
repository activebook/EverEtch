import { WordListItem, AssociatedWordsState } from '../types.js';
import { WordService } from './WordService.js';
import { ToastManager } from '../components/ToastManager.js';
import { WordRenderer } from '../components/WordRenderer.js';
import { UIUtils } from '../utils/UIUtils.js';

// Constants for pagination
const ASSOCIATED_WORDS_PAGE_SIZE = 10;

export class AssociatedWordsManager {
  private wordService: WordService;
  private toastManager: ToastManager;
  private wordRenderer: WordRenderer;
  private uiUtils: UIUtils;

  // Associated words state
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

  constructor(wordService: WordService, toastManager: ToastManager, wordRenderer: WordRenderer, uiUtils: UIUtils) {
    this.wordService = wordService;
    this.toastManager = toastManager;
    this.wordRenderer = wordRenderer;
    this.uiUtils = uiUtils;
  }

  // Getters for external access
  getAssociatedWordsState(): AssociatedWordsState {
    return this.associatedWordsState;
  }

  getCurrentTag(): string {
    return this.associatedWordsState.currentTag;
  }

  async loadAssociatedWords(tag: string): Promise<void> {
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

  // Clean up observers when switching profiles or resetting UI
  cleanup(): void {
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
      currentTag: '',
      scrollObserver: null
    };
  }
}
