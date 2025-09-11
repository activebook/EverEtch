import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getAndSetProxyEnvironment } from './sys_proxy.js';
import { DatabaseManager } from './database/DatabaseManager.js';
import { ProfileManager } from './database/ProfileManager.js';
import { AIModelClient, WORD_DUMMY_METAS } from './ai/AIModelClient.js';
import { marked } from 'marked';
import { getDatabasePath, getDataPath, ensureDataDirectory } from './utils.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow;
let dbManager: DatabaseManager;
let profileManager: ProfileManager;
let aiClient: AIModelClient;

// Configure marked for proper line break handling
marked.setOptions({
  breaks: true, // Convert line breaks to <br> tags
  gfm: true,    // Enable GitHub Flavored Markdown
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Set up proxy environment variables
  getAndSetProxyEnvironment();

  // Initialize managers
  dbManager = new DatabaseManager();
  profileManager = new ProfileManager(dbManager);
  aiClient = new AIModelClient();

  // Initialize profile manager and load profiles
  await profileManager.initialize();

  // Load last opened profile
  const lastProfile = profileManager.getLastOpenedProfile();
  if (lastProfile) {
    await profileManager.switchProfile(lastProfile);
  }


}

app.whenReady().then(createWindow);

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

ipcMain.handle('get-words', async () => {
  return await dbManager.getWords();
});

ipcMain.handle('get-words-paginated', async (event, offset: number, limit: number) => {
  return await dbManager.getWordsPaginated(offset, limit);
});

ipcMain.handle('search-words', async (event, query: string) => {
  return await dbManager.searchWords(query);
});

ipcMain.handle('search-words-optimized', async (event, query: string) => {
  return await dbManager.searchWordsOptimized(query);
});

ipcMain.handle('get-word', async (event, wordId: string) => {
  return await dbManager.getWord(wordId);
});

ipcMain.handle('generate-word-meaning', async (event, word: string) => {
  const profile = await profileManager.getCurrentProfile();
  if (!profile) return null;

  // Set up streaming callback to send content to renderer
  const onStreamingContent = (content: string) => {
    mainWindow.webContents.send('streaming-content', content);
  };

  const meaning = await aiClient.generateWordMeaning(word, profile, onStreamingContent);
  return meaning;
});

ipcMain.handle('generate-word-metas', async (event, word: string, meaning: string, generationId: string) => {
  console.log('🔄 Main process: generate-word-metas called with generationId:', generationId);

  // Defensive check: ensure generationId is valid
  if (!generationId || typeof generationId !== 'string' || generationId.length === 0) {
    console.error('❌ Main process: Invalid generationId received:', generationId);
    const fallbackData = {
      ...WORD_DUMMY_METAS,
      generationId: 'fallback_' + Date.now()
    };
    console.log('📤 Main process: Sending fallback tool result with fallback generationId:', fallbackData);
    mainWindow.webContents.send('tool-result', fallbackData);
    return fallbackData;
  }

  const profile = await profileManager.getCurrentProfile();
  if (!profile) {
    console.log('❌ Main process: No profile found');
    const fallbackData = {
      ...WORD_DUMMY_METAS,
      generationId: generationId
    };
    console.log('📤 Main process: Sending fallback tool result to renderer:', fallbackData);
    mainWindow.webContents.send('tool-result', fallbackData);
    return fallbackData;
  }

  try {
    console.log('🚀 Main process: Calling aiClient.generateWordMetas');
    const toolData = await aiClient.generateWordMetas(word, meaning, profile);
    console.log('✅ Main process: AI client returned:', toolData);

    // Ensure we have valid data to send
    const safeToolData = {
      summary: toolData.summary || `A word: ${word}`,
      tags: toolData.tags || ['general'],
      tag_colors: toolData.tag_colors || { 'general': '#6b7280' },
      synonyms: toolData.synonyms || [],
      antonyms: toolData.antonyms || [],
      generationId: generationId  // Explicitly include generationId
    };

    console.log('📤 Main process: Sending tool result to renderer:', safeToolData);
    // Send tool data to renderer
    mainWindow.webContents.send('tool-result', safeToolData);

    return safeToolData;
  } catch (error) {
    console.error('❌ Main process: Error in generate-word-metas:', error);

    // Send fallback data on error
    const fallbackData = {
      ...WORD_DUMMY_METAS,
      generationId: generationId
    };
    console.log('📤 Main process: Sending error fallback to renderer:', fallbackData);
    mainWindow.webContents.send('tool-result', fallbackData);

    return fallbackData;
  }
});

ipcMain.handle('add-word', async (event, wordData: any) => {
  return await dbManager.addWord(wordData);
});

ipcMain.handle('update-word', async (event, wordId: string, wordData: any) => {
  return await dbManager.updateWord(wordId, wordData);
});

ipcMain.handle('delete-word', async (event, wordId: string) => {
  return await dbManager.deleteWord(wordId);
});

ipcMain.handle('get-associated-words', async (event, tag: string) => {
  return await dbManager.getAssociatedWords(tag);
});

ipcMain.handle('get-associated-words-paginated', async (event, tag: string, offset: number, limit: number) => {
  return await dbManager.getAssociatedWordsPaginated(tag, offset, limit);
});

ipcMain.handle('get-related-words', async (event, searchTerm: string) => {
  return await dbManager.getRelatedWords(searchTerm);
});

ipcMain.handle('get-related-words-optimized', async (event, searchTerm: string) => {
  return await dbManager.getRelatedWordsOptimized(searchTerm);
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
    // console.log('Markdown input:', JSON.stringify(markdown));
    // console.log('Markdown output:', result);
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
      const switchSuccess = await profileManager.switchProfile(profileName);

      if (switchSuccess) {
        // Update the profile config in the now-active database
        console.log(`Profile "${profileName}" imported successfully`);
      } else {
        console.error('Failed to switch to imported profile');
        success = false;
      }
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
