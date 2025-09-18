import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { ModalHandler } from './ModalHandler.js';

export class WordsImportCompleteModalHandler extends ModalHandler {
    constructor(uiUtils: UIUtils, toastManager: ToastManager) {
        super(uiUtils, toastManager);
    }

    async show(): Promise<void> {
        const templateLoaded = await this.ensureTemplateLoaded('import-words-complete-modal', 'import-words-complete-modal');
        if (!templateLoaded) return;
        this.showModal('import-words-complete-modal');
    }

    hide(): void {
        this.hideModal('import-words-complete-modal');
    }

    protected setupModalEvent(): void {
        const importCompleteOkBtn = document.getElementById('import-complete-ok') as HTMLButtonElement;
        if (importCompleteOkBtn && !importCompleteOkBtn._listenerAdded) {
            importCompleteOkBtn._listenerAdded = true;
            importCompleteOkBtn.addEventListener('click', () => this.hide());
        }
    }
}