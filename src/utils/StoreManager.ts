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

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
}

interface StoreSchema {
  windowBounds: WindowBounds | null;
  panelWidths: PanelWidths | null;
  sortOrder: 'asc' | 'desc' | null;
  googleCredentials: GoogleCredentials | null;
  googleTokens: GoogleTokens | null;
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
        },
        sortOrder: {
          type: ['string', 'null'],
          enum: ['asc', 'desc', null]
        },
        googleCredentials: {
          type: ['object', 'null'],
          properties: {
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            redirectUri: { type: 'string' }
          }
        },
        googleTokens: {
          type: ['object', 'null'],
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            expiry_date: { type: 'number' },
            token_type: { type: 'string' }
          }
        }
      },
      defaults: {
        windowBounds: null,
        panelWidths: null,
        sortOrder: 'desc',
        googleCredentials: null,
        googleTokens: null
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
   * Save sort order
   */
  saveSortOrder(sortOrder: 'asc' | 'desc'): void {
    this.store.set('sortOrder', sortOrder);
  }

  /**
   * Load sort order
   */
  loadSortOrder(): 'asc' | 'desc' {
    return this.store.get('sortOrder') || 'desc';
  }

  /**
   * Clear all UI state
   */
  clearUIState(): void {
    this.store.set('windowBounds', null);
    this.store.set('panelWidths', null);
    this.store.set('sortOrder', 'desc');
  }

  /**
   * Save Google credentials
   */
  saveGoogleCredentials(credentials: GoogleCredentials): void {
    this.store.set('googleCredentials', credentials);
  }

  /**
   * Load Google credentials
   */
  getGoogleCredentials(): GoogleCredentials | null {
    return this.store.get('googleCredentials');
  }

  /**
   * Save Google tokens
   */
  saveGoogleTokens(tokens: GoogleTokens): void {
    this.store.set('googleTokens', tokens);
  }

  /**
   * Load Google tokens
   */
  getGoogleTokens(): GoogleTokens | null {
    return this.store.get('googleTokens');
  }

  /**
   * Clear Google tokens
   */
  clearGoogleTokens(): void {
    this.store.set('googleTokens', null);
  }

  /**
   * Clear Google credentials
   */
  clearGoogleCredentials(): void {
    this.store.set('googleCredentials', null);
  }

  /**
   * Get the underlying store instance (for advanced operations)
   */
  getStore(): Store<StoreSchema> {
    return this.store;
  }
}
