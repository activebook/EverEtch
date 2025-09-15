import { google } from 'googleapis';
import { drive_v3 } from 'googleapis';
import { GoogleAuthService } from './GoogleAuthService.js';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string | null;
  parents?: string[] | null;
}

export interface UploadResult {
  success: boolean;
  fileId?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  message: string;
}

export interface DownloadResult {
  success: boolean;
  content?: string;
  message: string;
}

export class GoogleDriveService {
  private authService: GoogleAuthService;

  constructor(authService: GoogleAuthService) {
    this.authService = authService;
  }

  private getDriveClient(): drive_v3.Drive {
    // Create drive client with current OAuth2Client state
    // This ensures we always use the most up-to-date authentication
    const authClient = this.authService.getOAuth2Client();

    // Pass the authenticated client directly with proper typing
    return google.drive({
      version: 'v3',
      auth: authClient
    });
  }

  /**
   * Ensure user is authenticated, throw error if not
   */
  private async ensureAuthenticated(): Promise<void> {
    const isAuthenticated = await this.authService.isAuthenticated();
    if (!isAuthenticated) {
      throw new Error('Not authenticated with Google. Please authenticate first.');
    }
  }

  /**
   * Add API key to request parameters if available
   */
  private addApiKey(params: any): void {
    const apiKey = this.authService.getApiKey();
    if (apiKey) {
      params.key = apiKey;
    }
  }

  /**
   * Map Google Drive API file object to our DriveFile interface
   */
  private mapDriveFile(file: any): DriveFile {
    return {
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      modifiedTime: file.modifiedTime!,
      size: file.size,
      parents: file.parents
    };
  }

  /**
   * Create base request parameters with common fields
   */
  private createBaseRequestParams(): any {
    return {
      fields: 'files(id,name,mimeType,modifiedTime,size,parents)',
      orderBy: 'modifiedTime desc'
    };
  }

  /**
   * Execute a request with consistent error handling and authentication
   */
  private async executeRequest<T>(
    operation: () => Promise<T>,
    errorMessage: string = 'Operation failed'
  ): Promise<T> {
    try {
      await this.ensureAuthenticated();
      return await operation();
    } catch (error) {
      console.error(`Google Drive ${errorMessage}:`, error);
      throw new Error(`${errorMessage}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }



  async listFiles(query?: string, pageSize: number = 100): Promise<DriveFile[]> {
    return this.executeRequest(async () => {
      const requestParams = {
        ...this.createBaseRequestParams(),
        q: query || "name contains 'EverEtch' and mimeType='application/octet-stream' and trashed=false",
        pageSize
      };

      this.addApiKey(requestParams);

      const response = await this.getDriveClient().files.list(requestParams);
      return response.data.files?.map(file => this.mapDriveFile(file)) || [];
    }, 'Failed to list files');
  }

  async uploadFile(
    fileName: string,
    content: Buffer | string,    
    folderId?: string,
    mimeType?: string
  ): Promise<UploadResult> {
    try {
      return await this.executeRequest(async () => {
        // Auto-detect MIME type based on content type if not provided
        const detectedMimeType = mimeType || (Buffer.isBuffer(content) ? 'application/octet-stream' : 'application/json');

        const fileMetadata: any = {
          name: fileName,
          mimeType: detectedMimeType
        };

        if (folderId) {
          fileMetadata.parents = [folderId];
        }

        // Convert content to base64 if it's a Buffer
        const contentString = Buffer.isBuffer(content) ? content.toString('base64') : content;

        const media = {
          mimeType: detectedMimeType,
          body: contentString
        };

        // Create new file (Google Drive will handle duplicates by creating new versions)
        const createParams: any = {
          requestBody: fileMetadata,
          media: media,
          fields: 'id,webViewLink'
        };

        this.addApiKey(createParams);
        const response = await this.getDriveClient().files.create(createParams);

        return {
          success: true,
          fileId: response.data.id!,
          fileUrl: response.data.webViewLink!,
          fileName: response.data.name || fileName,
          fileSize: response.data.size || '0',
          message: 'File uploaded successfully'
        };
      }, 'Failed to upload file');
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async downloadFile(fileId: string): Promise<DownloadResult> {
    try {
      return await this.executeRequest(async () => {
        const response = await this.getDriveClient().files.get({
          fileId: fileId,
          alt: 'media'
        }, {
          responseType: 'text'
        });

        // response.data is base64 encoded, so we need to decode it
        return {
          success: true,
          content: response.data as string,
          message: 'File downloaded successfully'
        };
      }, 'Failed to download file');
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async createFolder(folderName: string, parentId?: string): Promise<string | null> {
    try {
      return await this.executeRequest(async () => {
        const fileMetadata = {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: parentId ? [parentId] : undefined
        };

        const response = await this.getDriveClient().files.create({
          requestBody: fileMetadata,
          fields: 'id'
        });

        return response.data.id || null;
      }, 'Failed to create folder');
    } catch (error) {
      return null;
    }
  }

  async getFolder(folderName: string, parentId?: string): Promise<string | null> {
    try {
      // Check if folder already exists
      const existingFolders = await this.listFiles(
        `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      );

      if (existingFolders.length > 0) {
        return existingFolders[0].id;
      }

      // Create new folder
      return await this.createFolder(folderName, parentId);
    } catch (error) {
      console.error('Failed to get or create folder:', error);
      return null;
    }
  }

  async deleteFile(fileId: string): Promise<boolean> {
    try {
      await this.executeRequest(async () => {
        await this.getDriveClient().files.delete({
          fileId: fileId
        });
        return true;
      }, 'Failed to delete file');
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFileMetadata(fileId: string): Promise<DriveFile | null> {
    try {
      return await this.executeRequest(async () => {
        const response = await this.getDriveClient().files.get({
          fileId: fileId,
          fields: 'id,name,mimeType,modifiedTime,size,parents'
        });

        return this.mapDriveFile(response.data);
      }, 'Failed to get file metadata');
    } catch (error) {
      return null;
    }
  }

  /**
   * List files in a specific folder
   */
  async listFilesInFolder(folderId: string, pageSize: number = 100): Promise<DriveFile[]> {
    return this.executeRequest(async () => {
      const requestParams = {
        ...this.createBaseRequestParams(),
        q: `'${folderId}' in parents and mimeType='application/octet-stream' and trashed=false`,
        pageSize
      };

      this.addApiKey(requestParams);
      const response = await this.getDriveClient().files.list(requestParams);
      return response.data.files?.map(file => this.mapDriveFile(file)) || [];
    }, 'Failed to list files in folder');
  }
}
