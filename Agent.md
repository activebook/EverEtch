# EverEtch Technical Architecture Documentation

## Overview

EverEtch is a sophisticated, AI-powered vocabulary learning application built with Electron, featuring semantic search capabilities, multi-profile architecture, and cloud synchronization. This document provides comprehensive technical specifications for LLM understanding and development purposes.

## Core Architecture

### Technology Stack

**Runtime Environment:**
- **Electron**: Cross-platform desktop application framework (v37.4.0)
- **Node.js**: Runtime environment (v20.19.13)
- **TypeScript**: Type-safe JavaScript compilation (v5.9.2)
- **Vite**: Build tool and development server

**Frontend Framework:**
- **HTML5/CSS3**: Markup and styling foundation
- **Tailwind CSS**: Utility-first CSS framework (v4.1.13)
- **Vanilla JavaScript**: Core frontend logic with TypeScript compilation

**Database Layer:**
- **SQLite**: Primary data storage with better-sqlite3 (v12.4.1)
- **sqlite-vec**: Vector database extension (v0.1.7-alpha.2)
- **FTS5**: Full-text search virtual tables

**AI Integration:**
- **OpenAI SDK**: GPT model integration (v5.20.0)
- **Google GenAI**: Gemini model integration (v1.19.0)

**External Services:**
- **Google Drive API**: Cloud storage and synchronization
- **Google OAuth2**: Authentication system

### Application Architecture

EverEtch follows a multi-process Electron architecture with strict separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process (Node.js)                   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Electron APIs & System Integration         │  │
│  │  • Window Management      • File System Access          │  │
│  │  • IPC Communication      • Protocol Handling           │  │
│  │  • External Service APIs  • Database Operations         │  │
│  └─────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Renderer Process (Chromium)              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                   User Interface Layer                  │  │
│  │  • DOM Manipulation       • Event Handling              │  │
│  │  • UI State Management    • Template Rendering          │  │
│  │  • User Interactions      • Real-time Updates           │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Database Architecture

### Storage Strategy

EverEtch implements a document-oriented storage pattern using SQLite as the underlying engine:

**Core Tables:**
```sql
documents (
  id TEXT PRIMARY KEY,           -- UUID-based document identifier
  type TEXT NOT NULL,           -- Document type (word, profile_config, etc.)
  data TEXT NOT NULL,           -- JSON document payload
  created_at DATETIME,          -- Creation timestamp
  updated_at DATETIME           -- Last modification timestamp
)
```

**Document Types:**
- `word`: Vocabulary entries with metadata
- `profile_config`: User profile configurations
- `tag`: Tag definitions and usage statistics

### Vector Database Implementation

**sqlite-vec Integration:**
```typescript
// Vector table schema using vec0 virtual table
CREATE VIRTUAL TABLE word_embeddings USING vec0(
  word_id TEXT,                    -- Foreign key to documents.id
  embedding float[2048],          -- 2048-dimensional embedding vector
  model_used TEXT                 -- Embedding model identifier
);
```

**Embedding Generation Pipeline:**
1. **Text Preparation**: Combines word, definition, synonyms, and detailed explanation
2. **Model Processing**: OpenAI text-embedding-3-large or Google embedding-001
3. **Vector Storage**: Atomic transactions with word document updates
4. **Similarity Search**: Cosine distance calculation using `vec_distance_cosine()`

### Full-Text Search (FTS5)

**Virtual Table Schema:**
```sql
CREATE VIRTUAL TABLE words_fts USING fts5(
  id, word, one_line_desc, tags, synonyms, antonyms,
  content='documents', content_rowid='rowid'
);
```

**Search Optimization:**
- BM25 scoring algorithm for relevance ranking
- Prefix matching with exact word prioritization
- Multi-field search across tags, synonyms, and definitions

## AI Integration Architecture

### Provider Abstraction Layer

**Interface Definition:**
```typescript
interface AIProvider {
  generateWordMeaning(
    word: string,
    profile: ProfileConfig,
    onStreaming?: (content: string) => void
  ): Promise<string>;

  generateWordMetas(
    word: string,
    meaning: string,
    profile: ProfileConfig
  ): Promise<ProcessedToolData>;
}
```

### OpenAI Provider Implementation

**Model Configuration:**
```typescript
const openai = new OpenAI({
  apiKey: profile.model_config.api_key,
  baseURL: profile.model_config.endpoint,
  model: profile.model_config.model  // gpt-4, gpt-3.5-turbo, etc.
});
```

**Streaming Implementation:**
```typescript
const completion = await openai.chat.completions.create({
  model: profile.model_config.model,
  messages: [...],
  stream: true
});

for await (const chunk of completion) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) {
    fullContent += delta;
    onStreaming?.(delta);  // Real-time UI updates
  }
}
```

### Google Gemini Provider Implementation

**Client Initialization:**
```typescript
const genAI = new GoogleGenAI({
  apiKey: profile.embedding_config.api_key
});

const responseStream = await genAI.models.generateContentStream({
  model: profile.model_config.model,
  contents: word,
  config: { systemInstruction: profile.system_prompt }
});
```

### Function Calling for Metadata Extraction

**Tool Definition Schema:**
```typescript
const WORD_METAS_TOOL = {
  type: 'function',
  function: {
    name: 'generate_word_metas',
    description: 'Generate comprehensive word metadata...',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One-line definition' },
        tags: { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 10 },
        tag_colors: { type: 'object', patternProperties: { '.*': { pattern: '^#[0-9A-Fa-f]{6}$' } } },
        synonyms: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
        antonyms: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 }
      },
      required: ['summary', 'tags', 'tag_colors', 'synonyms', 'antonyms']
    }
  }
};
```

## IPC Communication Layer

### Preload Script Architecture

**Context Bridge Implementation:**
```typescript
// src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  getWordsPaginated: (offset: number, limit: number, sortOrder?: 'asc' | 'desc') =>
    ipcRenderer.invoke('get-words-paginated', offset, limit, sortOrder),

  // AI operations
  generateWordMeaning: (word: string) =>
    ipcRenderer.invoke('generate-word-meaning', word),

  // Profile management
  switchProfile: (profileName: string) =>
    ipcRenderer.invoke('switch-profile', profileName),

  // Google Drive operations
  googleDriveUploadDatabase: () =>
    ipcRenderer.invoke('google-drive-upload-database'),

  // Semantic search
  performSemanticSearch: (query: string, limit?: number) =>
    ipcRenderer.invoke('perform-semantic-search', query, limit)
});
```

### Main Process Handler Registration

**IPC Handler Pattern:**
```typescript
// src/main.ts
import { ipcMain } from 'electron';

// Word operations
ipcMain.handle('get-words-paginated', async (event, offset: number, limit: number, sortOrder?: 'asc' | 'desc') => {
  return dbManager.getWordsPaginated(offset, limit, sortOrder);
});

ipcMain.handle('generate-word-meaning', async (event, word: string) => {
  const profile = await profileManager.getCurrentProfile();
  if (!profile) return null;

  const onStreaming = (content: string) => {
    event.sender.send('word-meaning-streaming', content);
  };

  return aiClient.generateWordMeaning(word, profile, onStreaming);
});

// Semantic search operations
ipcMain.handle('perform-semantic-search', async (event, query: string, limit: number = 10) => {
  return semanticSearchService.search(query, { limit, threshold: 0.5 });
});
```

## Multi-Profile Architecture

### Profile Configuration Schema

**ProfileConfig Interface:**
```typescript
interface ProfileConfig {
  id: string;                    // UUID-based profile identifier
  name: string;                  // User-defined profile name
  system_prompt: string;         // AI system instruction
  model_config: {
    provider: 'openai' | 'google';
    model: string;               // Model identifier (gpt-4, gemini-pro, etc.)
    endpoint: string;            // API endpoint URL
    api_key: string;             // Encrypted API key
  };
  embedding_config?: {
    provider: 'openai' | 'google';
    model: string;               // Embedding model (text-embedding-3-large, etc.)
    endpoint: string;
    api_key: string;
    batch_size: number;          // Batch processing size (default: 10)
    similarity_threshold: number; // Cosine similarity threshold (default: 0.5)
    enabled: boolean;            // Feature flag
  };
  last_opened: string;           // ISO timestamp
}
```

### Profile Management System

**ProfileManager Class:**
```typescript
class ProfileManager {
  private dbManager: DatabaseManager;
  private currentProfile: ProfileConfig | null = null;

  async createProfile(name: string): Promise<ProfileConfig> {
    // Validate profile name uniqueness
    // Generate profile configuration
    // Store in database
  }

  async switchProfile(profileName: string): Promise<boolean> {
    // Load profile configuration
    // Update current profile reference
    // Trigger UI refresh
  }

  async updateProfileConfig(profileName: string, config: Partial<ProfileConfig>): Promise<boolean> {
    // Atomic configuration update
    // Validate configuration integrity
    // Update database record
  }
}
```

## Semantic Search Implementation

### Vector Embedding Pipeline

**Embedding Generation Flow:**
```typescript
class EmbeddingModelClient {
  async generateWordEmbedding(wordDoc: WordDocument, profile: ProfileConfig): Promise<EmbeddingResult> {
    // Prepare text for embedding
    const textForEmbedding = this.prepareTextForEmbedding(wordDoc);

    // Generate embedding using configured provider
    const result = await this.generateEmbedding(textForEmbedding, profile);

    return result;
  }

  private prepareTextForEmbedding(wordDoc: WordDocument): string {
    const cleanDetails = wordDoc.details.replace(/<[^>]*>/g, '').trim();

    return [
      `Word: ${wordDoc.word}`,
      `Definition: ${wordDoc.one_line_desc}`,
      `Explanation: ${cleanDetails}`,
      `Synonyms: ${wordDoc.synonyms.join(', ')}`
    ].join('\n');
  }
}
```

### Batch Processing Architecture

**SemanticBatchService Implementation:**
```typescript
class SemanticBatchService {
  async startBatchProcessing(options: {
    batchSize: number;
    onProgress: (processed: number, total: number) => void;
    onComplete: (result: BatchResult) => void;
  }): Promise<{ success: boolean; error?: string }> {

    // Get all words without embeddings
    const wordsToProcess = await this.getWordsNeedingEmbeddings();

    // Process in batches
    for (let i = 0; i < wordsToProcess.length; i += options.batchSize) {
      const batch = wordsToProcess.slice(i, i + options.batchSize);

      // Generate embeddings for batch
      const embeddings = await this.generateBatchEmbeddings(batch);

      // Store embeddings in vector database
      await this.storeBatchEmbeddings(embeddings);

      // Report progress
      options.onProgress(i + batch.length, wordsToProcess.length);
    }

    options.onComplete({ success: true, processed: wordsToProcess.length });
  }
}
```

### Similarity Search Algorithm

**Cosine Similarity Implementation:**
```typescript
static cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**SQLite Vector Query:**
```sql
SELECT
  we.word_id,
  d.data,
  vec_distance_cosine(we.embedding, ?) AS distance
FROM word_embeddings we
JOIN documents d ON we.word_id = d.id
WHERE d.type = 'word'
  AND vec_distance_cosine(we.embedding, ?) <= ?
ORDER BY distance ASC
LIMIT ?
```

## Google Drive Integration

### OAuth2 Authentication Flow

**Authentication Service Implementation:**
```typescript
class GoogleAuthService {
  async authenticate(): Promise<boolean> {
    // Generate OAuth2 authorization URL
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file']
    });

    // Open system browser for authentication
    await shell.openExternal(authUrl);

    // Start local server to receive callback
    return this.startLocalServer();
  }

  private async startLocalServer(): Promise<boolean> {
    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, 'http://localhost');
        const code = url.searchParams.get('code');

        if (code) {
          // Exchange code for tokens
          const { tokens } = await this.oauth2Client.getToken(code);
          this.oauth2Client.setCredentials(tokens);

          // Save tokens securely
          await this.saveTokens(tokens);

          res.end('<script>window.close()</script>');
          server.close();
          resolve(true);
        }
      });

      server.listen(8080);
    });
  }
}
```

### Drive Service Operations

**File Upload Implementation:**
```typescript
class GoogleDriveService {
  async uploadFile(fileName: string, fileBuffer: Buffer, folderId: string): Promise<UploadResult> {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType: 'application/octet-stream',
        body: Readable.from(fileBuffer)
      }
    });

    return {
      success: true,
      fileId: response.data.id!,
      webViewLink: response.data.webViewLink
    };
  }
}
```

## Security Architecture

### API Key Management

**Encryption Strategy:**
```typescript
// src/utils/Encryption.ts
class EncryptionService {
  private algorithm = 'aes-256-cbc';
  private key: Buffer;

  constructor() {
    // Derive key from system-specific information
    this.key = crypto.scryptSync(process.env.ENCRYPTION_PASSWORD || 'default', 'salt', 32);
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.key);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  decrypt(encryptedText: string): string {
    const [ivHex, encryptedHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipher(this.algorithm, this.key);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
```

### Protocol Handler Security

**Custom URL Scheme Implementation:**
```typescript
// src/main.ts
app.on('open-url', (event, url) => {
  event.preventDefault();

  if (url.startsWith('everetch://')) {
    const urlWithoutProtocol = url.replace('everetch://', '');
    const urlParts = urlWithoutProtocol.split('/');

    // Validate and sanitize URL components
    if (this.isValidProtocolAction(urlParts)) {
      this.handleProtocolUrl(url);
    }
  }
});

private isValidProtocolAction(parts: string[]): boolean {
  // Validate URL structure and parameters
  const validActions = ['word', 'profile', 'open'];
  return parts.length >= 1 && validActions.includes(parts[0]);
}
```

## Configuration Management

### Model Configuration System

**ModelManager Implementation:**
```typescript
class ModelManager {
  private static readonly MODELS_FILE = 'models.json';
  private static readonly CHAT_MODELS_FILE = 'chat_models.json';
  private static readonly EMBEDDING_MODELS_FILE = 'embedding_models.json';

  static loadModels(): AIModelConfig[] {
    const filePath = this.getModelsFilePath(this.MODELS_FILE);
    if (!fs.existsSync(filePath)) return [];

    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }

  static addModel(modelData: AIModelConfig): AIModelConfig {
    const models = this.loadModels();
    const existingIndex = models.findIndex(m => m.name === modelData.name);

    if (existingIndex >= 0) {
      models[existingIndex] = { ...models[existingIndex], ...modelData };
    } else {
      models.push(modelData);
    }

    this.saveModels(models);
    return modelData;
  }
}
```

### Store Management (Electron Store)

**Persistent Configuration:**
```typescript
class StoreManager {
  private store = new ElectronStore();

  saveWindowBounds(bounds: Electron.Rectangle): void {
    this.store.set('windowBounds', bounds);
  }

  loadWindowBounds(): Electron.Rectangle | null {
    return this.store.get('windowBounds');
  }

  savePanelWidths(widths: Record<string, number>): void {
    this.store.set('panelWidths', widths);
  }

  loadPanelWidths(): Record<string, number> {
    return this.store.get('panelWidths', { left: 300, middle: 400, right: 300 });
  }
}
```

## Performance Optimizations

### Database Query Optimization

**Paginated Loading Strategy:**
```typescript
getWordsPaginated(offset: number, limit: number, sortOrder: 'asc' | 'desc' = 'desc') {
  const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const query = `
    SELECT
      id,
      json_extract(data, '$.word') as word,
      json_extract(data, '$.one_line_desc') as one_line_desc,
      json_extract(data, '$.remark') as remark
    FROM documents
    WHERE type = 'word'
    ORDER BY created_at ${orderDirection}, updated_at ${orderDirection}
    LIMIT ${limit} OFFSET ${offset}
  `;

  return this.db.prepare(query).all();
}
```

### Memory Management

**Lazy Loading Implementation:**
```typescript
class WordManager {
  private loadedWords: WordDocument[] = [];
  private currentOffset = 0;
  private readonly PAGE_SIZE = 50;

  async loadMoreWords(): Promise<WordDocument[]> {
    const result = await this.dbManager.getWordsPaginated(
      this.currentOffset,
      this.PAGE_SIZE
    );

    this.currentOffset += this.PAGE_SIZE;
    this.loadedWords.push(...result.words);

    return result.words;
  }
}
```

### Caching Strategy

**Embedding Cache Implementation:**
```typescript
class EmbeddingCache {
  private cache = new Map<string, number[]>();
  private readonly MAX_CACHE_SIZE = 1000;

  get(wordId: string, model: string): number[] | null {
    const key = `${wordId}:${model}`;
    return this.cache.get(key) || null;
  }

  set(wordId: string, model: string, embedding: number[]): void {
    const key = `${wordId}:${model}`;

    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry (simple LRU)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, embedding);
  }
}
```

## Error Handling and Recovery

### Database Recovery System

**DatabaseRecovery Class:**
```typescript
class DatabaseRecovery {
  constructor(private db: Database.Database) {}

  createOrUpdateFTSTable(): void {
    try {
      // Attempt to create FTS table
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS words_fts USING fts5(
          id, word, one_line_desc, tags, synonyms, antonyms,
          content='documents', content_rowid='rowid'
        );
      `);
    } catch (error) {
      // Fallback: Drop and recreate if corrupted
      this.db.exec('DROP TABLE IF EXISTS words_fts;');
      this.db.exec(`
        CREATE VIRTUAL TABLE words_fts USING fts5(
          id, word, one_line_desc, tags, synonyms, antonyms,
          content='documents', content_rowid='rowid'
        );
      `);
    }
  }
}
```

### Graceful Degradation

**AI Provider Fallback:**
```typescript
class AIModelClient {
  async generateWordMeaning(word: string, profile: ProfileConfig): Promise<string> {
    try {
      return await this.provider.generateWordMeaning(word, profile);
    } catch (error) {
      // Fallback to alternative provider
      if (profile.model_config.provider === 'openai') {
        profile.model_config.provider = 'google';
        return await this.provider.generateWordMeaning(word, profile);
      }

      // Final fallback: return basic definition
      return `Definition of "${word}": [AI service unavailable]`;
    }
  }
}
```

## Build and Deployment

### Build Configuration

**Electron Builder Setup:**
```json
{
  "build": {
    "asar": true,
    "asarUnpack": [
      "node_modules/sqlite-vec-darwin-x64/**/*"
    ],
    "appId": "com.activebook.everetch",
    "productName": "EverEtch",
    "directories": {
      "output": "dist",
      "buildResources": "assets/icons"
    },
    "files": [
      "assets/**/*",
      "lib/**/*",
      "node_modules/**/*",
      "package.json",
      "credentials.enc"
    ],
    "mac": {
      "category": "public.app-category.productivity",
      "icon": "icon.icns",
      "target": [{ "target": "dir", "arch": ["x64"] }]
    },
    "win": {
      "icon": "icon.ico",
      "target": [{ "target": "nsis", "arch": ["x64", "ia32"] }]
    },
    "linux": {
      "icon": "icon_512x512.png",
      "target": [
        { "target": "AppImage", "arch": ["x64"] },
        { "target": "deb", "arch": ["x64"] }
      ]
    }
  }
}
```

### Development Workflow

**Build Scripts:**
```json
{
  "scripts": {
    "dev": "npm run build && electron .",
    "build": "tsc && npm run build-css && npm run copy-html && npm run copy-templates && npm run inject-version",
    "build-css": "postcss ./src/renderer/styles.css -o ./lib/renderer/styles.css",
    "copy-html": "mkdir -p lib/renderer && cp src/renderer/index.html lib/renderer/",
    "copy-templates": "mkdir -p lib/renderer && cp -r src/renderer/templates lib/renderer/",
    "dist": "npm run build && electron-builder",
    "dist:mac": "npm run build && electron-builder --mac",
    "dist:win": "npm run build && electron-builder --win",
    "dist:linux": "npm run build && electron-builder --linux"
  }
}
```

## System Integration

### Protocol Handler Registration

**Custom URL Scheme:**
```typescript
// src/main.ts
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'everetch',
    privileges: {
      bypassCSP: true,
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('everetch://')) {
    handleProtocolUrl(url);
  }
});
```

### System Proxy Configuration

**Proxy Management:**
```typescript
class SysProxy {
  static apply(): void {
    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    if (proxyUrl) {
      // Configure system proxy settings
      process.env.ELECTRON_SYSTEM_PROXY = proxyUrl;
    }
  }
}
```

## Testing and Quality Assurance

### IPC Testing Strategy

**Mock Implementation:**
```typescript
// test/mocks/electron.ts
export const mockElectronAPI = {
  getWordsPaginated: jest.fn(),
  generateWordMeaning: jest.fn(),
  switchProfile: jest.fn(),
  googleDriveUploadDatabase: jest.fn(),
  performSemanticSearch: jest.fn()
};

// Setup in test environment
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI
});
```

### Database Testing

**SQLite Test Database:**
```typescript
class TestDatabaseManager {
  private testDb: Database.Database;

  constructor() {
    this.testDb = new Database(':memory:');  // In-memory database
    this.initializeTestSchema();
  }

  private initializeTestSchema(): void {
    // Create test tables matching production schema
    this.testDb.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
}
```

## Future Enhancements

### Planned Features

1. **MCP Server Integration**: Model Context Protocol for LLM interaction
2. **Advanced Analytics**: Learning progress tracking and insights
3. **Collaborative Features**: Shared vocabulary collections
4. **Mobile Applications**: iOS and Android native apps
5. **Offline Mode**: Enhanced offline capabilities with local AI models

### Scalability Considerations

1. **Database Sharding**: Horizontal partitioning for large vocabulary collections
2. **Caching Layer**: Redis integration for high-traffic scenarios
3. **Microservices Architecture**: Separation of AI services into independent services
4. **CDN Integration**: Static asset delivery optimization

This comprehensive technical documentation provides complete architectural understanding for development, maintenance, and future enhancements of the EverEtch application.