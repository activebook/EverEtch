// Type definitions for Electron API
declare global {
    interface Window {
        electronAPI: {
            loadProfiles: () => Promise<string[]>;
            getProfiles: () => Promise<string[]>;
            getCurrentProfileName: () => Promise<string | null>;
            switchProfile: (profileName: string) => Promise<boolean>;
            createProfile: (profileName: string) => Promise<boolean>;
            renameProfile: (oldName: string, newName: string) => Promise<boolean>;
            deleteProfile: (profileName: string) => Promise<boolean>;
            getWordsPaginated: (offset: number, limit: number, sortOrder?: 'asc' | 'desc') => Promise<{ words: WordListItem[], hasMore: boolean, total: number }>;
            searchWords: (query: string) => Promise<WordListItem[]>;
            getWord: (wordId: string) => Promise<any>;
            getWordByName: (wordName: string) => Promise<any>;
            addWord: (wordData: any) => Promise<any>;
            updateWord: (wordId: string, wordData: any) => Promise<any>;
            updateWordRemark: (wordId: string, remark: string) => Promise<any>;
            deleteWord: (wordId: string) => Promise<boolean>;
            generateWordMeaning: (word: string) => Promise<string>;
            generateWordMetas: (word: string, meaning: string, generationId: string) => Promise<any>;
            generateMeaning: (word: string) => Promise<string>;
            getRelatedWordsPaginated: (searchTerm: string, offset: number, limit: number) => Promise<{ words: WordListItem[], hasMore: boolean, total: number }>;
            getProfileConfig: () => Promise<any>;
            updateProfileConfig: (config: any) => Promise<boolean>;            
            processMarkdown: (markdown: string) => Promise<string>;

            // App Render ready
            sendAppRenderReady: () => Promise<void>;

            // Profile import/export
            exportProfile: () => Promise<any>;
            importProfile: () => Promise<any>;

            // Sort order persistence
            loadSortOrder: () => Promise<'asc' | 'desc'>;
            saveSortOrder: (sortOrder: 'asc' | 'desc') => Promise<void>;

            onWordMeaningStreaming: (callback: Function) => void;
            onWordMetadataReady: (callback: Function) => void;

            // Protocol handlers for custom URL scheme
            onProtocolNavigateWord: (callback: Function) => void;
            onProtocolSwitchProfile: (callback: Function) => void;

            removeAllListeners: (event: string) => void;
        };
    }
}

export { }; // This makes the file a module

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
