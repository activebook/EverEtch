import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { BrowserWindow } from 'electron';
import { StoreManager } from '../../utils/StoreManager.js';

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
}

export class GoogleAuthService {
  private oauth2Client: OAuth2Client;
  private storeManager: StoreManager;
  private mainWindow: BrowserWindow;
  private authWindow: BrowserWindow | null = null;

  constructor(mainWindow: BrowserWindow, storeManager: StoreManager) {
    this.mainWindow = mainWindow;
    this.storeManager = storeManager;

    // Initialize OAuth2 client with Google credentials
    // These should be configured by the user in settings
    const credentials = this.getCredentials();
    this.oauth2Client = new OAuth2Client(
      credentials.clientId,
      credentials.clientSecret,
      credentials.redirectUri
    );

    // Load existing tokens if available
    this.loadTokens();
  }

  private getCredentials(): GoogleCredentials {
    // Get credentials from store, with defaults for development
    const stored = this.storeManager.getGoogleCredentials();
    return stored || {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: 'urn:ietf:wg:oauth:2.0:oob' // For desktop apps
    };
  }

  private loadTokens(): void {
    const tokens = this.storeManager.getGoogleTokens();
    if (tokens) {
      this.oauth2Client.setCredentials(tokens);
    }
  }

  private saveTokens(tokens: TokenData): void {
    this.storeManager.saveGoogleTokens(tokens);
    this.oauth2Client.setCredentials(tokens);
  }

  async authenticate(): Promise<boolean> {
    try {
      // Check if we already have valid tokens
      if (await this.isAuthenticated()) {
        return true;
      }

      // Generate authentication URL
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive.metadata.readonly'
        ],
        prompt: 'consent' // Force consent screen to get refresh token
      });

      // Create authentication window
      return await this.performOAuthFlow(authUrl);
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error('Failed to authenticate with Google');
    }
  }

  private async performOAuthFlow(authUrl: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Create auth window
      this.authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        },
        parent: this.mainWindow,
        modal: true,
        title: 'Google Authentication'
      });

      this.authWindow.loadURL(authUrl);
      this.authWindow.show();

      // Handle navigation events to capture the authorization code
      this.authWindow.webContents.on('will-navigate', async (event, url) => {
        if (url.startsWith('urn:ietf:wg:oauth:2.0:oob')) {
          event.preventDefault();
          const code = this.extractCodeFromUrl(url);
          if (code) {
            try {
              await this.exchangeCodeForTokens(code);
              this.authWindow?.close();
              resolve(true);
            } catch (error) {
              this.authWindow?.close();
              reject(error);
            }
          }
        }
      });

      // Handle window close
      this.authWindow.on('closed', () => {
        this.authWindow = null;
        if (!this.oauth2Client.credentials.access_token) {
          resolve(false); // User cancelled authentication
        }
      });
    });
  }

  private extractCodeFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('code');
    } catch {
      return null;
    }
  }

  private async exchangeCodeForTokens(code: string): Promise<void> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.saveTokens(tokens as TokenData);
    } catch (error) {
      console.error('Failed to exchange code for tokens:', error);
      throw new Error('Failed to obtain access tokens');
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      if (!this.oauth2Client.credentials.access_token) {
        return false;
      }

      // Check if token is expired
      const now = Date.now();
      const expiry = this.oauth2Client.credentials.expiry_date || 0;

      if (now >= expiry - 60000) { // Refresh if expires within 1 minute
        await this.refreshAccessToken();
      }

      return true;
    } catch (error) {
      console.error('Authentication check failed:', error);
      return false;
    }
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      if (!this.oauth2Client.credentials.refresh_token) {
        throw new Error('No refresh token available');
      }

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.saveTokens(credentials as TokenData);
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      // Clear invalid tokens
      this.storeManager.clearGoogleTokens();
      throw new Error('Failed to refresh authentication');
    }
  }

  async logout(): Promise<void> {
    this.storeManager.clearGoogleTokens();
    this.oauth2Client.setCredentials({});
  }

  getOAuth2Client(): OAuth2Client {
    return this.oauth2Client;
  }

  async getUserInfo(): Promise<any> {
    try {
      const oauth2 = google.oauth2({
        version: 'v2',
        auth: this.oauth2Client
      } as any);
      const response = await oauth2.userinfo.get();
      return response.data;
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw new Error('Failed to get user information');
    }
  }
}
