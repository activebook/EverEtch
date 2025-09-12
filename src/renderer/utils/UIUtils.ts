export class UIUtils {
  private isResizing: boolean = false;
  private resizeHandle: HTMLElement | null = null;
  private startX: number = 0;
  private startLeftWidth: number = 0;
  private startMiddleWidth: number = 0;
  private startRightWidth: number = 0;
  private savedPanelWidths: { left: number; middle: number; right: number } | null = null;

  startResize(e: MouseEvent): void {
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

  handleResize(e: MouseEvent): void {
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

  stopResize(): void {
    if (!this.isResizing) return;

    this.isResizing = false;
    this.resizeHandle = null;

    // Restore normal cursor and text selection
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    // Save panel widths after resize
    this.savePanelWidths();
  }

  updateWordCount(count: number): void {
    const wordCountElement = document.getElementById('word-count') as HTMLElement;
    if (wordCountElement) {
      wordCountElement.textContent = count.toString();
    }
  }

  updateAssociatedCount(count: number): void {
    const associatedCountElement = document.getElementById('associated-count') as HTMLElement;
    if (associatedCountElement) {
      associatedCountElement.textContent = count.toString();
    }
  }

  scrollToWord(wordId: string): void {
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

  updateWordInList(wordId: string, updatedWord: any): void {
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

  clearWordDetails(): void {
    const wordDetails = document.getElementById('word-details')!;
    wordDetails.innerHTML = `
      <div class="text-center text-slate-500 mt-8">
        Select a word or enter a new one to get started
      </div>
    `;
  }

  clearSuggestions(): void {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.innerHTML = '';
    this.hideSuggestions();
  }

  showSuggestions(): void {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.classList.remove('hidden');
  }

  hideSuggestions(): void {
    const suggestionsDiv = document.getElementById('suggestions')!;
    suggestionsDiv.classList.add('hidden');
  }

  toggleInlineActions(): void {
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

  expandMoreActions(): void {
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

  collapseMoreActions(): void {
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

  // Panel width persistence methods
  async loadPanelWidths(): Promise<void> {
    try {
      const panelWidths = await (window as any).electronAPI.loadPanelWidths();
      if (panelWidths) {
        this.savedPanelWidths = panelWidths;
        this.applySavedPanelWidths();
      }
    } catch (error) {
      console.error('Error loading panel widths from store:', error);
    }
  }

  private applySavedPanelWidths(): void {
    if (!this.savedPanelWidths) return;

    const leftPanel = document.getElementById('left-panel') as HTMLElement;
    const middlePanel = document.getElementById('middle-panel') as HTMLElement;
    const rightPanel = document.getElementById('right-panel') as HTMLElement;

    if (leftPanel && middlePanel && rightPanel) {
      leftPanel.style.width = `${this.savedPanelWidths.left}%`;
      middlePanel.style.width = `${this.savedPanelWidths.middle}%`;
      rightPanel.style.width = `${this.savedPanelWidths.right}%`;
    }
  }

  private async savePanelWidths(): Promise<void> {
    try {
      const leftPanel = document.getElementById('left-panel') as HTMLElement;
      const middlePanel = document.getElementById('middle-panel') as HTMLElement;
      const rightPanel = document.getElementById('right-panel') as HTMLElement;

      if (!leftPanel || !middlePanel || !rightPanel) return;

      const mainContent = document.getElementById('main-content') as HTMLElement;
      if (!mainContent) return;

      const mainRect = mainContent.getBoundingClientRect();
      const panelWidths = {
        left: (leftPanel.offsetWidth / mainRect.width) * 100,
        middle: (middlePanel.offsetWidth / mainRect.width) * 100,
        right: (rightPanel.offsetWidth / mainRect.width) * 100
      };

      // Only save if widths have actually changed
      if (!this.savedPanelWidths ||
          Math.abs(this.savedPanelWidths.left - panelWidths.left) > 0.1 ||
          Math.abs(this.savedPanelWidths.middle - panelWidths.middle) > 0.1 ||
          Math.abs(this.savedPanelWidths.right - panelWidths.right) > 0.1) {

        await (window as any).electronAPI.savePanelWidths(panelWidths);
        this.savedPanelWidths = panelWidths;
      }
    } catch (error) {
      console.error('Error saving panel widths to store:', error);
    }
  }
}
