import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DatabaseManager } from './database/DatabaseManager.js';
import { ProfileManager } from './database/ProfileManager.js';
import { AIModelClient } from './ai/AIModelClient.js';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow;
let dbManager: DatabaseManager;
let profileManager: ProfileManager;
let aiClient: AIModelClient;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets/icons/icon.png'), // or .ico on Windows
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));

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

  // Configure marked for safe rendering (will be done after dynamic import)
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

ipcMain.handle('switch-profile', async (event, profileName: string) => {
  return await profileManager.switchProfile(profileName);
});

ipcMain.handle('get-words', async () => {
  return await dbManager.getWords();
});

ipcMain.handle('search-words', async (event, query: string) => {
  return await dbManager.searchWords(query);
});

ipcMain.handle('get-word', async (event, wordId: string) => {
  return await dbManager.getWord(wordId);
});

ipcMain.handle('generate-meaning-only', async (event, word: string) => {
  const profile = await profileManager.getCurrentProfile();
  if (!profile) return null;

  // Set up streaming callback to send content to renderer
  const onStreamingContent = (content: string) => {
    mainWindow.webContents.send('streaming-content', content);
  };

  const meaning = await aiClient.generateMeaningOnly(word, profile, onStreamingContent);
  return meaning;
});

ipcMain.handle('generate-tags-summary', async (event, word: string, meaning: string) => {
  const profile = await profileManager.getCurrentProfile();
  if (!profile) {
    const fallbackData = {
      summary: `A word: ${word}`,
      tags: ['general'],
      tag_colors: { 'general': '#6b7280' }
    };
    mainWindow.webContents.send('tool-result', fallbackData);
    return fallbackData;
  }

  try {
    const toolData = await aiClient.generateTagsAndSummary(word, meaning, profile);

    // Ensure we have valid data to send
    const safeToolData = {
      summary: toolData.summary || `A word: ${word}`,
      tags: toolData.tags || ['general'],
      tag_colors: toolData.tag_colors || { 'general': '#6b7280' }
    };

    // Send tool data to renderer
    mainWindow.webContents.send('tool-result', safeToolData);

    return safeToolData;
  } catch (error) {
    console.error('Error in generate-tags-summary:', error);

    // Send fallback data on error
    const fallbackData = {
      summary: `A word: ${word}`,
      tags: ['general'],
      tag_colors: { 'general': '#6b7280' }
    };
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
    return marked(markdown);
  } catch (error) {
    console.error('Error processing markdown:', error);
    return markdown; // Return original markdown on error
  }
});
