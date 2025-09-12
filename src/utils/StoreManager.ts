import Store from 'electron-store';

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PanelWidths {
  left: number;
  middle: number;
  right: number;
}

interface StoreSchema {
  windowBounds: WindowBounds | null;
  panelWidths: PanelWidths | null;
}

export class StoreManager {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'ui-settings',
      schema: {
        windowBounds: {
          type: ['object', 'null'],
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' }
          }
        },
        panelWidths: {
          type: ['object', 'null'],
          properties: {
            left: { type: 'number' },
            middle: { type: 'number' },
            right: { type: 'number' }
          }
        }
      },
      defaults: {
        windowBounds: null,
        panelWidths: null
      }
    }) as Store<StoreSchema>;
  }

  /**
   * Save window bounds
   */
  saveWindowBounds(bounds: WindowBounds): void {
    this.store.set('windowBounds', bounds);
  }

  /**
   * Load window bounds
   */
  loadWindowBounds(): WindowBounds | null {
    return this.store.get('windowBounds');
  }

  /**
   * Save panel widths
   */
  savePanelWidths(widths: PanelWidths): void {
    this.store.set('panelWidths', widths);
  }

  /**
   * Load panel widths
   */
  loadPanelWidths(): PanelWidths | null {
    return this.store.get('panelWidths');
  }

  /**
   * Clear all UI state
   */
  clearUIState(): void {
    this.store.set('windowBounds', null);
    this.store.set('panelWidths', null);
  }

  /**
   * Get the underlying store instance (for advanced operations)
   */
  getStore(): Store<StoreSchema> {
    return this.store;
  }
}