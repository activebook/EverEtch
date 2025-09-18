import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';


export class HelpModalHandler extends ModalHandler {
  constructor(uiUtils: UIUtils, toastManager: ToastManager) {
    super(uiUtils, toastManager);    
  }

  /**
   * Show the howto modal with help content
   */
  async show(): Promise<void> {
    // Ensure template is loaded
    const templateLoaded = await this.ensureTemplateLoaded('howto-modal', 'howto-modal');
    if (!templateLoaded) return;

    try {
      // Load markdown content from assets/howto.md
      const response = await fetch('../../assets/howto.md');
      if (!response.ok) {
        throw new Error(`Failed to load howto.md: ${response.status}`);
      }

      const markdown = await response.text();

      // Convert markdown to HTML using the existing IPC method
      const htmlContent = await window.electronAPI.processMarkdown(markdown);

      // Insert into modal
      const contentDiv = document.getElementById('howto-content')!;
      contentDiv.innerHTML = htmlContent;

      // Show modal
      this.showModal('howto-modal');
    } catch (error) {
      console.error('Error loading howto content:', error);
      this.showError('Failed to load help content');
    }
  }

  /**
   * Hide the howto modal
   */
  hide(): void {
    this.hideModal('howto-modal');
  }

  /**
   * Setup event handlers for the howto modal
   */
  protected setupModalEvent(): void {
    const closeHowtoBtn = document.getElementById('close-howto-btn') as HTMLButtonElement;
    if (closeHowtoBtn && !closeHowtoBtn._listenerAdded) {
      closeHowtoBtn._listenerAdded = true;
      closeHowtoBtn.addEventListener('click', (event) => {
        event.preventDefault();
        this.hide();
      });
    }
  }
}
