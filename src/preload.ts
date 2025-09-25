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
  addWord: (wordData: { word: string; one_line_desc: string; details: string; tags: string[]; tag_colors: Record<string, string>; synonyms: string[]; antonyms: string[]; remark?: string; embedding?: number[] }) => ipcRenderer.invoke('add-word', wordData),
  updateWord: (wordId: string, wordData: Partial<{ word: string; one_line_desc: string; details: string; tags: string[]; tag_colors: Record<string, string>; synonyms: string[]; antonyms: string[]; remark?: string; embedding?: number[] }>) => ipcRenderer.invoke('update-word', wordId, wordData),
  updateWordRemark: (wordId: string, remark: string) => ipcRenderer.invoke('update-word-remark', wordId, remark),
  deleteWord: (wordId: string) => ipcRenderer.invoke('delete-word', wordId),

  // AI operations
  generateWordMeaning: (word: string) => ipcRenderer.invoke('generate-word-meaning', word),
  generateWordMetas: (word: string, meaning: string, generationId: string) => ipcRenderer.invoke('generate-word-metas', word, meaning, generationId),
  generateWordEmbedding: (wordData: { word: string; meaning: string; summary: string; tags: string[]; synonyms: string[]; antonyms: string[]; }) => ipcRenderer.invoke('generate-word-embedding', wordData),

  // Associated words
  getRelatedWordsPaginated: (searchTerm: string, offset: number, limit: number) => ipcRenderer.invoke('get-related-words-paginated', searchTerm, offset, limit),

  // Profile config
  getProfileConfig: () => ipcRenderer.invoke('get-profile-config'),
  updateProfileConfig: (config: { id: string; name: string; system_prompt: string; model_config: { provider: string; model: string; endpoint: string; api_key: string; }; last_opened: string; }) => ipcRenderer.invoke('update-profile-config', config),

  // Markdown processing
  processMarkdown: (markdown: string) => ipcRenderer.invoke('process-markdown', markdown),

  // Store operations
  loadPanelWidths: () => ipcRenderer.invoke('load-panel-widths'),
  savePanelWidths: (widths: { left: number; middle: number; right: number }) => ipcRenderer.invoke('save-panel-widths', widths),
  loadSortOrder: () => ipcRenderer.invoke('load-sort-order'),
  saveSortOrder: (sortOrder: 'asc' | 'desc') => ipcRenderer.invoke('save-sort-order', sortOrder),

  // Profile import/export
  exportProfile: () => ipcRenderer.invoke('export-profile'),
  importProfile: () => ipcRenderer.invoke('import-profile'),

  // Model memo operations
  loadModelMemos: () => ipcRenderer.invoke('load-model-memos'),
  loadChatModelMemos: () => ipcRenderer.invoke('load-chat-model-memos'),
  loadEmbeddingModelMemos: () => ipcRenderer.invoke('load-embedding-model-memos'),
  addModelMemo: (memo: { provider: 'openai' | 'google'; model: string; endpoint: string; apiKey: string; type: 'chat' | 'embedding' }) => ipcRenderer.invoke('add-model-memo', memo),
  getModelMemo: (name: string) => ipcRenderer.invoke('get-model-memo', name),
  deleteModelMemo: (name: string) => ipcRenderer.invoke('delete-model-memo', name),
  markModelUsed: (name: string) => ipcRenderer.invoke('mark-model-used', name),

  // Google Drive operations
  googleAuthenticate: () => ipcRenderer.invoke('google-authenticate'),
  googleIsAuthenticated: () => ipcRenderer.invoke('google-is-authenticated'),
  googleLogout: () => ipcRenderer.invoke('google-logout'),
  googleGetUserInfo: () => ipcRenderer.invoke('google-get-user-info'),
  googleDriveListFiles: () => ipcRenderer.invoke('google-drive-list-files'),
  googleDriveUploadDatabase: () => ipcRenderer.invoke('google-drive-upload-database'),
  googleDriveDownloadDatabase: (fileId: string) => ipcRenderer.invoke('google-drive-download-database', fileId),
  googleDriveDeleteFile: (fileId: string) => ipcRenderer.invoke('google-drive-delete-file', fileId),

  // Event listeners for streaming
  onWordMeaningStreaming: (callback: (content: string) => void) => {
    ipcRenderer.on('word-meaning-streaming', (_event: Electron.IpcRendererEvent, content: string) => callback(content));
  },

  onWordMetadataReady: (callback: (toolData: { summary: string; tags: string[]; tag_colors: Record<string, string>; synonyms: string[]; antonyms: string[]; generationId: string; success: boolean; message: string }) => void) => {
    ipcRenderer.on('word-metadata-ready', (_event: Electron.IpcRendererEvent, toolData: { summary: string; tags: string[]; tag_colors: Record<string, string>; synonyms: string[]; antonyms: string[]; generationId: string; success: boolean; message: string }) => callback(toolData));
  },

  // Protocol handlers for custom URL scheme
  onProtocolNavigateWord: (callback: (wordName: string) => void) => {
    ipcRenderer.on('protocol-navigate-word', (_event: Electron.IpcRendererEvent, wordName: string) => callback(wordName));
  },

  onProtocolSwitchProfile: (callback: (profileName: string) => void) => {
    ipcRenderer.on('protocol-switch-profile', (_event: Electron.IpcRendererEvent, profileName: string) => callback(profileName));
  },

  // App ready signal
  sendAppRenderReady: () => {
    ipcRenderer.send('app-render-ready');
  },

  removeAllListeners: (event: string) => {
    ipcRenderer.removeAllListeners(event);
  },

  // Semantic Batch&Search operations
  startSemanticBatchProcessing: (config: any) => ipcRenderer.invoke('start-semantic-batch-processing', config),
  cancelSemanticBatchProcessing: () => ipcRenderer.invoke('cancel-semantic-batch-processing'),
  updateSemanticConfig: (config: { id: string; name: string; embedding_config: { 
    provider: string; model: string; endpoint: string; api_key: string; batch_size: number; similarity_threshold: number; }; }) => ipcRenderer.invoke('update-semantic-config', config),
  performSemanticSearch: (query: string, limit?: number) => ipcRenderer.invoke('perform-semantic-search', query, limit),

  // Semantic Batch event listeners
  onSemanticBatchProgress: (callback: (progress: { processed: number; total: number; }) => void) => {
    ipcRenderer.on('semantic-batch-progress', (_event: Electron.IpcRendererEvent, progress: { processed: number; total: number; }) => callback(progress));
  },
  onSemanticBatchComplete: (callback: (result: {
    success: boolean;
    totalWords: number;
    processed: number;
    failed: number;
    error: string;
    duration: number;
  }) => void) => {
    ipcRenderer.on('semantic-batch-complete', (_event: Electron.IpcRendererEvent, result: {
      success: boolean;
      totalWords: number;
      processed: number;
      failed: number;
      error: string;
      duration: number;
    }) => callback(result));
  },
});
