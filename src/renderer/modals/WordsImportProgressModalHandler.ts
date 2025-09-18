import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';

export class WordsImportProgressModalHandler extends ModalHandler {
    constructor(uiUtils: UIUtils, toastManager: ToastManager) {
        super(uiUtils, toastManager);
    }

    async show(): Promise<void> {
        
        const templateLoaded = await this.ensureTemplateLoaded('import-words-progress-overlay', 'import-words-progress-overlay');
        if (!templateLoaded) return;
        this.showModal('import-words-progress-overlay');
    }

    hide(): void {
        this.hideModal('import-words-progress-overlay');
    }

    protected setupModalEvent(): void {
        const cancelImportProgressBtn = document.getElementById('cancel-import-btn') as HTMLButtonElement;
        if (cancelImportProgressBtn && !cancelImportProgressBtn._listenerAdded) {
            cancelImportProgressBtn._listenerAdded = true;
            cancelImportProgressBtn.addEventListener('click', () => {
                this.hide();

                // Trigger the words import progress event
                const event = new CustomEvent('cancel-words-import-progress', {
                });
                document.dispatchEvent(event);
            });
        }
    }

}