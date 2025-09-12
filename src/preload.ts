const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Profile management
  loadProfiles: () => ipcRenderer.invoke('load-profiles'),
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  getCurrentProfileName: () => ipcRenderer.invoke('get-current-profile-name'),
  switchProfile: (profileName: string) => ipcRenderer.invoke('switch-profile', profileName),
  createProfile: (profileName: string) => ipcRenderer.invoke('create-profile', profileName),
  renameProfile: (oldName: string, newName: string) => ipcRenderer.invoke('rename-profile', oldName, newName),
  deleteProfile: (profileName: string) => ipcRenderer.invoke('delete-profile', profileName),

  // Word operations
  getWordsPaginated: (offset: number, limit: number, sortOrder?: 'asc' | 'desc') => ipcRenderer.invoke('get-words-paginated', offset, limit, sortOrder),
  searchWords: (query: string) => ipcRenderer.invoke('search-words', query),
  getWord: (wordId: string) => ipcRenderer.invoke('get-word', wordId),
  getWordByName: (wordName: string) => ipcRenderer.invoke('get-word-by-name', wordName),
  addWord: (wordData: any) => ipcRenderer.invoke('add-word', wordData),
  updateWord: (wordId: string, wordData: any) => ipcRenderer.invoke('update-word', wordId, wordData),
  updateWordRemark: (wordId: string, remark: string) => ipcRenderer.invoke('update-word-remark', wordId, remark),
  deleteWord: (wordId: string) => ipcRenderer.invoke('delete-word', wordId),

  // AI operations
  generateWordMeaning: (word: string) => ipcRenderer.invoke('generate-word-meaning', word),
  generateWordMetas: (word: string, meaning: string, generationId: string) => ipcRenderer.invoke('generate-word-metas', word, meaning, generationId),

  // Associated words
  getRelatedWordsPaginated: (searchTerm: string, offset: number, limit: number) => ipcRenderer.invoke('get-related-words-paginated', searchTerm, offset, limit),

  // Profile config
  getProfileConfig: () => ipcRenderer.invoke('get-profile-config'),
  updateProfileConfig: (config: any) => ipcRenderer.invoke('update-profile-config', config),



  // Markdown processing
  processMarkdown: (markdown: string) => ipcRenderer.invoke('process-markdown', markdown),

  // Store operations
  loadPanelWidths: () => ipcRenderer.invoke('load-panel-widths'),
  savePanelWidths: (widths: any) => ipcRenderer.invoke('save-panel-widths', widths),
  loadSortOrder: () => ipcRenderer.invoke('load-sort-order'),
  saveSortOrder: (sortOrder: 'asc' | 'desc') => ipcRenderer.invoke('save-sort-order', sortOrder),

  // Profile import/export
  exportProfile: () => ipcRenderer.invoke('export-profile'),
  importProfile: () => ipcRenderer.invoke('import-profile'),

  // Event listeners for streaming
  onWordMeaningStreaming: (callback: Function) => {
    ipcRenderer.on('word-meaning-streaming', (_event: any, content: string) => callback(content));
  },

  onWordMetadataReady: (callback: Function) => {
    ipcRenderer.on('word-metadata-ready', (_event: any, toolData: any) => callback(toolData));
  },

  // Protocol handlers for custom URL scheme
  onProtocolNavigateWord: (callback: Function) => {
    ipcRenderer.on('protocol-navigate-word', (_event: any, wordName: string) => callback(wordName));
  },

  onProtocolSwitchProfile: (callback: Function) => {
    ipcRenderer.on('protocol-switch-profile', (_event: any, profileName: string) => callback(profileName));
  },

  removeAllListeners: (event: string) => {
    ipcRenderer.removeAllListeners(event);
  }
});
