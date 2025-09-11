export class LocalStorageManager {
  private static readonly WINDOW_BOUNDS_KEY = 'window-bounds';
  private static readonly PANEL_WIDTHS_KEY = 'panel-widths';

  /**
   * Save window bounds to localStorage
   */
  static saveWindowBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    try {
      localStorage.setItem(this.WINDOW_BOUNDS_KEY, JSON.stringify(bounds));
    } catch (error) {
      console.error('Error saving window bounds to localStorage:', error);
    }
  }

  /**
   * Load window bounds from localStorage
   */
  static loadWindowBounds(): { x: number; y: number; width: number; height: number } | null {
    try {
      const data = localStorage.getItem(this.WINDOW_BOUNDS_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading window bounds from localStorage:', error);
      return null;
    }
  }

  /**
   * Save panel widths to localStorage
   */
  static savePanelWidths(widths: { left: number; middle: number; right: number }): void {
    try {
      localStorage.setItem(this.PANEL_WIDTHS_KEY, JSON.stringify(widths));
    } catch (error) {
      console.error('Error saving panel widths to localStorage:', error);
    }
  }

  /**
   * Load panel widths from localStorage
   */
  static loadPanelWidths(): { left: number; middle: number; right: number } | null {
    try {
      const data = localStorage.getItem(this.PANEL_WIDTHS_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading panel widths from localStorage:', error);
      return null;
    }
  }

  /**
   * Clear all UI state from localStorage
   */
  static clearUIState(): void {
    try {
      localStorage.removeItem(this.WINDOW_BOUNDS_KEY);
      localStorage.removeItem(this.PANEL_WIDTHS_KEY);
    } catch (error) {
      console.error('Error clearing UI state from localStorage:', error);
    }
  }

  /**
   * Check if localStorage is available
   */
  static isAvailable(): boolean {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }
}
