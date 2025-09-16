import { google } from 'googleapis';
import { OAuth2Client } from 'googleapis-common';
import { BrowserWindow, app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
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
  private oauth2Client: OAuth2Client; // Using 'any' type to avoid type conflicts
  private storeManager: StoreManager;
  private mainWindow: BrowserWindow;
  private authWindow: BrowserWindow | null = null;
  private localServer: http.Server | null = null;
  private credentials: GoogleCredentials | null = null;
  private apiKey: string | undefined;

  constructor(mainWindow: BrowserWindow, storeManager: StoreManager) {
    this.mainWindow = mainWindow;
    this.storeManager = storeManager;

    // Load and cache all credentials once
    this.loadCredentials();

    // Initialize OAuth2 client with Google credentials
    // These should be configured by the user in settings
    const oauthCredentials = this.getOAuthCredentials();
    this.oauth2Client = new google.auth.OAuth2(
      oauthCredentials.clientId,
      oauthCredentials.clientSecret,
      oauthCredentials.redirectUri
    );

    // Load existing tokens if available
    this.loadTokens();
  }

  private getOAuthCredentials(): GoogleCredentials {
    // Always load credentials from credentials.json file (never cache them)
    const fileCredentials = this.loadCredentialsFromFile();
    if (fileCredentials) {
      return fileCredentials;
    }

    // Final fallback to environment variables (for development)
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: 'http://localhost:3000/oauth2callback' // For desktop apps
    };
  }

  private loadCredentials(): void {
    // Use obfuscated credentials for offline functionality
    try {
      const obfuscatedCreds = this.getObfuscatedCredentials();
      this.credentials = obfuscatedCreds.credentials;
      this.apiKey = obfuscatedCreds.apiKey;
    } catch (error) {
      console.error('Failed to load obfuscated credentials:', error);
    }
  }

  private getObfuscatedCredentials(): { credentials: GoogleCredentials; apiKey?: string } {
    try {
      // Path to encrypted credentials file (in app directory)
      const encryptedPath = path.join(app.getAppPath(), 'credentials.enc');

      if (!fs.existsSync(encryptedPath)) {
        throw new Error('Encrypted credentials file not found');
      }

      // Read encrypted file
      const encryptedData = fs.readFileSync(encryptedPath);

      // Decrypt using the same key used for encryption
      const decryptedJson = this.decryptCredentials(encryptedData);
      const credentialsData = JSON.parse(decryptedJson);

      // Extract credentials in the same format as before
      let clientId: string;
      let clientSecret: string;
      let apiKey: string | undefined;

      if (credentialsData.installed) {
        clientId = credentialsData.installed.client_id;
        clientSecret = credentialsData.installed.client_secret;
        apiKey = credentialsData.api_key;
      } else if (credentialsData.client_id && credentialsData.client_secret) {
        clientId = credentialsData.client_id;
        clientSecret = credentialsData.client_secret;
        apiKey = credentialsData.api_key;
      } else {
        throw new Error('Invalid credentials format in encrypted file');
      }

      return {
        credentials: {
          clientId,
          clientSecret,
          redirectUri: 'http://localhost:3000/oauth2callback'
        },
        apiKey
      };
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      throw new Error('Failed to load encrypted credentials');
    }
  }

  private deriveDecryptionKey(): Buffer {
    // Generate the same derived key as encrypt.ts for decryption
    const baseKey = this.getObfuscatedBaseKey();
    const appVersion = app.getVersion();

    // Platform-independent seed: everetch-{version}-secure (matching encrypt.ts)
    const seed = `activebook-${baseKey}-${appVersion}-secure`;

    // Return the derived key as a raw Buffer (SHA256 hash) matching encrypt.ts
    return crypto.createHash('sha256').update(seed).digest();
  }

  private decryptCredentials(encryptedData: Buffer): string {
    // Derive the decryption key (must match the key from encrypt.ts)
    const decryptionKey = this.deriveDecryptionKey();

    try {
      // 1. Extract the IV from the first 16 bytes
      const iv = encryptedData.subarray(0, 16);

      // 2. Extract the actual encrypted content (the rest of the buffer)
      const encryptedContent = encryptedData.subarray(16);

      // 3. Create the decipher
      const decipher = crypto.createDecipheriv('aes-256-cbc', decryptionKey, iv);

      // 4. Decrypt the content
      const decrypted = Buffer.concat([decipher.update(encryptedContent), decipher.final()]);

      // 5. Return the result as a string
      return decrypted.toString('utf8');

    } catch (error) {
      // This error often means the key is wrong or the data is corrupt.
      console.error('Decryption failed. This may be due to a version mismatch or incorrect key.', error);
      throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
  }

  private getObfuscatedBaseKey(): string {
    // Return the app name for platform-independent seed generation
    return 'everetch';
  }

  private loadCredentialsFromFile(): GoogleCredentials | null {
    // Return cached credentials if available
    if (this.credentials) {
      return this.credentials;
    }

    // Fallback: try to load from file (for backward compatibility)
    try {
      const credentialsPath = path.join(app.getAppPath(), 'credentials.json');
      if (!fs.existsSync(credentialsPath)) {
        return null;
      }

      const credentialsContent = fs.readFileSync(credentialsPath, 'utf-8');
      const credentialsData = JSON.parse(credentialsContent);

      // Handle Google Cloud Console credentials format
      if (credentialsData.installed) {
        // For Electron desktop apps, use localhost redirect with local server
        return {
          clientId: credentialsData.installed.client_id,
          clientSecret: credentialsData.installed.client_secret,
          redirectUri: 'http://localhost:3000/oauth2callback'
        };
      }

      // Handle direct format (client_id, client_secret, redirect_uri)
      if (credentialsData.client_id && credentialsData.client_secret) {
        return {
          clientId: credentialsData.client_id,
          clientSecret: credentialsData.client_secret,
          redirectUri: credentialsData.redirect_uri || 'http://localhost:3000/oauth2callback'
        };
      }

      console.warn('Invalid credentials.json format');
      return null;
    } catch (error) {
      console.error('Failed to load credentials from file:', error);
      return null;
    }
  }

  private loadTokens(): void {
    const tokens = this.storeManager.getGoogleTokens();
    if (tokens) {
      console.debug('Loading stored Google tokens:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: new Date(tokens.expiry_date || 0).toISOString(),
        tokenType: tokens.token_type
      });
      this.oauth2Client.setCredentials(tokens);
      console.debug('OAuth2Client credentials set:', {
        hasAccessToken: !!this.oauth2Client.credentials.access_token,
        hasRefreshToken: !!this.oauth2Client.credentials.refresh_token
      });
    } else {
      console.debug('No stored Google tokens found');
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
      let authCompleted = false; // ← Flag to prevent false rejection

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

      // Start local HTTP server to handle OAuth callback
      this.startLocalServer((code: string) => {
        authCompleted = true; // ← Mark as completed to prevent false rejection

        this.exchangeCodeForTokens(code)
          .then(async () => {
            // Add a small delay to ensure OAuth2 client processes tokens
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify that authentication is working
            const isAuthenticated = await this.isAuthenticated();
            if (isAuthenticated) {
              this.stopLocalServer();
              this.authWindow?.close();
              resolve(true);
            } else {
              this.stopLocalServer();
              this.authWindow?.close();
              reject(new Error('Authentication verification failed'));
            }
          })
          .catch((error) => {
            this.stopLocalServer();
            this.authWindow?.close();
            reject(error);
          });
      }, (error) => {
        // ← Close window immediately on server error
        console.error('Server error during OAuth:', error);
        this.authWindow?.close();
        this.authWindow = null;
        this.stopLocalServer();
        reject(error);
      });

      this.authWindow.loadURL(authUrl);
      this.authWindow.show();

      // ← FIXED: Only reject on real failures, not success redirects
      this.authWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        // Don't reject if auth already completed successfully
        if (!authCompleted) {
          console.error('Auth window failed to load:', errorDescription);
          this.authWindow?.close();
          reject(new Error(`Authentication window failed: ${errorDescription}`));
        }
      });

      // Handle window close
      this.authWindow.on('closed', () => {
        this.authWindow = null;
        this.stopLocalServer();
        if (!authCompleted && !this.oauth2Client.credentials.access_token) {
          resolve(false); // User cancelled authentication
        }
      });
    });
  }

  private startLocalServer(onCodeReceived: (code: string) => void, onError: (error: any) => void): void {
    this.localServer = http.createServer((req, res) => {
      if (req.url?.startsWith('/oauth2callback')) {
        const url = new URL(req.url, 'http://localhost:3000');
        const code = url.searchParams.get('code');

        if (code) {
          // Send success response to browser
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #4CAF50;">Authentication Successful!</h1>
                <p>You can close this window and return to the application.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);

          onCodeReceived(code);
        } else {
          // Send error response
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #f44336;">Authentication Failed</h1>
                <p>No authorization code received.</p>
              </body>
            </html>
          `);

          onError(new Error('No authorization code received'));
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.localServer.listen(3000, 'localhost', () => {
      console.debug('Local OAuth server listening on http://localhost:3000');
    });

    this.localServer.on('error', (error) => {
      console.error('Local server error:', error);
      onError(error);
    });
  }

  private stopLocalServer(): void {
    if (this.localServer) {
      this.localServer.close();
      this.localServer = null;
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

  getOAuth2Client(): any {
    return this.oauth2Client;
  }

  getCredentials(): GoogleCredentials | null {
    return this.credentials;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
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
