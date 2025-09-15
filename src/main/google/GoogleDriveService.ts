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
  private everEtchFolderId: string | null = null;

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



  async listFiles(query?: string, pageSize: number = 100): Promise<DriveFile[]> {
    try {
      // Ensure we're authenticated before making API calls
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        throw new Error('Not authenticated with Google. Please authenticate first.');
      }

      const requestParams: any = {
        q: query || "name contains 'EverEtch' and mimeType='application/octet-stream' and trashed=false",
        fields: 'files(id,name,mimeType,modifiedTime,size,parents)',
        orderBy: 'modifiedTime desc',
        pageSize: pageSize
      };

      // Add API key if available (helps with "unregistered callers" issues)
      const apiKey = this.authService.getApiKey();
      if (apiKey) {
        requestParams.key = apiKey;
      }

      const response = await this.getDriveClient().files.list(requestParams);

      // Return all files - let calling code handle any permission errors
      return response.data.files?.map(file => ({
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        modifiedTime: file.modifiedTime!,
        size: file.size,
        parents: file.parents
      })) || [];
    } catch (error) {
      console.error('Failed to list files:', error);
      throw new Error('Failed to list Google Drive files');
    }
  }

  async uploadFile(
    fileName: string,
    content: string,
    mimeType: string = 'application/json',
    folderId?: string
  ): Promise<UploadResult> {
    try {
      // Ensure we're authenticated before making API calls
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        return {
          success: false,
          message: 'Not authenticated with Google. Please authenticate first.'
        };
      }

      const fileMetadata: any = {
        name: fileName,
        mimeType: mimeType
      };

      if (folderId) {
        fileMetadata.parents = [folderId];
      }

      const media = {
        mimeType: mimeType,
        body: content
      };

      // Create new file (Google Drive will handle duplicates by creating new versions)
      const createParams: any = {
        requestBody: fileMetadata,
        media: media,
        fields: 'id,webViewLink'
      };
      const apiKey = this.authService.getApiKey();
      if (apiKey) {
        createParams.key = apiKey;
      }

      const response = await this.getDriveClient().files.create(createParams);

      return {
        success: true,
        fileId: response.data.id!,
        fileUrl: response.data.webViewLink!,
        fileName: response.data.name || fileName,
        fileSize: response.data.size || '0',
        message: 'File uploaded successfully'
      };
    } catch (error) {
      console.error('Failed to upload file:', error);
      return {
        success: false,
        message: `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async downloadFile(fileId: string): Promise<DownloadResult> {
    try {
      // Ensure we're authenticated before making API calls
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        return {
          success: false,
          message: 'Not authenticated with Google. Please authenticate first.'
        };
      }

      const response = await this.getDriveClient().files.get({
        fileId: fileId,
        alt: 'media'
      }, {
        responseType: 'text'
      });

      return {
        success: true,
        content: response.data as string,
        message: 'File downloaded successfully'
      };
    } catch (error) {
      console.error('Failed to download file:', error);
      return {
        success: false,
        message: `Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async createFolder(folderName: string, parentId?: string): Promise<string | null> {
    try {
      // Ensure we're authenticated before making API calls
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        return null;
      }

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
    } catch (error) {
      console.error('Failed to create folder:', error);
      return null;
    }
  }

  async getOrCreateFolder(folderName: string, parentId?: string): Promise<string | null> {
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
      // Ensure we're authenticated before making API calls
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        return false;
      }

      await this.getDriveClient().files.delete({
        fileId: fileId
      });
      return true;
    } catch (error) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }

  async getFileMetadata(fileId: string): Promise<DriveFile | null> {
    try {
      // Ensure we're authenticated before making API calls
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        return null;
      }

      const response = await this.getDriveClient().files.get({
        fileId: fileId,
        fields: 'id,name,mimeType,modifiedTime,size,parents'
      });

      const file = response.data;
      return {
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        modifiedTime: file.modifiedTime!,
        size: file.size,
        parents: file.parents
      };
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      return null;
    }
  }

  /**
   * Get or create the "EverEtch Profiles" folder
   */
  async getOrCreateEverEtchFolder(): Promise<string | null> {
    try {
      // Return cached folder ID if available
      if (this.everEtchFolderId) {
        return this.everEtchFolderId;
      }

      // Ensure we're authenticated
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        throw new Error('Not authenticated with Google. Please authenticate first.');
      }

      // Check if folder already exists
      const existingFolders = await this.listFiles(
        `name='EverEtch Profiles' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      );

      if (existingFolders.length > 0) {
        this.everEtchFolderId = existingFolders[0].id;
        return this.everEtchFolderId;
      }

      // Create new folder
      const folderId = await this.createFolder('EverEtch Profiles');
      if (folderId) {
        this.everEtchFolderId = folderId;
      }
      return folderId;
    } catch (error) {
      console.error('Failed to get or create EverEtch folder:', error);
      return null;
    }
  }

  /**
   * List files in the EverEtch Profiles folder
   */
  async listFilesInEverEtchFolder(pageSize: number = 100): Promise<DriveFile[]> {
    try {
      const folderId = await this.getOrCreateEverEtchFolder();
      if (!folderId) {
        throw new Error('Could not access EverEtch Profiles folder');
      }

      return await this.listFilesInFolder(folderId, pageSize);
    } catch (error) {
      console.error('Failed to list files in EverEtch folder:', error);
      throw new Error('Failed to list Google Drive files');
    }
  }

  /**
   * List files in a specific folder
   */
  async listFilesInFolder(folderId: string, pageSize: number = 100): Promise<DriveFile[]> {
    try {
      // Ensure we're authenticated before making API calls
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        throw new Error('Not authenticated with Google. Please authenticate first.');
      }

      const requestParams: any = {
        q: `'${folderId}' in parents and mimeType='application/octet-stream' and trashed=false`,
        fields: 'files(id,name,mimeType,modifiedTime,size,parents)',
        orderBy: 'modifiedTime desc',
        pageSize: pageSize
      };

      // Add API key if available (helps with "unregistered callers" issues)
      const apiKey = this.authService.getApiKey();
      if (apiKey) {
        requestParams.key = apiKey;
      }

      const response = await this.getDriveClient().files.list(requestParams);

      // Return all files - let calling code handle any permission errors
      return response.data.files?.map(file => ({
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        modifiedTime: file.modifiedTime!,
        size: file.size,
        parents: file.parents
      })) || [];
    } catch (error) {
      console.error('Failed to list files in folder:', error);
      throw new Error('Failed to list Google Drive files');
    }
  }

  /**
   * Upload file to the EverEtch Profiles folder
   */
  async uploadFileToEverEtchFolder(
    fileName: string,
    content: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<UploadResult> {
    try {
      const folderId = await this.getOrCreateEverEtchFolder();
      if (!folderId) {
        return {
          success: false,
          message: 'Could not access EverEtch Profiles folder'
        };
      }

      return await this.uploadFile(fileName, content, mimeType, folderId);
    } catch (error) {
      console.error('Failed to upload file to EverEtch folder:', error);
      return {
        success: false,
        message: `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
