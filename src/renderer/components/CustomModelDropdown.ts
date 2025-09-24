import { ModelMemo } from "../types.js";


export class CustomModelDropdown {
  //private static instance: CustomModelDropdown | null = null;
  private dropdownElement: HTMLElement | null = null;
  private anchorElement: HTMLElement | null = null;
  private dropdownId: string;
  private onModelSelected?: (modelName: string) => Promise<boolean>;
  private onModelDeleted?: (modelName: string) => Promise<boolean>;
  private onModelSaved?: () => Promise<boolean>;

  constructor(dropdownId: string = 'custom-model-dropdown') {
    this.dropdownId = dropdownId;
  }

  // static getInstance(): CustomModelDropdown {
  //   if (!CustomModelDropdown.instance) {
  //     CustomModelDropdown.instance = new CustomModelDropdown();
  //   }
  //   return CustomModelDropdown.instance;
  // }

  show(models: ModelMemo[], anchorElement: HTMLElement, callbacks: {
    onModelSelected?: (modelName: string) => Promise<boolean>;
    onModelDeleted?: (modelName: string) => Promise<boolean>;
    onModelSaved?: () => Promise<boolean>;
  }): void {
    this.onModelSelected = callbacks.onModelSelected;
    this.onModelDeleted = callbacks.onModelDeleted;
    this.onModelSaved = callbacks.onModelSaved;
    this.anchorElement = anchorElement;

    // Hide existing dropdown
    this.hide();

    // Create and show new dropdown
    this.createDropdown(models, anchorElement);

    // Reset select model
    this.resetSelectModel();
  }

  hide(): void {
    if (this.dropdownElement) {
      this.dropdownElement.remove();
      this.dropdownElement = null;
    }
    // Don't lose anchor reference
    // Until the next time set new anchor reference
    //this.anchorElement = null;
  }

  private createDropdown(models: ModelMemo[], anchorElement: HTMLElement): void {
    try {
      // Sort models by last used (most recent first)
      const sortedModels = models.sort((a, b) => {
        const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return bTime - aTime;
      });

      // Create dropdown container
      this.dropdownElement = document.createElement('div');
      this.dropdownElement.id = this.dropdownId;
      this.dropdownElement.className = 'absolute z-50 mt-1 w-full bg-white border border-amber-200 rounded-lg shadow-lg max-h-60 overflow-y-auto';

      // Add model items
      sortedModels.forEach(model => {
        const item = this.createModelItem(model);
        this.dropdownElement!.appendChild(item);
      });

      // Add "Save Current" option at the bottom
      const saveItem = this.createSaveItem();
      this.dropdownElement!.appendChild(saveItem);

      // Position dropdown below the anchor
      const rect = anchorElement.getBoundingClientRect();
      this.dropdownElement.style.position = 'fixed';
      this.dropdownElement.style.top = `${rect.bottom + 2}px`;
      this.dropdownElement.style.left = `${rect.left}px`;
      this.dropdownElement.style.width = `${rect.width}px`;
      this.dropdownElement.style.zIndex = '9999';

      // Add to DOM
      document.body.appendChild(this.dropdownElement);

      // Focus on the dropdown for better accessibility
      this.dropdownElement.focus();

      // Setup click outside to close
      this.setupClickOutsideHandler(anchorElement);

    } catch (error) {
      console.error('Error creating custom dropdown:', error);
    }
  }

  private createModelItem(model: any): HTMLElement {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between px-3 py-2 hover:bg-amber-50 cursor-pointer border-b border-amber-100 last:border-b-0';

    // Model name (clickable)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'flex-1 text-slate-700 truncate';
    nameSpan.textContent = model.name;

    // Let entire item clickable 
    item.addEventListener('click', () => {
      this.handleModelSelection(model.name);
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ml-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors';
    deleteBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    `;
    deleteBtn.title = 'Delete model';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleModelDeletion(model.name);
    });

    item.appendChild(nameSpan);
    item.appendChild(deleteBtn);

    return item;
  }

  private createSaveItem(): HTMLElement {
    const saveItem = document.createElement('div');
    saveItem.className = 'flex items-center px-3 py-2 hover:bg-green-50 cursor-pointer border-t border-amber-200 bg-green-25';

    const saveIcon = document.createElement('span');
    saveIcon.className = 'mr-2 text-green-600 font-bold';
    saveIcon.textContent = '+';

    const saveText = document.createElement('span');
    saveText.className = 'text-green-700 font-medium';
    saveText.textContent = 'Save Current Model';

    saveItem.appendChild(saveIcon);
    saveItem.appendChild(saveText);
    saveItem.addEventListener('click', () => {
      this.handleModelSave();
    });

    return saveItem;
  }

  private setupClickOutsideHandler(anchorElement: HTMLElement): void {
    const closeDropdown = (e: MouseEvent) => {
      if (this.dropdownElement &&
        !this.dropdownElement.contains(e.target as Node)) {
        this.hide();
        document.removeEventListener('click', closeDropdown);
      }
    };

    // Use requestAnimationFrame to ensure DOM is updated before adding listener
    requestAnimationFrame(() => {
      document.addEventListener('click', closeDropdown, { once: true });
    });
  }

  private async handleModelSelection(modelName: string): Promise<void> {
    if (this.onModelSelected) {
      const ok = await this.onModelSelected(modelName);
      if (ok && this.anchorElement) {
        // Update button display text with truncation
        const selectedModelText = this.anchorElement.querySelector('#selected-model-text') as HTMLElement;
        if (selectedModelText) {
          const rect = selectedModelText.getBoundingClientRect();

          // Truncate long model names to fit within the constrained width
          const maxLength = 25;
          const displayText = modelName.length > maxLength
            ? modelName.substring(0, maxLength) + '...'
            : modelName;

          selectedModelText.textContent = displayText;
          selectedModelText.title = modelName; // Show full name on hover

          // Set the width to match the original text width
          // So it won't push aside other components
          selectedModelText.style.width = `${rect.width}px`;
        }
      }
    }

    this.hide();
  }

  private async handleModelDeletion(modelName: string): Promise<void> {
    // Notify deletion
    if (this.onModelDeleted) {
      const ok = await this.onModelDeleted(modelName);
      // Clear the selected model text if it was the deleted model
      if (ok) {
        this.resetSelectModel(modelName);
      }
    }
  }

  private async handleModelSave(): Promise<void> {
    // Notify save
    if (this.onModelSaved) {
      await this.onModelSaved();
    }
  }

  resetSelectModel(modelName?: string): void {
    // Early return if anchorElement or querySelector fails
    if (!this.anchorElement) return;

    const selectedModelText = this.anchorElement.querySelector('#selected-model-text') as HTMLElement | null;
    if (!selectedModelText) return;

    // Safely get and clean the current text
    const currentText = (selectedModelText.textContent?.replace(/\.\.\./g, '') || '').trim();

    // If modelName is not provided, always reset
    if (!modelName) {
      selectedModelText.textContent = 'Select a model...';
      selectedModelText.title = '';
      return;
    }

    // Compare cleaned currentText with modelName (case-insensitive, partial match allowed)
    const isMatch = currentText.length > 0 &&
      (modelName.toLowerCase().includes(currentText.toLowerCase()) ||
        currentText.toLowerCase().includes(modelName.toLowerCase()));

    if (isMatch) {
      selectedModelText.textContent = 'Select a model...';
      selectedModelText.title = '';
    }
  }
}
