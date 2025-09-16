/**
 * TemplateLoader - Utility for lazy loading HTML templates
 * Provides caching and error handling for dynamic template loading
 */
export class TemplateLoader {
  private static instance: TemplateLoader;
  // `templateCache` holds resolved string data
  private templateCache: Map<string, string> = new Map();
  //`loadingPromises` holds unresolved Promise objects
  private loadingPromises: Map<string, Promise<string>> = new Map();

  private constructor() {}

  static getInstance(): TemplateLoader {
    if (!TemplateLoader.instance) {
      TemplateLoader.instance = new TemplateLoader();
    }
    return TemplateLoader.instance;
  }

  /**
   * Load a template from the templates directory
   * @param templateName - Name of the template file (without .html extension)
   * @param subfolder - Optional subfolder within templates directory
   * @returns Promise resolving to the template HTML string
   */
  async loadTemplate(templateName: string, subfolder: string = 'modals'): Promise<string> {
    // Use consistent cache key format
    const cacheKey = `./templates/${subfolder}/${templateName}.html`;

    // Return cached template if available
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    // Return existing loading promise if template is already being loaded
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    // Start loading the template
    const loadingPromise = this.fetchTemplate(cacheKey);
    this.loadingPromises.set(cacheKey, loadingPromise);

    try {
      const template = await loadingPromise;
      this.templateCache.set(cacheKey, template);
      return template;
    } finally {
      // Clean up the loading promise
      this.loadingPromises.delete(cacheKey);
    }
  }

  /**
   * Fetch template from the file system
   */
  private async fetchTemplate(templatePath: string): Promise<string> {
    try {
      const response = await fetch(templatePath);
      if (!response.ok) {
        throw new Error(`Failed to load template: ${templatePath} (${response.status})`);
      }
      return await response.text();
    } catch (error) {
      console.error(`Error loading template ${templatePath}:`, error);
      throw new Error(`Failed to load template: ${templatePath}`);
    }
  }

  /**
   * Preload multiple templates for better performance
   * @param templateNames - Array of template names to preload
   * @param subfolder - Optional subfolder within templates directory
   */
  async preloadTemplates(templateNames: string[], subfolder: string = 'modals'): Promise<void> {
    const promises = templateNames.map(name => this.loadTemplate(name, subfolder));
    await Promise.all(promises);
  }

  /**
   * Clear the template cache
   * Useful for development or when templates need to be refreshed
   */
  clearCache(): void {
    this.templateCache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { cached: number; loading: number } {
    return {
      cached: this.templateCache.size,
      loading: this.loadingPromises.size
    };
  }

  /**
   * Check if a template is cached
   */
  isCached(templateName: string, subfolder: string = 'modals'): boolean {
    const cacheKey = `./templates/${subfolder}/${templateName}.html`;
    return this.templateCache.has(cacheKey);
  }
}

// Export singleton instance for convenience
export const templateLoader = TemplateLoader.getInstance();
