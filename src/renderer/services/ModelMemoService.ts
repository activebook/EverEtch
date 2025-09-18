import { ModelMemo } from '../../utils/ModelManager.js';

export class ModelMemoService {
    /**
     * Load all model memos from the main process
     */
    async loadModelMemos(): Promise<ModelMemo[]> {
        try {
            const result = await window.electronAPI.loadModelMemos();
            return result || [];
        } catch (error) {
            console.error('Error loading model memos:', error);
            return [];
        }
    }

    /**
     * Add a new model memo
     */
    async addModelMemo(memo: Omit<ModelMemo, 'createdAt'>): Promise<{ success: boolean; message?: string; model?: ModelMemo }> {
        try {
            // Auto-generate model name from endpoint domain + model name
            const memoName = this.generateModelMemoName(memo.endpoint, memo.model);
            memo.name = memoName;
            return await window.electronAPI.addModelMemo(memo);
        } catch (error) {
            console.error('Error adding model memo:', error);
            return { success: false, message: 'Failed to save model configuration' };
        }
    }

    /**
     * Get a specific model memo by ID
     */
    async getModelMemo(name: string): Promise<{ success: boolean; message?: string; model?: ModelMemo }> {
        try {
            return await window.electronAPI.getModelMemo(name);
        } catch (error) {
            console.error('Error getting model memo:', error);
            return { success: false, message: 'Failed to load model configuration' };
        }
    }

    /**
     * Delete a model memo
     */
    async deleteModelMemo(name: string): Promise<{ success: boolean; message?: string }> {
        try {
            return await window.electronAPI.deleteModelMemo(name);
        } catch (error) {
            console.error('Error deleting model memo:', error);
            return { success: false, message: 'Failed to delete model configuration' };
        }
    }

    /**
     * Mark a model as used (update lastUsed timestamp)
     */
    async markModelUsed(name: string): Promise<boolean> {
        try {
            return await window.electronAPI.markModelUsed(name);
        } catch (error) {
            console.error('Error marking model as used:', error);
            return false;
        }
    }

    /**
     * Get models sorted by last used (most recent first)
     */
    async getModelsSorted(): Promise<ModelMemo[]> {
        try {
            const models = await this.loadModelMemos();
            return models.sort((a, b) => {
                const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
                const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
                return bTime - aTime;
            });
        } catch (error) {
            console.error('Error getting sorted models:', error);
            return [];
        }
    }

    private generateModelMemoName(endpoint: string, model: string): string {
        try {
            // Extract domain from endpoint URL (only main domain, not subdomain)
            const url = new URL(endpoint);
            const hostname = url.hostname.replace(/^api\./, '').replace(/^www\./, '');

            // Get only the main domain name (remove subdomains and TLD)
            const domainParts = hostname.split('.');
            let domain = hostname;

            // Handle different domain structures
            if (domainParts.length >= 2) {
                // For domains like api.groq.com -> groq
                // For domains like groq.com -> groq
                // For domains like sub.groq.com -> groq
                if (domainParts.length === 2) {
                    domain = domainParts[0]; // groq.com -> groq
                } else if (domainParts.length === 3) {
                    domain = domainParts[1]; // api.groq.com -> groq
                } else {
                    // For longer domains, take the second-to-last part
                    domain = domainParts[domainParts.length - 2];
                }
            }

            // Process model name: replace '/' with '_'
            const processedModel = model.replace(/\//g, '_');

            // Combine domain + processed model name
            return `${domain}_${processedModel}`;
        } catch (error) {
            // Fallback if URL parsing fails
            const processedModel = model.replace(/\//g, '_');
            return `custom_${processedModel}`;
        }
    }
}
