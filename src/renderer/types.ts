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
}

export interface WordsResult extends ApiResult {
    words: WordListItem[];
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
    createdAt: string;
    lastUsed?: string;
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
            addWord: (wordData: WordData) => Promise<WordDocument>;
            updateWord: (wordId: string, wordData: Partial<WordData>) => Promise<WordDocument | null>;
            updateWordRemark: (wordId: string, remark: string) => Promise<WordDocument | null>;
            deleteWord: (wordId: string) => Promise<boolean>;

            // AI operations
            generateWordMeaning: (word: string) => Promise<string>;
            generateWordMetas: (word: string, meaning: string, generationId: string) => Promise<WordGenerationResult>;

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
            addModelMemo: (memo: Omit<ModelMemo, 'name'|'createdAt'>) => Promise<ModelResult>;
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
