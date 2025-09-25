import { UIUtils } from '../utils/UIUtils.js';
import { ToastManager } from '../components/ToastManager.js';
import { templateLoader } from '../utils/TemplateLoader.js';

/**
 * Base interface for all modal handlers
 */

export interface ModalHandlerBase {
    show(): Promise<void>;
    hide(): void;
}

abstract class ModalEventHanlder {
    protected abstract ensureTemplateLoaded(templateName: string, modalId: string): Promise<boolean>;
    protected abstract showModal(modalId: string): void;
    protected abstract hideModal(modalId: string): void;
    protected abstract setupModalEvent(): void;
    protected abstract showError(message: string): void;
    protected abstract showSuccess(message: string): void;
}

export abstract class ModalHandler extends ModalEventHanlder implements ModalHandlerBase {
    private uiUtils: UIUtils;
    private toastManager: ToastManager;
    private static loadedTemplates: Set<string> = new Set();

    constructor(uiUtils: UIUtils, toastManager: ToastManager) {
        super();
        this.uiUtils = uiUtils;
        this.toastManager = toastManager;
    }
    show(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    hide(): void {
        throw new Error('Method not implemented.');
    }

    /**
     * Ensure a modal template is loaded before showing the modal
     */
    protected async ensureTemplateLoaded(templateName: string, modalId: string): Promise<boolean> {
        try {
            // Check if template is already loaded
            if (ModalHandler.loadedTemplates.has(templateName)) {
                return true;
            }

            // Show loading state if modal element doesn't exist
            const existingModal = document.getElementById(modalId);
            if (!existingModal) {
                this.uiUtils.showLoadingOverlay();
            }

            // Load the template
            const templateHtml = await templateLoader.loadTemplate(templateName);

            // Inject the template into the DOM
            const templateContainer = document.createElement('div');
            templateContainer.innerHTML = templateHtml;

            // Append to body
            document.body.appendChild(templateContainer.firstElementChild!);

            // Mark as loaded
            ModalHandler.loadedTemplates.add(templateName);

            // Hide loading overlay
            this.uiUtils.hideLoadingOverlay();

            return true;
        } catch (error) {
            console.error(`Failed to load template ${templateName}:`, error);
            this.uiUtils.hideLoadingOverlay();
            this.toastManager.showError(`Failed to load ${templateName.replace('-', ' ')}`);
            return false;
        }
    }

    /**
     * Show a modal by ID
     */
    protected showModal(modalId: string): void {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');

            // Setup modal event handlers
            this.setupModalEvent();
        }
    }

    /**
     * Hide a modal by ID
     */
    protected hideModal(modalId: string): void {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    protected showError(message: string): void {
        this.toastManager.showError(message);
    }

    protected showSuccess(message: string): void {
        this.toastManager.showSuccess(message);
    }

    protected showInfo(message: string): void {
        this.toastManager.showInfo(message);
    }

    /**
     * Setup event handlers for a modal
     */
    protected setupModalEvent(): void {
        // Implement this method in subclasses
    }
}
