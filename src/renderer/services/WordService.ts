import { WordData, WordDocument, WordListItem } from '../types.js';

export class WordService {
  async searchWords(query: string): Promise<WordListItem[]> {
    try {
      return await window.electronAPI.searchWords(query);
    } catch (error) {
      console.error('Error searching words:', error);
      return [];
    }
  }

  async getWord(wordId: string): Promise<WordDocument | null> {
    try {
      return await window.electronAPI.getWord(wordId);
    } catch (error) {
      console.error('Error fetching word:', error);
      return null;
    }
  }

  async addWord(wordData: WordData): Promise<WordDocument> {
    try {
      const result = await window.electronAPI.addWord(wordData);
      if (result.success && result.data) {
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to add word');
      }
    } catch (error) {
      console.error('Error adding word:', error);
      throw error;
    }
  }

  async updateWord(wordId: string, wordData: WordData): Promise<WordDocument | null> {
    try {
      const result = await window.electronAPI.updateWord(wordId, wordData);
      if (result.success && result.data) {
        return result.data;
      } else {
        console.error('Error updating word:', result.error || 'Failed to update word');
        return null;
      }
    } catch (error) {
      console.error('Error updating word:', error);
      return null;
    }
  }

  async updateWordRemark(wordId: string, remark: string): Promise<WordDocument | null> {
    try {
      const result = await window.electronAPI.updateWordRemark(wordId, remark);
      if (result.success && result.data) {
        return result.data;
      } else {
        console.error('Error updating word remark:', result.error || 'Failed to update word remark');
        return null;
      }
    } catch (error) {
      console.error('Error updating word remark:', error);
      return null;
    }
  }

  async deleteWord(wordId: string): Promise<boolean> {
    try {
      const result = await window.electronAPI.deleteWord(wordId);
      if (result.success) {
        return true;
      } else {
        console.error('Error deleting word:', result.error || 'Failed to delete word');
        return false;
      }
    } catch (error) {
      console.error('Error deleting word:', error);
      return false;
    }
  }

  async generateWordMeaning(word: string): Promise<string> {
    try {
      return await window.electronAPI.generateWordMeaning(word);
    } catch (error) {
      console.error('Error generating word meaning:', error);
      throw error;
    }
  }

  async generateWordMetas(word: string, meaning: string, generationId: string): Promise<any> {
    try {
      return await window.electronAPI.generateWordMetas(word, meaning, generationId);
    } catch (error) {
      console.error('Error generating word metas:', error);
      throw error;
    }
  }

  async processMarkdown(markdown: string): Promise<string> {
    try {
      return await window.electronAPI.processMarkdown(markdown);
    } catch (error) {
      console.error('Error processing markdown:', error);
      return markdown; // Return original markdown if processing fails
    }
  }

  async getWordByName(wordName: string): Promise<WordDocument | null> {
    try {
      return await window.electronAPI.getWordByName(wordName);
    } catch (error) {
      console.error('Error fetching word by name:', error);
      return null;
    }
  }

  async copyWordToClipboard(word: WordDocument): Promise<void> {
    try {
      const wordText = `${word.word}\n\n${word.one_line_desc}\n\n${word.details}`;
      await navigator.clipboard.writeText(wordText);
    } catch (error) {
      console.error('Error copying word to clipboard:', error);
      throw error;
    }
  }
}
