// Type definitions for Electron API

// Base result interfaces
export interface ApiResult {
    success: boolean;
    message: string;
}

export interface ApiError extends ApiResult {
    success: false;
    message: string;
}

// Profile operations
export interface ProfileResult extends ApiResult {
    profileName?: string;
}

export interface ProfilesListResult extends ApiResult {
    profiles: string[];
}

// Word operations
export interface PaginatedWordsResult extends ApiResult {
    words: WordListItem[];
    hasMore: boolean;
    total: number;
}

export interface WordResult extends ApiResult {
    word?: WordDocument;
    data?: WordDocument; // For addWord/updateWord responses
}

export interface WordsResult extends ApiResult {
    words: WordListItem[];
}

// Word operation results with success/error pattern
export interface WordOperationResult extends ApiResult {
    data?: WordDocument;
    error?: string;
}

export interface WordDeleteResult extends ApiResult {
    error?: string;
}

// AI operations
export interface WordGenerationResult extends ApiResult {
    summary: string;
    tags: string[];
    tag_colors: Record<string, string>;
    synonyms: string[];
    antonyms: string[];
    generationId: string;
}

// Google Drive operations
export interface GoogleAuthResult extends ApiResult {
    authenticated?: boolean;
    userInfo?: GoogleUserInfo;
}

export interface GoogleDriveFileResult extends ApiResult {
    files: DriveFile[];
}

export interface GoogleDriveUploadResult extends ApiResult {
    fileId?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: string;
}

export interface GoogleDriveDownloadResult extends ApiResult {
    profileName?: string;
}

export interface GoogleDriveDeleteResult extends ApiResult {
    // Inherits success and message from ApiResult
}

// Model operations
export interface ModelResult extends ApiResult {
    model?: ModelMemo;
}

export interface ModelsResult extends ApiResult {
    models: ModelMemo[];
}

export interface ModelDeleteResult extends ApiResult {
    // Inherits success and message from ApiResult
}

// Profile config operations
export interface ProfileConfigResult extends ApiResult {
    config?: ProfileConfig;
}

// Import/Export operations
export interface ExportResult extends ApiResult {
    filePath?: string;
}

export interface ImportResult extends ApiResult {
    profileName?: string;
}

// Google Drive file interface
export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    size?: string | null;
    parents?: string[] | null;
}

// Google user info interface
export interface GoogleUserInfo {
    id: string;
    email: string;
    name: string;
    picture?: string;
}

// Word data interfaces
export interface WordData {
    word: string;
    one_line_desc: string;
    details: string;
    tags: string[];
    tag_colors: Record<string, string>;
    synonyms: string[];
    antonyms: string[];
    remark?: string;
    embedding?: number[];
}

export interface WordDocument {
    id: string;
    word: string;
    one_line_desc: string;
    details: string;
    tags: string[];
    tag_colors: Record<string, string>;
    synonyms: string[];
    antonyms: string[];
    remark?: string;
    embedding?: number[];
    created_at: string;
    updated_at: string;
}

export interface WordListItem {
    id: string;
    word: string;
    one_line_desc: string;
    remark?: string;
}

export interface ProfileConfig {
    id: string;
    name: string;
    system_prompt: string;
    model_config: {
        provider: string;
        model: string;
        endpoint: string;
        api_key: string;
    };
    embedding_config?: {
        provider: string;
        model: string;
        endpoint: string;
        api_key: string;
        batch_size: number;
        similarity_threshold: number;
        enabled?: boolean;
    };
    last_opened: string;
}

export interface PaginationState {
    offset: number;
    pageSize: number;
    isLoading: boolean;
    hasMore: boolean;
    total: number;
}

export interface AssociatedWordsState extends PaginationState {
    words: WordListItem[];
    currentTag: string;
    scrollObserver: IntersectionObserver | null;
}

export interface AppState {
    currentWord: WordDocument | null;
    currentGenerationId: string;
    profiles: string[];
    currentProfile: string;
    streamingContent: string;
    isResizing: boolean;
    resizeHandle: HTMLElement | null;
    startX: number;
    startLeftWidth: number;
    startMiddleWidth: number;
    startRightWidth: number;
    words: WordListItem[];
    wordsPagination: PaginationState;
    scrollObserver: IntersectionObserver | null;
    associatedWordsState: AssociatedWordsState;
    isSearchMode: boolean;
    isGenerating: boolean;
}

export interface ModelMemo {
    name: string;
    provider: 'openai' | 'google';
    model: string;
    endpoint: string;
    apiKey: string;
    type: 'chat' | 'embedding';
    createdAt: string;
    lastUsed?: string;
}

export interface SemanticSearchSettings {
    enabled: boolean;
    similarity_threshold: number;
    batch_size: number;
}

declare global {
    interface Window {
        electronAPI: {
            // Profile management
            loadProfiles: () => Promise<string[]>;
            getProfiles: () => Promise<string[]>;
            getCurrentProfileName: () => Promise<string | null>;
            switchProfile: (profileName: string) => Promise<boolean>;
            createProfile: (profileName: string) => Promise<boolean>;
            renameProfile: (oldName: string, newName: string) => Promise<boolean>;
            deleteProfile: (profileName: string) => Promise<boolean>;

            // Word operations
            getWordsPaginated: (offset: number, limit: number, sortOrder?: 'asc' | 'desc') => Promise<{ words: WordListItem[], hasMore: boolean, total: number }>;
            searchWords: (query: string) => Promise<WordListItem[]>;
            getWord: (wordId: string) => Promise<WordDocument | null>;
            getWordByName: (wordName: string) => Promise<WordDocument | null>;
            addWord: (wordData: WordData) => Promise<WordOperationResult>;
            updateWord: (wordId: string, wordData: Partial<WordData>) => Promise<WordOperationResult>;
            updateWordRemark: (wordId: string, remark: string) => Promise<WordOperationResult>;
            deleteWord: (wordId: string) => Promise<WordDeleteResult>;

            // AI operations
            generateWordMeaning: (word: string) => Promise<string>;
            generateWordMetas: (word: string, meaning: string, generationId: string) => Promise<WordGenerationResult>;
            generateWordEmbedding: (wordData: { word: string; meaning: string; summary: string; tags: string[]; synonyms: string[]; antonyms: string[]; }) => Promise<{ success: boolean; embedding: number[]; model_used: string; tokens_used: number; }>;

            // Associated words
            getRelatedWordsPaginated: (searchTerm: string, offset: number, limit: number) => Promise<{ words: WordListItem[], hasMore: boolean, total: number }>;

            // Profile config
            getProfileConfig: () => Promise<ProfileConfig | null>;
            updateProfileConfig: (config: ProfileConfig) => Promise<boolean>;

            // Markdown processing
            processMarkdown: (markdown: string) => Promise<string>;

            // App ready signal
            sendAppRenderReady: () => Promise<void>;

            // Profile import/export
            exportProfile: () => Promise<ExportResult>;
            importProfile: () => Promise<ImportResult>;

            // Model memo operations
            loadModelMemos: () => Promise<ModelMemo[]>;
            loadChatModelMemos: () => Promise<ModelMemo[]>;
            loadEmbeddingModelMemos: () => Promise<ModelMemo[]>;
            addModelMemo: (memo: Omit<ModelMemo, 'name'|'createdAt'|'type'>) => Promise<ModelResult>;
            getModelMemo: (name: string) => Promise<ModelResult>;
            deleteModelMemo: (name: string) => Promise<ModelDeleteResult>;
            markModelUsed: (name: string) => Promise<boolean>;

            // Google Drive operations
            googleAuthenticate: () => Promise<GoogleAuthResult>;
            googleIsAuthenticated: () => Promise<GoogleAuthResult>;
            googleLogout: () => Promise<GoogleAuthResult>;
            googleGetUserInfo: () => Promise<GoogleAuthResult>;
            googleDriveListFiles: () => Promise<GoogleDriveFileResult>;
            googleDriveUploadDatabase: () => Promise<GoogleDriveUploadResult>;
            googleDriveDownloadDatabase: (fileId: string) => Promise<GoogleDriveDownloadResult>;
            googleDriveDeleteFile: (fileId: string) => Promise<GoogleDriveDeleteResult>;

            // Sort order persistence
            loadSortOrder: () => Promise<'asc' | 'desc'>;
            saveSortOrder: (sortOrder: 'asc' | 'desc') => Promise<void>;

            // Event listeners for streaming
            onWordMeaningStreaming: (callback: (content: string) => void) => void;
            onWordMetadataReady: (callback: (toolData: WordGenerationResult) => void) => void;

            // Protocol handlers for custom URL scheme
            onProtocolNavigateWord: (callback: (wordName: string) => void) => void;
            onProtocolSwitchProfile: (callback: (profileName: string) => void) => void;

            // Semantic Search operations
            startSemanticBatchProcessing: (config: any, updateExisting: boolean) => Promise<{ success: boolean; message: string; }>;
            cancelSemanticBatchProcessing: () => Promise<{ success: boolean; message: string; }>;
            updateSemanticConfig: (config: { id: string; name: string; embedding_config: {
              provider: string; model: string; endpoint: string; api_key: string; batch_size: number; similarity_threshold: number; }; }) => Promise<{ success: boolean; message: string; }>;
            performSemanticSearch: (query: string, limit?: number) => Promise<{ success: boolean; message: string; results: any[] }>;

            // Semantic Search event listeners
            onSemanticBatchProgress: (callback: (progress: { processed: number; total: number; }) => void) => void;
            onSemanticBatchComplete: (callback: (result: {
              success: boolean;
              totalWords: number;
              processed: number;
              failed: number;
              error: string;
              duration: number;
            }) => void) => void;

            removeAllListeners: (event: string) => void;
        };
    }
}

// In a .d.ts file or at the top of your file
declare global {
  interface HTMLButtonElement {
    _listenerAdded?: boolean;
  }
  interface HTMLElement {
    _listenerAdded?: boolean;
  }
}


export { }; // This makes the file a module
