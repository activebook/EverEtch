import { app, BrowserWindow, ipcMain, dialog, screen, protocol } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { SysProxy } from './utils/SysProxy.js';
import { Utils } from './utils/Utils.js';
import { StoreManager } from './utils/StoreManager.js';
import { DatabaseManager } from './database/DatabaseManager.js';
import { ProfileManager } from './database/ProfileManager.js';
import { ModelManager } from './utils/ModelManager.js';
import { AIModelClient, WORD_DUMMY_METAS } from './ai/AIModelClient.js';
import { EmbeddingModelClient } from './ai/EmbeddingModelClient.js';
import { GoogleAuthService } from './service/google/GoogleAuthService.js';
import { GoogleDriveService } from './service/google/GoogleDriveService.js';
import { ImportExportService } from './service/common/ImportExportService.js';
import { SemanticBatchService } from './semantic/SemanticBatchService.js';
import { SemanticSearchService } from './semantic/SemanticSearchService.js';
import { marked } from 'marked';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Application constants
const EVERETCH_FOLDER_NAME = 'EverEtch Profiles';

let mainWindow: BrowserWindow;
let dbManager: DatabaseManager;
let profileManager: ProfileManager;
let aiClient: AIModelClient;
let embeddingClient: EmbeddingModelClient;
let storeManager: StoreManager;
let googleAuthService: GoogleAuthService;
let googleDriveService: GoogleDriveService;
let importExportService: ImportExportService;
let semanticBatchService: SemanticBatchService;
let semanticSearchService: SemanticSearchService;
let queuedProtocolAction: { type: string, data: any } | null = null; // Store queued protocol actions

// Configure marked for proper line break handling
marked.setOptions({
  breaks: true, // Convert line breaks to <br> tags
  gfm: true,    // Enable GitHub Flavored Markdown
});

// Register custom protocol scheme BEFORE app is ready
try {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'everetch', privileges: { bypassCSP: true, standard: true, secure: true, supportFetchAPI: true } }
  ]);
} catch (error) {
  console.error('Failed to register protocol scheme:', error);
}

// Test logging functionality
Utils.setDebugMode(false);
Utils.clearDebugLog();
Utils.logToFile('EverEtch app starting up');


async function createWindow() {
  try {
    // Initialize managers first to get profile config
    dbManager = new DatabaseManager();
    profileManager = new ProfileManager(dbManager);
    aiClient = new AIModelClient();
    embeddingClient = new EmbeddingModelClient();

    // Create window with minimal bounds first (invisible), then apply saved bounds
    mainWindow = new BrowserWindow({
      width: 1200, height: 800,
      minWidth: 800,
      minHeight: 600,
      show: false, // Don't show until bounds are applied
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Initialize Google services AFTER mainWindow is created
    storeManager = new StoreManager();
    googleAuthService = new GoogleAuthService(mainWindow, storeManager);
    googleDriveService = new GoogleDriveService(googleAuthService);
    importExportService = new ImportExportService(dbManager, profileManager);
    semanticBatchService = new SemanticBatchService(dbManager, profileManager);
    semanticSearchService = new SemanticSearchService(dbManager, profileManager);

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    // Apply saved window bounds
    adjustMainWindow(() => {
      // Callback function after window is ready
      // Set up proxy environment variables
      SysProxy.apply();
    }, () => { });

    if (process.env.NODE_ENV === 'development') {
      // Open DevTools(cmd + alt + i)
      // mainWindow.webContents.openDevTools();
    }
  } catch (error) {
    console.error('Error in createWindow():', error);
  }
}

function adjustMainWindow(ready: () => void, shown: () => void) {
  // Load and apply window bounds after the window is ready to show
  mainWindow.once('ready-to-show', () => {
    // ✅ HTML is loaded
    // ✅ Window can be displayed
    // ✅ But not yet visible to user
    try {
      // Load window bounds from electron-store
      const savedBounds = storeManager.loadWindowBounds();

      if (savedBounds) {
        // Validate bounds are reasonable
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

        // Ensure window is not too small and fits on screen
        const validatedBounds: { width: number; height: number; x?: number; y?: number } = {
          width: Math.max(800, Math.min(savedBounds.width, screenWidth)),
          height: Math.max(600, Math.min(savedBounds.height, screenHeight))
        };

        // Check if saved position is valid
        if (savedBounds.x >= 0 && savedBounds.y >= 0 &&
          savedBounds.x < screenWidth - 100 && savedBounds.y < screenHeight - 100) {
          validatedBounds.x = savedBounds.x;
          validatedBounds.y = savedBounds.y;
        }

        // Apply the validated bounds
        mainWindow.setBounds(validatedBounds);

        ready();
      }
    } catch (error) {
      console.error('Error loading window bounds:', error);
    }

    // Show the window after bounds are applied
    mainWindow.show();

    // Call the provided callback
    mainWindow.on('show', () => {
      // ✅ Window is already shown/visible
      // ✅ Safe to send IPC messages
      // ✅ Safe to interact with window
      shown();
    });

  });

  // Set up window event listeners for saving bounds
  let saveTimeout: NodeJS.Timeout;
  const saveWindowBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    try {
      const bounds = mainWindow.getBounds();
      // Save window bounds to electron-store
      storeManager.saveWindowBounds(bounds);
    } catch (error) {
      console.error('Error saving window bounds:', error);
    }
  };

  // Debounced save on resize/move
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWindowBounds, 500);
  };

  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);

  // Save immediately when window is closed (but don't block the close)
  mainWindow.on('close', async () => {
    clearTimeout(saveTimeout);
    try {
      await saveWindowBounds();
    } catch (error) {
      // Silently ignore errors during window close to prevent crashes
      console.debug('Window bounds save failed during close (expected):', error);
    }
  });
}

// Handle protocol URL processing
function handleProtocolUrl(url: string) {
  Utils.logToFile(`🎯 Processing protocol URL: ${url}`);

  try {
    // Remove the protocol prefix to get the path
    const urlWithoutProtocol = url.replace('everetch://', '');
    const urlParts = urlWithoutProtocol.split('/');

    // Check if window is already loaded and showing
    const isWindowReady = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();

    Utils.logToFile(`🎯 Window ready? ${isWindowReady}`);
    Utils.logToFile(`🎯 URL parts: ${JSON.stringify(urlParts)}`);

    // Handle different protocol actions
    if (urlParts.length === 1 && (urlParts[0] === '' || urlParts[0] === 'open')) {
      Utils.logToFile('🎯 Handling: Open app');
      if (isWindowReady) {
        mainWindow.focus();
        Utils.logToFile('✅ App focused');
      }
      return;
    }

    if (urlParts.length >= 2 && urlParts[0] === 'word') {
      // Join all parts after 'word' and decode
      const wordName = decodeURIComponent(urlParts.slice(1).join('/'));
      Utils.logToFile(`🎯 Handling: Navigate to word "${wordName}"`);

      if (isWindowReady) {
        Utils.logToFile('🎯 Sending IPC message to renderer');
        mainWindow.webContents.send('protocol-navigate-word', wordName);
        mainWindow.focus();
        Utils.logToFile('✅ IPC message sent and window focused');
      } else {
        Utils.logToFile('⚠️ Window not ready, queuing navigation');
        // Queue the action for when window is ready
        queuedProtocolAction = { type: 'word', data: wordName };
      }
      return;
    }

    if (urlParts.length >= 2 && urlParts[0] === 'profile') {
      // Join all parts after 'profile' and decode
      const profileName = decodeURIComponent(urlParts.slice(1).join('/'));
      Utils.logToFile(`🎯 Handling: Switch to profile "${profileName}"`);

      if (isWindowReady) {
        Utils.logToFile('🎯 Sending IPC message to renderer');
        mainWindow.webContents.send('protocol-switch-profile', profileName);
        mainWindow.focus();
        Utils.logToFile('✅ IPC message sent and window focused');
      } else {
        Utils.logToFile('⚠️ Window not ready, queuing profile switch');
        queuedProtocolAction = { type: 'profile', data: profileName };
      }
      return;
    }

    Utils.logToFile(`⚠️ Unknown protocol action: ${urlWithoutProtocol}`);

  } catch (error) {
    Utils.logToFile(`❌ Error processing protocol URL: ${error}`);
  }
}

// Process queued protocol action when window is ready
function processQueuedProtocolAction() {
  if (!queuedProtocolAction || !mainWindow) return;

  Utils.logToFile(`🎯 Processing queued action: ${queuedProtocolAction.type} - ${queuedProtocolAction.data}`);

  if (queuedProtocolAction.type === 'word') {
    mainWindow.webContents.send('protocol-navigate-word', queuedProtocolAction.data);
    mainWindow.focus();
    Utils.logToFile('✅ Queued word navigation sent');
  } else if (queuedProtocolAction.type === 'profile') {
    mainWindow.webContents.send('protocol-switch-profile', queuedProtocolAction.data);
    mainWindow.focus();
    Utils.logToFile('✅ Queued profile switch sent');
  }

  queuedProtocolAction = null; // Clear the queue
}

// Listen for app-ready signal from renderer
ipcMain.on('app-render-ready', () => {
  Utils.logToFile('🎯 Received app-ready signal from renderer');
  processQueuedProtocolAction();
});

// Handle open-url event for macOS protocol links
app.on('open-url', (event, url) => {
  Utils.logToFile(`🎯 App open-url event received: ${url}`);
  event.preventDefault();

  // Parse the URL and handle it
  if (url.startsWith('everetch://')) {
    handleProtocolUrl(url);
  }
});

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers

ipcMain.handle('load-profiles', async (event) => {
  return await profileManager.loadProfiles();
});

ipcMain.handle('get-profiles', () => {
  return profileManager.getProfiles();
});

ipcMain.handle('get-current-profile-name', () => {
  return profileManager.getLastOpenedProfile();
});

ipcMain.handle('switch-profile', async (event, profileName: string) => {
  return await profileManager.switchProfile(profileName);
});

ipcMain.handle('create-profile', async (event, profileName: string) => {
  return await profileManager.createProfile(profileName);
});

ipcMain.handle('rename-profile', async (event, oldName: string, newName: string) => {
  return await profileManager.renameProfile(oldName, newName);
});

ipcMain.handle('delete-profile', async (event, profileName: string) => {
  return await profileManager.deleteProfile(profileName);
});

ipcMain.handle('get-words-paginated', (event, offset: number, limit: number, sortOrder?: 'asc' | 'desc') => {
  return dbManager.getWordsPaginated(offset, limit, sortOrder);
});

ipcMain.handle('search-words', (event, query: string) => {
  return dbManager.searchWords(query);
});

ipcMain.handle('get-word', (event, wordId: string) => {
  return dbManager.getWord(wordId);
});

ipcMain.handle('get-word-by-name', (event, wordName: string) => {
  return dbManager.getWordByName(wordName);
});

ipcMain.handle('generate-word-meaning', async (event, word: string) => {
  const profile = await profileManager.getCurrentProfile();
  if (!profile) return null;

  // Set up streaming callback to send content to renderer
  const onWordMeaningStreaming = (content: string) => {
    mainWindow.webContents.send('word-meaning-streaming', content);
  };

  const meaning = await aiClient.generateWordMeaning(word, profile, onWordMeaningStreaming);
  return meaning;
});

ipcMain.handle('generate-word-metas', async (event, word: string, meaning: string, generationId: string) => {
  console.debug('🔄 Main process: generate-word-metas called with generationId:', generationId);

  // Defensive check: ensure generationId is valid
  if (!generationId || typeof generationId !== 'string' || generationId.length === 0) {
    console.error('❌ Main process: Invalid generationId received:', generationId);
    const fallbackData = {
      ...WORD_DUMMY_METAS,
      generationId: 'fallback_' + Date.now()
    };
    console.debug('📤 Main process: Sending fallback word metadata with fallback generationId:', fallbackData);
    mainWindow.webContents.send('word-metadata-ready', fallbackData);
    return fallbackData;
  }

  const profile = await profileManager.getCurrentProfile();
  if (!profile) {
    console.debug('❌ Main process: No profile found');
    const fallbackData = {
      ...WORD_DUMMY_METAS,
      generationId: generationId
    };
    console.debug('📤 Main process: Sending fallback word metadata to renderer:', fallbackData);
    mainWindow.webContents.send('word-metadata-ready', fallbackData);
    return fallbackData;
  }

  try {
    console.debug('🚀 Main process: Calling aiClient.generateWordMetas');
    const toolData = await aiClient.generateWordMetas(word, meaning, profile);
    console.debug('✅ Main process: AI client returned:', toolData);

    // Ensure we have valid data to send
    const safeToolData = {
      summary: toolData.summary || `A word: ${word}`,
      tags: toolData.tags || ['general'],
      tag_colors: toolData.tag_colors || { 'general': '#6b7280' },
      synonyms: toolData.synonyms || [],
      antonyms: toolData.antonyms || [],
      generationId: generationId  // Explicitly include generationId
    };

    console.debug('📤 Main process: Sending word metadata to renderer:', safeToolData);
    // Send tool data to renderer
    mainWindow.webContents.send('word-metadata-ready', safeToolData);

    return safeToolData;
  } catch (error) {
    console.error('❌ Main process: Error in generate-word-metas:', error);

    // Send fallback data on error
    const fallbackData = {
      ...WORD_DUMMY_METAS,
      generationId: generationId
    };
    console.debug('📤 Main process: Sending error fallback to renderer:', fallbackData);
    mainWindow.webContents.send('word-metadata-ready', fallbackData);

    return fallbackData;
  }
});

ipcMain.handle('add-word', async (event, wordData: any) => {
  try {
    if (wordData.embedding) {
      // Embedding provided - use transaction
      const profile = await profileManager.getCurrentProfile();
      if (!profile?.embedding_config?.enabled) {
        return {
          success: false,
          error: 'Embedding not enabled for current profile'
        };
      }

      console.log(`🔄 transaction: Add word && embedding: ${wordData.word}`);
      const wordDoc = dbManager.transactionAddWord(wordData, wordData.embedding, profile);
      return { success: true, data: wordDoc };

    } else {
      // No embedding - use regular add
      const wordDoc = dbManager.addWord(wordData);
      if (wordDoc) {
        return { success: true, data: wordDoc };
      } else {
        return { success: false, error: 'Failed to add word' };
      }
    }
  } catch (error) {
    console.error(`Failed to add word ${wordData.word}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
});

ipcMain.handle('update-word', async (event, wordId: string, wordData: any) => {
  try {
    const profile = await profileManager.getCurrentProfile();

    if (wordData.embedding) {
      // Embedding provided - use transaction
      if (!profile?.embedding_config?.enabled) {
        return {
          success: false,
          error: 'Embedding not enabled for current profile'
        };
      }

      console.log(`🔄 Transaction: Update word and embedding: ${wordId}`);
      const wordDoc = dbManager.transactionUpdateWord(wordId, wordData, wordData.embedding, profile);
      return { success: true, data: wordDoc };

    } else {
      // No embedding - use regular update
      const wordDoc = dbManager.updateWord(wordId, wordData);
      if (wordDoc) {
        return { success: true, data: wordDoc };
      } else {
        return { success: false, error: 'Word not found' };
      }
    }
  } catch (error) {
    console.error(`Failed to update word ${wordId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
});

ipcMain.handle('update-word-remark', async (event, wordId: string, remark: string) => {
  try {
    const wordDoc = dbManager.updateWord(wordId, { remark });
    if (wordDoc) {
      return { success: true, data: wordDoc };
    } else {
      return { success: false, error: 'Word not found' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
});

ipcMain.handle('delete-word', async (event, wordId: string) => {
  try {
    const profile = await profileManager.getCurrentProfile();

    // Use transactional delete if embedding is enabled
    if (profile?.embedding_config?.enabled) {
      console.log(`🔄 Transaction: Delete word and cleanup embedding: ${wordId}`);
      const result = dbManager.transactionDeleteWord(wordId, profile);
      return { success: result };
    } else {
      // Use regular delete if no embedding
      const result = dbManager.deleteWord(wordId);
      return { success: result };
    }
  } catch (error) {
    console.error(`Failed to delete word ${wordId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
});

ipcMain.handle('get-related-words-paginated', (event, searchTerm: string, offset: number, limit: number) => {
  return dbManager.getRelatedWordsPaginated(searchTerm, offset, limit);
});

// Store operations
ipcMain.handle('load-panel-widths', () => {
  return storeManager.loadPanelWidths();
});

ipcMain.handle('save-panel-widths', (event, widths: any) => {
  storeManager.savePanelWidths(widths);
});

ipcMain.handle('load-sort-order', () => {
  return storeManager.loadSortOrder();
});

ipcMain.handle('save-sort-order', (event, sortOrder: 'asc' | 'desc') => {
  storeManager.saveSortOrder(sortOrder);
});

// Profile config operations
ipcMain.handle('get-profile-config', () => {
  return profileManager.getCurrentProfile();
});

ipcMain.handle('update-profile-config', (event, config: any) => {
  const currentProfile = profileManager.getLastOpenedProfile();
  if (!currentProfile) return false;
  return profileManager.updateProfileConfig(currentProfile, config);
});



// Markdown processing
ipcMain.handle('process-markdown', async (event, markdown: string) => {
  try {
    const result = marked(markdown);
    return result;
  } catch (error) {
    console.error('Error processing markdown:', error);
    return markdown; // Return original markdown on error
  }
});

// Profile import/export operations
ipcMain.handle('export-profile', async () => {
  try {
    const currentProfile = profileManager.getLastOpenedProfile();
    if (!currentProfile) {
      throw new Error('No current profile selected');
    }

    // Show save dialog to let user choose export location
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Profile Database',
      defaultPath: `${currentProfile}.db`,
      filters: [
        { name: 'SQLite Database', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, message: 'Export cancelled' };
    }

    // Use the import/export service to handle the export
    return importExportService.exportProfileToLocal(result.filePath);

  } catch (error) {
    console.error('Error exporting profile:', error);
    return {
      success: false,
      message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

ipcMain.handle('import-profile', async () => {
  try {
    // Show open dialog to let user select database file
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Profile Database',
      properties: ['openFile'],
      filters: [
        { name: 'SQLite Database', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Import cancelled' };
    }

    const sourcePath = result.filePaths[0];

    // Use the import/export service to handle the import
    return await importExportService.importProfileFromLocal(sourcePath);

  } catch (error) {
    console.error('Error importing profile:', error);
    return {
      success: false,
      message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

// Google Drive operations
ipcMain.handle('google-authenticate', async () => {
  try {
    const success = await googleAuthService.authenticate();
    return { success, message: success ? 'Successfully authenticated with Google' : 'Authentication cancelled' };
  } catch (error) {
    console.error('Google authentication failed:', error);
    return {
      success: false,
      message: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

ipcMain.handle('google-is-authenticated', async () => {
  try {
    const isAuthenticated = await googleAuthService.isAuthenticated();
    return { success: true, authenticated: isAuthenticated };
  } catch (error) {
    console.error('Failed to check authentication status:', error);
    return { success: false, authenticated: false };
  }
});

ipcMain.handle('google-logout', async () => {
  try {
    await googleAuthService.logout();
    return { success: true, message: 'Successfully logged out from Google' };
  } catch (error) {
    console.error('Google logout failed:', error);
    return {
      success: false,
      message: `Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

ipcMain.handle('google-get-user-info', async () => {
  try {
    const userInfo = await googleAuthService.getUserInfo();
    return { success: true, userInfo };
  } catch (error) {
    console.error('Failed to get user info:', error);
    return {
      success: false,
      message: `Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

ipcMain.handle('google-drive-list-files', async () => {
  try {
    // Get or create the EverEtch Profiles folder
    const folderId = await googleDriveService.getFolder(EVERETCH_FOLDER_NAME);
    if (!folderId) {
      throw new Error('Could not access EverEtch Profiles folder');
    }

    // List files in the EverEtch folder
    const files = await googleDriveService.listFilesInFolder(folderId);
    return { success: true, files };
  } catch (error) {
    console.error('Failed to list Google Drive files:', error);
    return {
      success: false,
      message: `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      files: []
    };
  }
});

ipcMain.handle('google-drive-upload-database', async () => {
  try {
    // Prepare profile data for upload using the service
    const uploadData = await importExportService.exportProfileForUpload();
    if (!uploadData.success) {
      return uploadData;
    }

    // Get or create the EverEtch Profiles folder
    const folderId = await googleDriveService.getFolder(EVERETCH_FOLDER_NAME);
    if (!folderId) {
      throw new Error('Could not access EverEtch Profiles folder');
    }

    // Upload file to the EverEtch folder
    const result = await googleDriveService.uploadFile(
      uploadData.fileName!,
      uploadData.fileBuffer!,
      folderId
    );

    return result;
  } catch (error) {
    console.error('Failed to upload database to Google Drive:', error);
    return {
      success: false,
      message: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

ipcMain.handle('google-drive-download-database', async (event, fileId: string) => {
  try {
    const downloadResult = await googleDriveService.downloadFile(fileId);
    if (!downloadResult.success) {
      return downloadResult;
    }

    // Get file metadata to determine profile name
    const fileMetadata = await googleDriveService.getFileMetadata(fileId);
    if (!fileMetadata) {
      throw new Error('Could not get file metadata');
    }

    // Use the import/export service to handle the import from Google Drive
    return await importExportService.importProfileFromGoogleDrive(fileMetadata.name, downloadResult.content!);

  } catch (error) {
    console.error('Failed to download database from Google Drive:', error);
    return {
      success: false,
      message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

ipcMain.handle('google-drive-delete-file', async (event, fileId: string) => {
  try {
    const success = await googleDriveService.deleteFile(fileId);
    return {
      success,
      message: success ? 'File deleted successfully' : 'Failed to delete file'
    };
  } catch (error) {
    console.error('Failed to delete Google Drive file:', error);
    return {
      success: false,
      message: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

// Model memo operations
ipcMain.handle('load-model-memos', async () => {
  try {
    const models = ModelManager.loadModels();
    return models;
  } catch (error) {
    console.error('Failed to load model memos:', error);
    return [];
  }
});

ipcMain.handle('load-chat-model-memos', async () => {
  try {
    const models = ModelManager.loadChatModels();
    return models;
  } catch (error) {
    console.error('Failed to load chat model memos:', error);
    return [];
  }
});

ipcMain.handle('load-embedding-model-memos', async () => {
  try {
    const models = ModelManager.loadEmbeddingModels();
    return models;
  } catch (error) {
    console.error('Failed to load embedding model memos:', error);
    return [];
  }
});

ipcMain.handle('add-model-memo', async (event, memoData: any) => {
  try {
    const newModel = ModelManager.addModel(memoData);
    return { success: true, model: newModel };
  } catch (error) {
    console.error('Failed to add model memo:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save model configuration'
    };
  }
});

ipcMain.handle('get-model-memo', async (event, name: string) => {
  try {
    const model = ModelManager.getModel(name);
    if (model) {
      return { success: true, model };
    } else {
      return { success: false, message: 'Model not found' };
    }
  } catch (error) {
    console.error('Failed to get model memo:', error);
    return { success: false, message: 'Failed to load model configuration' };
  }
});

ipcMain.handle('delete-model-memo', async (event, name: string) => {
  try {
    const success = ModelManager.deleteModel(name);
    return {
      success,
      message: success ? 'Model deleted successfully' : 'Model not found'
    };
  } catch (error) {
    console.error('Failed to delete model memo:', error);
    return { success: false, message: 'Failed to delete model configuration' };
  }
});

ipcMain.handle('mark-model-used', async (event, name: string) => {
  try {
    const success = ModelManager.markModelUsed(name);
    return success;
  } catch (error) {
    console.error('Failed to mark model as used:', error);
    return false;
  }
});

// Semantic Search IPC handlers

ipcMain.handle('start-semantic-batch-processing', async (event, config: any) => {
  try {
    // Update profile with embedding configuration
    const currentProfile = await profileManager.getCurrentProfile();

    console.debug('🔧 Starting semantic batch processing...');

    // Properly merge embedding_config to preserve existing structure
    const updatedProfile = { ...currentProfile };

    if (config.embedding_config) {
      updatedProfile.embedding_config = {
        ...currentProfile?.embedding_config,
        ...config.embedding_config,
        enabled: true // Always enable when starting batch processing
      };
    }

    const updateResult = await profileManager.updateProfileConfig(currentProfile!.name, updatedProfile);
    if (!updateResult) {
      console.error('❌ Failed to update profile config');
      return {
        success: false,
        message: 'Failed to update profile configuration'
      };
    }

    // Start batch processing
    const result = await semanticBatchService.startBatchProcessing(
      {
        batchSize: config.batch_size || 10,
        onProgress: (processed, total) => {
          //console.debug(`📊 Progress update: ${processed}/${total}`);
          // Send progress updates to renderer
          mainWindow.webContents.send('semantic-batch-progress', {
            processed,
            total,
          });
        },
        onComplete: (result) => {
          console.debug('📋 Batch processing complete');
          // Send completion updates to renderer
          mainWindow.webContents.send('semantic-batch-complete', result);
        }
      }
    );

    return {
      success: result.success,
      message: result.error,
    };
  } catch (error) {
    console.error('❌ Failed to start semantic search processing:', error);
    return {
      success: false,
      message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

ipcMain.handle('cancel-semantic-batch-processing', async () => {
  try {
    semanticBatchService.cancelProcessing();

    // Update profile with embedding configuration
    const currentProfile = await profileManager.getCurrentProfile();
    const updatedProfile = { ...currentProfile };
    if (updatedProfile.embedding_config) {
      updatedProfile.embedding_config.enabled = false;
      await profileManager.updateProfileConfig(currentProfile!.name, updatedProfile);
    }
    return {
      success: true,
      message: 'Cancelled semantic batch processing'
    };
  } catch (error) {
    console.error('Failed to cancel semantic search processing:', error);
    return {
      success: false,
      message: `Cancellation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
});

ipcMain.handle('update-semantic-config', async (event, config: any) => {

  const currentProfile = await profileManager.getCurrentProfile();
  const updatedProfile = { ...currentProfile };
  updatedProfile.embedding_config = config.embedding_config;
  const result = await profileManager.updateProfileConfig(currentProfile!.name, updatedProfile);
  if (!result) {
    return {
      success: false,
      message: 'Failed to update semantic batch config',
    }
  } else {
    return {
      success: true,
      message: 'Semantic batch config updated',
    }
  }
})

ipcMain.handle('perform-semantic-search', async (event, query: string, limit: number = 10) => {
  try {
    if (!semanticSearchService) {
      return {
        success: false,
        message: 'Semantic search not initialized',
        results: []
      };
    }

    const currentProfile = profileManager.getCurrentProfile();
    if (!currentProfile?.embedding_config) {
      return {
        success: false,
        message: 'No current profile embedding configured',
        results: []
      };
    }

    if (!currentProfile.embedding_config.enabled) {
      return {
        success: false,
        message: 'Embedding not enabled for current profile',
        results: []
      };
    }

    const response = await semanticSearchService.search(query, {
      limit: 100,
      threshold: currentProfile.embedding_config.similarity_threshold,
      includeEmbeddingStats: false
    });

    return {
      success: true,
      message: `Found ${response.words.length} results`,
      results: response.words
    };
  } catch (error) {
    console.error('Failed to perform semantic search:', error);
    return {
      success: false,
      message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      results: []
    };
  }
});

ipcMain.handle('generate-word-embedding', async (event, wordData: { word: string; meaning: string; summary: string; tags: string[]; synonyms: string[]; antonyms: string[]; }) => {
  try {
    const profile = await profileManager.getCurrentProfile();
    if (!profile) {
      throw new Error('No current profile found');
    }

    if (!profile.embedding_config?.enabled) {
      throw new Error('Embedding not enabled for current profile');
    }

    if (!profile.embedding_config?.api_key) {
      throw new Error('API key not configured for embedding');
    }

    // Generate embedding using the detailed meaning and metadata
    const embeddingResult = await embeddingClient.generateWordEmbedding({
      word: wordData.word,
      one_line_desc: wordData.summary,
      details: wordData.meaning,
      tags: wordData.tags,
      synonyms: wordData.synonyms,
      antonyms: wordData.antonyms
    } as any, profile);

    if ('embedding' in embeddingResult) {
      console.log(`✅ Main process: Embedding [${embeddingResult.embedding.length}] generated successfully`);
      return {
        success: true,
        embedding: embeddingResult.embedding,
        model_used: embeddingResult.model_used,
        tokens_used: embeddingResult.tokens_used
      };
    } else {
      throw new Error('Unexpected batch result for single embedding');
    }

  } catch (error) {
    console.error('❌ Main process: Error generating embedding:', error);
    throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});
