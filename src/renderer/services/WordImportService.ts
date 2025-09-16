import { WordService } from './WordService.js';
import { ToastManager } from '../components/ToastManager.js';
import { generateGenerationId } from '../utils/Common.js';
import { WordDocument } from '../types.js';
import { stat } from 'fs';
import { timingSafeEqual } from 'crypto';

export interface ImportProgress {
  current: number;
  total: number;
  currentWord: string;
  isComplete: boolean;
  isCancelled: boolean;
  errors: string[];
  skipped: number;
  success: number;
}

export interface ImportCallbacks {
  onProgress: (progress: ImportProgress) => void;
  onComplete: (progress: ImportProgress) => void;
  onError: (progress: ImportProgress) => void;
  onCancel: (progress: ImportProgress) => void;
}

export class WordImportService {
  private wordService: WordService;
  private toastManager: ToastManager;
  private callbacks: ImportCallbacks | null = null;
  private isImporting = false;
  private isCancelled = false;
  private words: string[] = [];
  private currentIndex = 0;
  private progress: ImportProgress = {
    current: 0,
    total: 0,
    currentWord: '',
    isComplete: false,
    isCancelled: false,
    errors: [],
    skipped: 0,
    success: 0
  };

  constructor(wordService: WordService, toastManager: ToastManager) {
    this.wordService = wordService;
    this.toastManager = toastManager;
  }

  async startImport(fileContent: string, callbacks: ImportCallbacks): Promise<void> {
    if (this.isImporting) {
      throw new Error('Import already in progress');
    }

    this.callbacks = callbacks;
    this.isImporting = true;
    this.isCancelled = false;
    this.currentIndex = 0;

    // Parse words from file content
    this.words = this.parseWordsFromContent(fileContent);
    this.progress = {
      current: 0,
      total: this.words.length,
      currentWord: '',
      isComplete: false,
      isCancelled: false,
      errors: [],
      skipped: 0,
      success: 0
    };

    console.log(`Starting import of ${this.words.length} words`);

    // Send initial progress (0)
    if (this.callbacks?.onProgress) {
      this.callbacks.onProgress(this.progress);
    }

    // Start processing
    this.processNextWord();
  }

  cancelImport(): void {
    if (!this.isImporting) return;

    console.log('Cancelling import...');
    this.isCancelled = true;
    this.isImporting = false;
    this.progress.isCancelled = true;

    if (this.callbacks?.onCancel) {
      this.callbacks.onCancel(this.progress);
    }
  }

  getProgress(): ImportProgress {
    return { ...this.progress };
  }

  private parseWordsFromContent(content: string): string[] {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !line.startsWith('#') && !line.startsWith('//') && !line.startsWith(';')) // Skip comments
      .filter((word, index, arr) => arr.indexOf(word) === index); // Remove duplicates
  }

  private async processNextWord(): Promise<void> {
    if (this.isCancelled || !this.callbacks) {
      return;
    }

    if (this.currentIndex >= this.words.length) {
      // Import complete
      this.isImporting = false;
      this.progress.isComplete = true;
      this.callbacks.onComplete(this.progress);
      return;
    }

    const word = this.words[this.currentIndex];
    this.progress.currentWord = word;
    this.progress.current = this.currentIndex + 1;

    console.log(`Processing word ${this.currentIndex + 1}/${this.words.length}: ${word}`);

    try {
      // Check if word already exists using exact name match
      const existingWord = await this.wordService.getWordByName(word);

      if (existingWord) {
        console.log(`Word "${word}" already exists, skipping`);
        this.progress.skipped++;
        this.handleWordComplete(word, true);
        return;
      }

      // Generate word meaning and metadata
      await this.generateWord(word);

    } catch (error) {
      console.error(`Error processing word "${word}":`, error);
      const errorMessage = `Failed to process "${word}": ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.progress.errors.push(errorMessage);
      this.toastManager.showError(`Import stopped due to error: ${errorMessage}`);

      // Stop the entire import process on any error
      this.isImporting = false;
      this.progress.isComplete = true;

      if (this.callbacks?.onError) {
        this.callbacks.onError(this.progress);
      }
      return;
    }
  }

  private async generateWord(word: string): Promise<void> {
    try {
      // Generate meaning (this will trigger the streaming and metadata generation)
      const meaning = await this.wordService.generateWordMeaning(word);

      if (!meaning || meaning.trim().length === 0) {
        throw new Error('Generated meaning is empty');
      }

      // Generate consistent generation ID using utility function
      const generationId = generateGenerationId();

      // Generate metadata (tags, summary, etc.) - this returns the actual metadata
      const metadata = await this.wordService.generateWordMetas(word, meaning, generationId);

      if (!metadata) {
        throw new Error('Failed to generate word metadata');
      }

      // Add the word to database with the generated metadata
      const addResult = await this.addWordToDatabase(word, meaning, metadata);

      if (addResult) {
        this.progress.success++; // Increment success counter
        console.log(`Successfully added word "${word}" to database with generated metadata`);
        // Continue to next word
        this.handleWordComplete(word, false);
      } else {
        console.warn(`Failed to add word "${word}" to database (addWord returned falsy)`);
        // Push error to error array
        this.progress.errors.push(`Failed to add word "${word}" to database`);
        // Continue to next word as failed
        this.handleWordComplete(word, false);
      }

    } catch (error) {
      throw error;
    }
  }

  private async addWordToDatabase(word: string, meaning: string, metadata: any): Promise<WordDocument> {
    try {
      // Create word data using the generated meaning and metadata
      const wordData = {
        word: word,
        one_line_desc: metadata.summary || ``,
        details: meaning,
        tags: metadata.tags || [],
        tag_colors: metadata.tag_colors || {},
        synonyms: metadata.synonyms || [],
        antonyms: metadata.antonyms || []
      };

      const addResult = await this.wordService.addWord(wordData);
      return addResult;
    } catch (error) {
      console.error(`Error adding word "${word}" to database:`, error);
      throw error;
    }
  }



  private handleWordComplete(word: string, skipped: boolean): void {
    if (this.isCancelled) return;

    if (this.progress.errors.length > 0) {
      // Stop the entire import process on any error
      this.callbacks?.onError(this.progress);
      return;
    }

    this.currentIndex++;

    // Update progress
    this.callbacks?.onProgress(this.progress);

    // Process next word
    let timeLapse = 500
    if (skipped) {
      timeLapse = 10
    }
    setTimeout(() => {
      this.processNextWord();
    }, timeLapse); // Small delay between words
  }
}
