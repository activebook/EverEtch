import { app, BrowserWindow, ipcMain, dialog, screen, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getAndSetProxyEnvironment } from './utils/sys_proxy.js';
import { getDatabasePath, ensureDataDirectory, logToFile, setDebugMode, clearDebugLog, getUserDataPath } from './utils/utils.js';
import { StoreManager } from './utils/StoreManager.js';
import { DatabaseManager } from './database/DatabaseManager.js';
import { ProfileManager } from './database/ProfileManager.js';
import { AIModelClient, WORD_DUMMY_METAS } from './ai/AIModelClient.js';
import { GoogleAuthService } from './main/google/GoogleAuthService.js';
import { GoogleDriveService } from './main/google/GoogleDriveService.js';
import { GoogleDriveExportService } from './main/services/GoogleDriveExportService.js';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow;
let dbManager: DatabaseManager;
let profileManager: ProfileManager;
let aiClient: AIModelClient;
let storeManager: StoreManager;
let googleAuthService: GoogleAuthService;
let googleDriveService: GoogleDriveService;
let googleDriveExportService: GoogleDriveExportService;
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
setDebugMode(false);
clearDebugLog();
logToFile('EverEtch app starting up');


async function createWindow() {
  try {
    // Initialize managers first to get profile config
    dbManager = new DatabaseManager();
    profileManager = new ProfileManager(dbManager);
    aiClient = new AIModelClient();

    // Initialize Google services
    storeManager = new StoreManager();
    googleAuthService = new GoogleAuthService(mainWindow, storeManager);
    googleDriveService = new GoogleDriveService(googleAuthService);
    googleDriveExportService = new GoogleDriveExportService(dbManager);

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

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    // Apply saved window bounds
    adjustMainWindow(() => {
      // Callback function after window is ready
      // Set up proxy environment variables
      getAndSetProxyEnvironment();
    }, () => {});

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
  logToFile(`🎯 Processing protocol URL: ${url}`);

  try {
    // Remove the protocol prefix to get the path
    const urlWithoutProtocol = url.replace('everetch://', '');
    const urlParts = urlWithoutProtocol.split('/');

    // Check if window is already loaded and showing
    const isWindowReady = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();

    logToFile(`🎯 Window ready? ${isWindowReady}`);
    logToFile(`🎯 URL parts: ${JSON.stringify(urlParts)}`);

    // Handle different protocol actions
    if (urlParts.length === 1 && (urlParts[0] === '' || urlParts[0] === 'open')) {
      logToFile('🎯 Handling: Open app');
      if (isWindowReady) {
        mainWindow.focus();
        logToFile('✅ App focused');
      }
      return;
    }

    if (urlParts.length >= 2 && urlParts[0] === 'word') {
      // Join all parts after 'word' and decode
      const wordName = decodeURIComponent(urlParts.slice(1).join('/'));
      logToFile(`🎯 Handling: Navigate to word "${wordName}"`);

      if (isWindowReady) {
        logToFile('🎯 Sending IPC message to renderer');
        mainWindow.webContents.send('protocol-navigate-word', wordName);
        mainWindow.focus();
        logToFile('✅ IPC message sent and window focused');
      } else {
        logToFile('⚠️ Window not ready, queuing navigation');
        // Queue the action for when window is ready
        queuedProtocolAction = { type: 'word', data: wordName };
      }
      return;
    }

    if (urlParts.length >= 2 && urlParts[0] === 'profile') {
      // Join all parts after 'profile' and decode
      const profileName = decodeURIComponent(urlParts.slice(1).join('/'));
      logToFile(`🎯 Handling: Switch to profile "${profileName}"`);

      if (isWindowReady) {
        logToFile('🎯 Sending IPC message to renderer');
        mainWindow.webContents.send('protocol-switch-profile', profileName);
        mainWindow.focus();
        logToFile('✅ IPC message sent and window focused');
      } else {
        logToFile('⚠️ Window not ready, queuing profile switch');
        queuedProtocolAction = { type: 'profile', data: profileName };
      }
      return;
    }

    logToFile(`⚠️ Unknown protocol action: ${urlWithoutProtocol}`);

  } catch (error) {
    logToFile(`❌ Error processing protocol URL: ${error}`);
  }
}

// Process queued protocol action when window is ready
function processQueuedProtocolAction() {
  if (!queuedProtocolAction || !mainWindow) return;

  logToFile(`🎯 Processing queued action: ${queuedProtocolAction.type} - ${queuedProtocolAction.data}`);

  if (queuedProtocolAction.type === 'word') {
    mainWindow.webContents.send('protocol-navigate-word', queuedProtocolAction.data);
    mainWindow.focus();
    logToFile('✅ Queued word navigation sent');
  } else if (queuedProtocolAction.type === 'profile') {
    mainWindow.webContents.send('protocol-switch-profile', queuedProtocolAction.data);
    mainWindow.focus();
    logToFile('✅ Queued profile switch sent');
  }

  queuedProtocolAction = null; // Clear the queue
}

// Listen for app-ready signal from renderer
ipcMain.on('app-render-ready', () => {
  logToFile('🎯 Received app-ready signal from renderer');
  processQueuedProtocolAction();
});

// Handle open-url event for macOS protocol links
app.on('open-url', (event, url) => {
  logToFile(`🎯 App open-url event received: ${url}`);
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

ipcMain.handle('get-words-paginated', async (event, offset: number, limit: number, sortOrder?: 'asc' | 'desc') => {
  return await dbManager.getWordsPaginated(offset, limit, sortOrder);
});

ipcMain.handle('search-words', async (event, query: string) => {
  return await dbManager.searchWords(query);
});

ipcMain.handle('get-word', async (event, wordId: string) => {
  return await dbManager.getWord(wordId);
});

ipcMain.handle('get-word-by-name', async (event, wordName: string) => {
  return await dbManager.getWordByName(wordName);
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
  return await dbManager.addWord(wordData);
});

ipcMain.handle('update-word', async (event, wordId: string, wordData: any) => {
  return await dbManager.updateWord(wordId, wordData);
});

ipcMain.handle('update-word-remark', async (event, wordId: string, remark: string) => {
  return await dbManager.updateWord(wordId, { remark });
});

ipcMain.handle('delete-word', async (event, wordId: string) => {
  return await dbManager.deleteWord(wordId);
});

ipcMain.handle('get-related-words-paginated', async (event, searchTerm: string, offset: number, limit: number) => {
  return await dbManager.getRelatedWordsPaginated(searchTerm, offset, limit);
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
ipcMain.handle('get-profile-config', async () => {
  return await profileManager.getCurrentProfile();
});

ipcMain.handle('update-profile-config', async (event, config: any) => {
  const currentProfile = profileManager.getLastOpenedProfile();
  if (!currentProfile) return false;
  return await profileManager.updateProfileConfig(currentProfile, config);
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

    // Copy the current profile's database to the selected location
    const sourcePath = getDatabasePath(currentProfile);
    const targetPath = result.filePath;

    // Ensure source database exists
    if (!fs.existsSync(sourcePath)) {
      throw new Error('Current profile database not found');
    }

    // Copy the database file
    fs.copyFileSync(sourcePath, targetPath);

    return {
      success: true,
      message: `Profile "${currentProfile}" exported successfully to ${targetPath}`
    };

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
    const fileName = path.basename(sourcePath, '.db');

    // Validate the database format
    const isValid = await DatabaseManager.validateDatabaseFormat(sourcePath);
    if (!isValid) {
      return {
        success: false,
        message: 'Invalid database format. The selected file is not a valid EverEtch profile database.'
      };
    }

    // Generate unique profile name if needed
    let profileName = fileName;
    const existingProfiles = profileManager.getProfiles();
    let counter = 1;

    while (existingProfiles.includes(profileName)) {
      profileName = `${fileName}_${counter}`;
      counter++;
    }

    // Copy database to profile directory
    const targetPath = getDatabasePath(profileName);
    ensureDataDirectory();
    fs.copyFileSync(sourcePath, targetPath);

    let success = false;

    // Add new profile to profiles
    success = profileManager.importProfile(profileName);
    if (success) {
      // Switch to the imported profile to ensure it's properly initialized
      success = await profileManager.switchProfile(profileName);
    } else {
      console.error('Failed to imported profile, the same profile already exists');
    }

    if (!success) {
      // Clean up the copied file if profile creation failed
      try {
        fs.unlinkSync(targetPath);
      } catch (cleanupError) {
        console.error('Error cleaning up failed import:', cleanupError);
      }
      return { success: false, message: 'Failed to create new profile' };
    }

    return {
      success: true,
      message: `Profile "${profileName}" imported successfully`,
      profileName
    };

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
    const files = await googleDriveService.listFiles();
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
    const currentProfile = profileManager.getLastOpenedProfile();
    if (!currentProfile) {
      throw new Error('No current profile selected');
    }

    const fileInfo = googleDriveExportService.getCurrentDatabaseFileInfo(currentProfile);
    if (!fileInfo) {
      throw new Error('Database file not found');
    }

    const fileBuffer = await googleDriveExportService.readDatabaseFile(fileInfo.filePath);
    const fileName = googleDriveExportService.generateFileName(currentProfile);

    const result = await googleDriveService.uploadFile(
      fileName,
      fileBuffer.toString('base64'),
      'application/octet-stream'
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

    // Extract profile name from filename (remove EverEtch_ prefix and timestamp)
    const profileNameMatch = fileMetadata.name.match(/^EverEtch_(.+?)_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/);
    let profileName = 'imported_profile';

    if (profileNameMatch) {
      profileName = profileNameMatch[1];
    }

    // Generate unique profile name if needed
    const existingProfiles = profileManager.getProfiles();
    let finalProfileName = profileName;
    let counter = 1;

    while (existingProfiles.includes(finalProfileName)) {
      finalProfileName = `${profileName}_${counter}`;
      counter++;
    }

    // Save the downloaded file
    const targetPath = getDatabasePath(finalProfileName);
    ensureDataDirectory();
    const fileBuffer = Buffer.from(downloadResult.content!, 'base64');
    await googleDriveExportService.writeDatabaseFile(targetPath, fileBuffer);

    // Validate the downloaded database
    const isValid = await googleDriveExportService.validateDownloadedDatabase(targetPath);
    if (!isValid) {
      // Clean up invalid file
      try {
        fs.unlinkSync(targetPath);
      } catch (cleanupError) {
        console.error('Error cleaning up invalid download:', cleanupError);
      }
      throw new Error('Downloaded file is not a valid EverEtch database');
    }

    // Import the profile
    const importSuccess = profileManager.importProfile(finalProfileName);
    if (!importSuccess) {
      // Clean up if import failed
      try {
        fs.unlinkSync(targetPath);
      } catch (cleanupError) {
        console.error('Error cleaning up failed import:', cleanupError);
      }
      throw new Error('Failed to import profile');
    }

    return {
      success: true,
      message: `Profile "${finalProfileName}" imported successfully from Google Drive`,
      profileName: finalProfileName
    };
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
