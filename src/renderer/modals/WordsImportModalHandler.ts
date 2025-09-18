import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';
import { WordsImportCompleteModalHandler } from './WordsImportCompleteModalHandler.js';
import { WordsImportProgressModalHandler } from './WordsImportProgressModalHandler.js';
import { WordImportService, ImportProgress, ImportCallbacks } from '../services/WordImportService.js';
import { readFileContent } from '../utils/Common.js';


export class WordsImportModalHandler extends ModalHandler {
  // Import functionality - simplified to use WordImportService state
  private selectedWordsFile: File | null = null;
  private hasListenCanceled: boolean = false;
  private wordImportService: WordImportService;
  private wordsImportComplete: WordsImportCompleteModalHandler;
  private wordsImportProgress: WordsImportProgressModalHandler;
  constructor(uiUtils: UIUtils,
    toastManager: ToastManager,
    wordImportService: WordImportService,
    wordsImportComplete: WordsImportCompleteModalHandler,
    wordsImportProgress: WordsImportProgressModalHandler
  ) {
    super(uiUtils, toastManager);
    this.wordImportService = wordImportService;
    this.wordsImportComplete = wordsImportComplete;
    this.wordsImportProgress = wordsImportProgress;
  }

  protected setupCustomEvent(): void {
    // Set up custom event listener
    if (!this.hasListenCanceled) {
      document.addEventListener('cancel-words-import-progress', (event: any) => {
        this.cancelImportWords();
      });
    }
  }

  // Word import modal methods
  async show(): Promise<void> {
    const templateLoaded = await this.ensureTemplateLoaded('import-words-modal', 'import-words-modal');
    if (!templateLoaded) return;

    this.showModal('import-words-modal');
  }

  hide(): void {
    this.hideModal('import-words-modal');
  }

  protected setupModalEvent(): void {
    // Import words modal buttons
    const selectFileBtn = document.getElementById('select-import-file') as HTMLButtonElement;
    const startImportBtn = document.getElementById('start-import-btn') as HTMLButtonElement;

    if (selectFileBtn && !selectFileBtn._listenerAdded) {
      selectFileBtn._listenerAdded = true;
      selectFileBtn.addEventListener('click', () => {
        this.selectImportWordsFile();
      });
    }

    if (startImportBtn && !startImportBtn._listenerAdded) {
      startImportBtn._listenerAdded = true;
      startImportBtn.addEventListener('click', () => {
        this.startImportWords();
      });
    }

    const closeImportModalBtn = document.getElementById('close-import-modal') as HTMLButtonElement;
    if (closeImportModalBtn && !closeImportModalBtn._listenerAdded) {
      closeImportModalBtn._listenerAdded = true;
      closeImportModalBtn.addEventListener('click', () => this.hide());
    }

    if (!this.hasListenCanceled) {
      this.setupCustomEvent();
    }    
  }

  private sendLoadWordsEvent(): void {
    // Trigger the load words event
    const event = new CustomEvent('load-words', {
    });
    document.dispatchEvent(event);
  }


  private selectImportWordsFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.csv';
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        this.selectedWordsFile = file;
        this.updateImportWordsUI();
      }
    };
    input.click();
  }

  private updateImportWordsUI(): void {
    const fileNameElement = document.getElementById('import-file-name') as HTMLElement;
    const startBtn = document.getElementById('start-import-btn') as HTMLButtonElement;

    if (fileNameElement && startBtn) {
      if (this.selectedWordsFile) {
        fileNameElement.textContent = this.selectedWordsFile.name;
        startBtn.disabled = false;
      } else {
        fileNameElement.textContent = 'No file selected';
        startBtn.disabled = true;
      }
    }
  }

  private async startImportWords(): Promise<void> {
    if (!this.selectedWordsFile) {
      return;
    }

    try {
      const content = await readFileContent(this.selectedWordsFile);
      await this.wordsImportProgress.show();

      // Get the update existing checkbox state
      const updateExistingCheckbox = document.getElementById('update-existing-words') as HTMLInputElement;
      const updateExisting = updateExistingCheckbox ? updateExistingCheckbox.checked : false;

      const callbacks: ImportCallbacks = {
        onProgress: (progress: ImportProgress) => {
          this.updateImportWordsProgress(progress);
        },
        onComplete: (progress: ImportProgress) => {
          this.handleImportWordsComplete(progress);
        },
        onError: (progress: ImportProgress) => {
          this.handleImportWordsError(progress);
        },
        onCancel: (progress: ImportProgress) => {
          this.handleImportWordsCancel(progress);
        },
      };

      await this.wordImportService.startImport(content, callbacks, updateExisting);
    } catch (error) {
      console.error('Error starting import:', error);
      this.showError('Failed to start import');
    }
  }

  private cancelImportWords(): void {
    this.wordImportService.cancelImport();
  }

  private updateImportWordsProgress(progress: ImportProgress): void {
    const progressText = document.getElementById('import-progress-text')!;
    const progressBar = document.getElementById('import-progress-bar') as HTMLDivElement;

    if (progressText) {
      progressText.textContent = `${progress.current}/${progress.total} - ${progress.currentWord || 'Processing...'}`;
    }

    if (progressBar) {
      const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
      progressBar.style.width = `${percentage}%`;
    }
  }

  private async handleImportWordsComplete(progress: ImportProgress): Promise<void> {
    await this.wordsImportProgress.hide();

    await this.wordsImportComplete.show();

    // Show completion modal
    const messageElement = document.getElementById('import-complete-message')!;
    const titleElement = document.getElementById('import-complete-title') as HTMLElement;
    const iconContainer = document.getElementById('import-complete-icon') as HTMLElement;
    const okBtn = document.getElementById('import-complete-ok') as HTMLButtonElement;

    if (okBtn && !okBtn._listenerAdded) {
      okBtn.addEventListener('click', () => {
        this.wordsImportComplete.hide();
      });
    }

    // Reset icon to default success icon
    if (iconContainer) {
      iconContainer.innerHTML = `
        <svg class="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M5 13l4 4L19 7"></path>
        </svg>
      `;
    }

    // Set title based on whether there were any errors or remaining words
    const hasErrors = (progress.errors?.length || 0) > 0;
    const hasRemaining = ((progress.total || 0) - (progress.current || 0)) > 0;
    const isPartialSuccess = hasErrors || hasRemaining;

    if (titleElement) {
      titleElement.textContent = isPartialSuccess ? 'Import Complete - Partial Success' : 'Import Complete!';
    }

    if (messageElement) {
      // Show the result of progress
      messageElement.innerHTML = this.getImportWordsProgressHtml(progress);
    }

    // Refresh word list
    this.sendLoadWordsEvent();
  }

  private async handleImportWordsError(progress: ImportProgress): Promise<void> {
    await this.wordsImportProgress.hide();

    // If we have progress info and at least one word was successfully imported, reload the word list
    if (progress && progress.success > 0) {
      console.log(`Import failed but ${progress.success} words were successfully imported. Reloading word list...`);
      this.sendLoadWordsEvent();
    }

    // Show detailed completion modal instead of simple toast
    await this.showImportWordsErrorModal(progress);
  }

  private async handleImportWordsCancel(progress: ImportProgress): Promise<void> {
    await this.wordsImportProgress.hide();

    // If we have progress info and at least one word was successfully imported, reload the word list
    if (progress && progress.success > 0) {
      console.log(`Import cancelled but ${progress.success} words were successfully imported. Reloading word list...`);
      this.sendLoadWordsEvent();
    }

    //this.toastManager.showWarning('Import cancelled');
    await this.showImportWordsCancelModal(progress);
  }

  private async showImportWordsCancelModal(progress: ImportProgress): Promise<void> {
    await this.wordsImportComplete.show();

    // Show completion modal
    const messageElement = document.getElementById('import-complete-message')!;
    const iconContainer = document.getElementById('import-complete-icon') as HTMLElement;
    const titleElement = document.getElementById('import-complete-title') as HTMLElement;
    const okBtn = document.getElementById('import-complete-ok') as HTMLButtonElement;

    if (okBtn && !okBtn._listenerAdded) {
      okBtn.addEventListener('click', () => {
        this.wordsImportComplete.hide();
      });
    }

    if (messageElement && iconContainer && titleElement) {
      // Change icon to neutral notification for user cancellation
      iconContainer.innerHTML = `
        <svg class="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      `;

      // Update title for partial success
      titleElement.textContent = 'Import Canceled - Partial Success';

      // Update message for partial success
      messageElement.innerHTML = this.getImportWordsProgressHtml(progress);
    }
  }

  private async showImportWordsErrorModal(progress: ImportProgress): Promise<void> {
    await this.wordsImportComplete.show();

    const messageElement = document.getElementById('import-complete-message')!;
    const iconContainer = document.getElementById('import-complete-icon') as HTMLElement;
    const titleElement = document.getElementById('import-complete-title') as HTMLElement;
    const okBtn = document.getElementById('import-complete-ok') as HTMLButtonElement;

    if (okBtn && !okBtn._listenerAdded) {
      okBtn.addEventListener('click', () => {
        this.wordsImportComplete.hide();
      });
    }

    if (messageElement && iconContainer && titleElement) {
      // Change icon to warning for partial success
      iconContainer.innerHTML = `
        <svg class="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
      `;

      // Update title for partial success
      titleElement.textContent = 'Import Stopped - Partial Success';

      // Update message for partial success
      messageElement.innerHTML = this.getImportWordsProgressHtml(progress);
    }
  }

  private getImportWordsProgressHtml(progress: ImportProgress): string {
    // Calculate statistics
    const successfulCount = progress.success || 0;
    const failedCount = progress.errors?.length || 0;
    const skippedCount = progress.skipped || 0;
    const remainingCount = (progress.total || 0) - (progress.current || 0);
    const failedWord = progress.currentWord || 'unknown word';

    // Build detailed message
    let html = `<div class="text-left space-y-2">`;

    if (successfulCount > 0) {
      html += `<div class="flex text-green-600">
          <svg class="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="font-medium text-center flex-1">${successfulCount} words successfully imported</span>
        </div>`;
    }

    if (skippedCount > 0) {
      html += `<div class="flex text-blue-600">
          <svg class="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
          </svg>
          <span class="font-medium text-center flex-1">${skippedCount} words were skipped (already exist)</span>
        </div>`;
    }

    if (failedCount > 0) {
      const error = progress.errors?.[0] || 'Unknown error';
      html += `<div class="flex text-red-600">
          <svg class="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
          <span class="font-medium text-center flex-1">Failed on "${failedWord}": ${error}</span>
        </div>`;
    }

    if (remainingCount > 0) {
      html += `<div class="flex text-amber-600">
          <svg class="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span class="font-medium text-center flex-1">${remainingCount} words remaining unprocessed</span>
        </div>`;
    }

    html += `</div>`;
    return html;
  }



  private setupImportWordsProgressModalHandlers(): void {
    const cancelImportProgressBtn = document.getElementById('cancel-import-btn') as HTMLButtonElement;
    if (cancelImportProgressBtn && !cancelImportProgressBtn._listenerAdded) {
      cancelImportProgressBtn._listenerAdded = true;
      cancelImportProgressBtn.addEventListener('click', () => {
        this.cancelImportWords();
      });
    }
  }


}