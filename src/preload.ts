const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Profile management
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  switchProfile: (profileName: string) => ipcRenderer.invoke('switch-profile', profileName),

  // Word operations
  getWords: () => ipcRenderer.invoke('get-words'),
  searchWords: (query: string) => ipcRenderer.invoke('search-words', query),
  getWord: (wordId: string) => ipcRenderer.invoke('get-word', wordId),
  addWord: (wordData: any) => ipcRenderer.invoke('add-word', wordData),
  updateWord: (wordId: string, wordData: any) => ipcRenderer.invoke('update-word', wordId, wordData),
  deleteWord: (wordId: string) => ipcRenderer.invoke('delete-word', wordId),

  // AI operations
  generateMeaningOnly: (word: string) => ipcRenderer.invoke('generate-meaning-only', word),
  generateTagsAndSummary: (word: string, meaning: string) => ipcRenderer.invoke('generate-tags-summary', word, meaning),

  // Associated words
  getAssociatedWords: (tag: string) => ipcRenderer.invoke('get-associated-words', tag),

  // Profile config
  getProfileConfig: () => ipcRenderer.invoke('get-profile-config'),
  updateProfileConfig: (config: any) => ipcRenderer.invoke('update-profile-config', config),

  // Markdown processing
  processMarkdown: (markdown: string) => ipcRenderer.invoke('process-markdown', markdown),

  // Event listeners for streaming
  onStreamingContent: (callback: Function) => {
    ipcRenderer.on('streaming-content', (_event: any, content: string) => callback(content));
  },

  onToolResult: (callback: Function) => {
    ipcRenderer.on('tool-result', (_event: any, toolData: any) => callback(toolData));
  },

  removeAllListeners: (event: string) => {
    ipcRenderer.removeAllListeners(event);
  }
});
