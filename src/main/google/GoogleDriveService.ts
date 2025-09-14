import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
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
  message: string;
}

export interface DownloadResult {
  success: boolean;
  content?: string;
  message: string;
}

export class GoogleDriveService {
  private drive: drive_v3.Drive;
  private authService: GoogleAuthService;

  constructor(authService: GoogleAuthService) {
    this.authService = authService;
    this.drive = google.drive({
      version: 'v3',
      auth: authService.getOAuth2Client()
    } as any) as unknown as drive_v3.Drive;
  }

  async listFiles(query?: string, pageSize: number = 100): Promise<DriveFile[]> {
    try {
      const response = await this.drive.files.list({
        q: query || "name contains 'EverEtch' and mimeType='application/octet-stream' and trashed=false",
        fields: 'files(id,name,mimeType,modifiedTime,size,parents)',
        orderBy: 'modifiedTime desc',
        pageSize: pageSize
      });

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
      // Check if file already exists
      const existingFiles = await this.listFiles(`name='${fileName}' and trashed=false`);
      const existingFile = existingFiles.find(f => f.name === fileName);

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

      let response;
      if (existingFile) {
        // Update existing file
        response = await this.drive.files.update({
          fileId: existingFile.id,
          media: media,
          fields: 'id,webViewLink'
        });
      } else {
        // Create new file
        response = await this.drive.files.create({
          requestBody: fileMetadata,
          media: media,
          fields: 'id,webViewLink'
        });
      }

      return {
        success: true,
        fileId: response.data.id!,
        fileUrl: response.data.webViewLink!,
        message: existingFile ? 'File updated successfully' : 'File uploaded successfully'
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
      const response = await this.drive.files.get({
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
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined
      };

      const response = await this.drive.files.create({
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
      await this.drive.files.delete({
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
      const response = await this.drive.files.get({
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
}
