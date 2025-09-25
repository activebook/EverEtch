import * as fs from 'fs';
import * as path from 'path';
import { Utils } from './Utils.js';

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

export class ModelManager {
  private static getModelsPath(): string {
    return path.join(Utils.getDataPath(), 'models.json');
  }

  /**
   * Load all model memos from the models.json file
   */
  static loadModels(type?: 'chat' | 'embedding'): ModelMemo[] {
    try {
      Utils.ensureDataDirectory();

      const modelsFile = this.getModelsPath();
      if (!fs.existsSync(modelsFile)) {
        // Create empty models file if it doesn't exist
        this.saveModels([]);
        return [];
      }

      const data = fs.readFileSync(modelsFile, 'utf-8');
      const modelsData = JSON.parse(data);
      const allModels = modelsData.models || [];

      // Filter by type if specified
      if (type) {
        return allModels.filter((model: ModelMemo) => model.type === type);
      }

      return allModels;
    } catch (error) {
      console.error('Error loading models:', error);
      return [];
    }
  }

  /**
   * Save all model memos to the models.json file
   */
  private static saveModels(models: ModelMemo[]): void {
    try {
      Utils.ensureDataDirectory();

      const data = {
        models: models
      };

      fs.writeFileSync(this.getModelsPath(), JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving models:', error);
      throw error;
    }
  }

  /**
   * Add a new model memo or update existing one
   */
  static addModel(model: Omit<ModelMemo, 'createdAt'>): ModelMemo {
    const models = this.loadModels();

    // Check if model with same name already exists
    const existingIndex = models.findIndex(m => m.name === model.name);

    if (existingIndex !== -1) {
      // Update existing model (preserve createdAt, update other fields)
      const existingModel = models[existingIndex];
      const updatedModel: ModelMemo = {
        ...existingModel,
        ...model,
        createdAt: existingModel.createdAt, // Preserve original creation date
        lastUsed: existingModel.lastUsed // Preserve last used timestamp
      };

      models[existingIndex] = updatedModel;
      this.saveModels(models);

      return updatedModel;
    } else {
      // Create new model
      const newModel: ModelMemo = {
        ...model,
        createdAt: Utils.formatDate()
      };

      models.push(newModel);
      this.saveModels(models);

      return newModel;
    }
  }

  /**
   * Update an existing model memo
   */
  static updateModel(modelName: string, updates: Partial<ModelMemo>): ModelMemo | null {
    const models = this.loadModels();
    const index = models.findIndex(m => m.name === modelName);

    if (index === -1) {
      return null;
    }

    models[index] = { ...models[index], ...updates };
    this.saveModels(models);

    return models[index];
  }

  /**
   * Delete a model memo
   */
  static deleteModel(modelName: string): boolean {
    const models = this.loadModels();
    const filteredModels = models.filter(m => m.name !== modelName);

    if (filteredModels.length === models.length) {
      return false; // Model not found
    }

    this.saveModels(filteredModels);
    return true;
  }

  /**
   * Get a specific model memo by name
   */
  static getModel(modelName: string): ModelMemo | null {
    const models = this.loadModels();
    return models.find(m => m.name === modelName) || null;
  }

  /**
   * Update the lastUsed timestamp for a model
   */
  static markModelUsed(modelName: string): boolean {
    return this.updateModel(modelName, { lastUsed: Utils.formatDate() }) !== null;
  }

  /**
   * Get all model memos sorted by last used (most recent first)
   */
  static getModelsSorted(type?: 'chat' | 'embedding'): ModelMemo[] {
    const models = this.loadModels(type);
    return models.sort((a, b) => {
      const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
      const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
      return bTime - aTime; // Most recent first
    });
  }

  /**
   * Load only chat models
   */
  static loadChatModels(): ModelMemo[] {
    return this.loadModels('chat');
  }

  /**
   * Load only embedding models
   */
  static loadEmbeddingModels(): ModelMemo[] {
    return this.loadModels('embedding');
  }

  /**
   * Get chat models sorted by last used
   */
  static getChatModelsSorted(): ModelMemo[] {
    return this.getModelsSorted('chat');
  }

  /**
   * Get embedding models sorted by last used
   */
  static getEmbeddingModelsSorted(): ModelMemo[] {
    return this.getModelsSorted('embedding');
  }
}
