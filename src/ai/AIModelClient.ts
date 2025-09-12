import OpenAI from 'openai';
import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai';
import { ProfileConfig } from '../database/DatabaseManager.js';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
}

export interface ProcessedToolData {
  summary?: string;
  tags?: string[];
  tag_colors?: Record<string, string>;
  synonyms?: string[];
  antonyms?: string[];
}

// Provide dummy metas if any call fails
export const WORD_DUMMY_METAS = {
  summary: '---',
  tags: ['---'],
  tag_colors: { '---': '#6b7280' },
  synonyms: [],
  antonyms: []
};

// Shared prompts for word metadata generation
const WORD_METAS_SYSTEM_PROMPT = `You are an expert language assistant specializing in comprehensive word analysis and categorization. Your task is to provide structured, consistent word metadata including summaries, relevant tags with colors, synonyms, and antonyms to support language learning applications. Always use the generate_word_metas tool when asked to analyze or categorize words.`;

const WORD_METAS_USER_PROMPT = (word: string, meaning: string) =>
  `Analyze the word "${word}" based on this meaning: "${meaning}".

  IMPORTANT: The meaning above is in a specific language. You MUST provide ALL your responses (summary, tags, synonyms, antonyms) in the SAME language as this meaning.

  Provide comprehensive metadata for the word. Follow these specific instructions for each field:

  - summary: A brief one-line summary in the same language.

  - tags: 5-10 tags for classification.
    - **CRITICAL: Tags must NOT be synonyms or antonyms.**
    - Tags should categorize the word by its grammatical and contextual properties.
    - Include categories like:
      - Part of Speech (e.g., noun, verb, adjective)
      - Domain (e.g., science, emotion, technology)
      - Connotation (e.g., positive, negative, neutral)
      - Tone/Register (e.g., formal, informal, slang, technical)
      - Concept Type (e.g., action, object, abstract idea, feeling)

  - synonyms: 3-6 words with a similar meaning.

  - antonyms: 3-6 words with an opposite meaning.`;

// Shared tool definitions for word metadata generation
const WORD_METAS_TOOL_NAME = 'generate_word_metas';
const WORD_METAS_TOOL_DESCRIPTION = 'Generate comprehensive word metadata including summary, categorization tags with colors, synonyms, and antonyms for language learning applications.';

const WORD_METAS_TOOL_PARAMETERS = {
  type: 'object' as const,
  properties: {
    summary: {
      type: 'string' as const,
      description: 'A single, concise sentence that captures the word\'s primary meaning or definition.'
    },
    tags: {
      type: 'array' as const,
      items: { type: 'string' as const },
      minItems: 5,
      maxItems: 10,
      description: '5-10 classification tags. IMPORTANT: These should NOT be synonyms. They should categorize the word by part of speech (noun, verb), domain (science, emotion), connotation (positive, negative), and tone (formal, slang). Use the same language as the word meaning.'
    },
    tag_colors: {
      type: 'object' as const,
      description: 'Hex color codes for each tag in the tags array. Each tag must have a corresponding color. Use visually distinct colors that represent the tag\'s meaning. Examples: {"noun": "#3B82F6", "animal": "#10B981", "marine": "#06B6D4", "mammal": "#8B5CF6"}',
      additionalProperties: { type: 'string' as const },
      patternProperties: {
        ".*": {
          type: 'string' as const,
          pattern: '^#[0-9A-Fa-f]{6}$',
          description: 'Valid hex color code (e.g., #FF5733)'
        }
      }
    },
    synonyms: {
      type: 'array' as const,
      items: { type: 'string' as const },
      minItems: 3,
      maxItems: 6,
      description: '3-6 relevant synonyms that have similar meanings to the word. Use the same language as the word meaning.'
    },
    antonyms: {
      type: 'array' as const,
      items: { type: 'string' as const },
      minItems: 3,
      maxItems: 6,
      description: '3-6 relevant antonyms that have opposite meanings to the word. Use the same language as the word meaning.'
    }
  },
  required: ['summary', 'tags', 'tag_colors', 'synonyms', 'antonyms']
};

// Provider interface for different AI services
export interface AIProvider {
  generateWordMeaning(word: string, profile: ProfileConfig, onWordMeaningStreaming?: (content: string) => void): Promise<string>;
  generateWordMetas(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData>;
  getAvailableModels?(profile: ProfileConfig): Promise<string[]>;
}

// OpenAI provider implementation
export class OpenAIProvider implements AIProvider {
  private openai: OpenAI | null = null;

  async generateWordMeaning(word: string, profile: ProfileConfig, onWordMeaningStreaming?: (content: string) => void): Promise<string> {
    if (!profile.model_config.api_key) {
      throw new Error('API key not configured for this profile');
    }

    this.openai = new OpenAI({
      apiKey: profile.model_config.api_key,
      baseURL: profile.model_config.endpoint || undefined,
    });

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: profile.system_prompt
      },
      {
        role: 'user',
        content: `${word}`
      }
    ];

    try {
      const completion = await this.openai.chat.completions.create({
        model: profile.model_config.model,
        messages,
        stream: true
      });

      let fullContent = '';

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          fullContent += delta.content;
          // Emit streaming content to renderer
          if (onWordMeaningStreaming) {
            onWordMeaningStreaming(delta.content);
          }
        }
      }

      return fullContent;

    } catch (error) {
      console.error('Error generating meaning:', error);
      throw new Error('Failed to generate meaning. Please check your API configuration.');
    }
  }

  async generateWordMetas(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData> {
    if (!profile.model_config.api_key) {
      throw new Error('API key not configured for this profile');
    }

    this.openai = new OpenAI({
      apiKey: profile.model_config.api_key,
      baseURL: profile.model_config.endpoint || undefined,
    });

    // Generate comprehensive word metadata including summary, tags, colors, synonyms, and antonyms
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: WORD_METAS_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: WORD_METAS_USER_PROMPT(word, meaning)
      }
    ];

    // Define tools (Use tool to get comprehensive word metadata from llm)
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: WORD_METAS_TOOL_NAME,
          description: WORD_METAS_TOOL_DESCRIPTION,
          parameters: WORD_METAS_TOOL_PARAMETERS
        }
      }
    ];


    try {
      const completion = await this.openai.chat.completions.create({
        model: profile.model_config.model,
        messages,
        tools,
        tool_choice: { type: 'function', function: { name: 'generate_word_metas' } } // Force specific tool
      });

      if (completion.choices[0]?.message?.tool_calls?.[0]) {
        const toolCall = completion.choices[0].message.tool_calls[0];

        const args = JSON.parse((toolCall as any).function.arguments);

        const result: ProcessedToolData = {
          summary: (typeof args.summary === 'string' && args.summary.trim()) ? args.summary : WORD_DUMMY_METAS.summary,
          tags: Array.isArray(args.tags) ? args.tags : WORD_DUMMY_METAS.tags,
          tag_colors: (typeof args.tag_colors === 'object' && args.tag_colors !== null && Object.keys(args.tag_colors).length > 0) ? args.tag_colors as Record<string, string> : WORD_DUMMY_METAS.tag_colors as Record<string, string>,
          synonyms: Array.isArray(args.synonyms) ? args.synonyms : WORD_DUMMY_METAS.synonyms,
          antonyms: Array.isArray(args.antonyms) ? args.antonyms : WORD_DUMMY_METAS.antonyms
        };
        return result;
      } else {
        console.warn('⚠️ No function calls found in OpenAI completion');
        return WORD_DUMMY_METAS;
      }
    } catch (error) {
      const err = 'Failed to generate word metadata. ' + ((error as any) instanceof Error ? (error as Error).message : 'Unknown error');
      throw new Error(err);
    }    
  }

  async getAvailableModels(profile: ProfileConfig): Promise<string[]> {
    if (!this.openai || !profile.model_config.api_key) {
      return [];
    }

    try {
      const models = await this.openai.models.list();
      return models.data.map(model => model.id);
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  }
}

// Google Gemini provider implementation
export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenAI | null = null;

  async generateWordMeaning(word: string, profile: ProfileConfig, onWordMeaningStreaming?: (content: string) => void): Promise<string> {
    if (!profile.model_config.api_key) {
      throw new Error('API key not configured for this profile');
    }

    // Initialize Google AI client
    this.genAI = new GoogleGenAI({
      apiKey: profile.model_config.api_key,
    });

    try {
      const model = profile.model_config.model;

      // Use streaming for real-time updates
      const responseStream = await this.genAI.models.generateContentStream({
        model: model,
        contents: `${word}`,
        config: {
          systemInstruction: profile.system_prompt,
        }
      });

      let fullContent = '';
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullContent += chunk.text;
          if (onWordMeaningStreaming) {
            // Emit streaming content to renderer
            onWordMeaningStreaming(chunk.text);
          }
        }
      }
      return fullContent;

    } catch (error) {
      console.error('Error generating meaning with Gemini:', error);
      throw new Error('Failed to generate meaning. Please check your API configuration.');
    }
  }

  async generateWordMetas(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData> {
    if (!profile.model_config.api_key) {
      throw new Error('API key not configured for this profile');
    }

    // Initialize Google AI client
    this.genAI = new GoogleGenAI({
      apiKey: profile.model_config.api_key,
    });

    const model = profile.model_config.model;

    const messages = [
      {
        role: 'user',
        parts: [{
          text: WORD_METAS_USER_PROMPT(word, meaning)
        }]
      }
    ];

    const tools = [
      {
        functionDeclarations: [
          {
            name: WORD_METAS_TOOL_NAME,
            description: WORD_METAS_TOOL_DESCRIPTION,
            parametersJsonSchema: {
              type: Type.OBJECT,
              properties: {
                summary: {
                  type: Type.STRING,
                  description: WORD_METAS_TOOL_PARAMETERS.properties.summary.description
                },
                tags: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING
                  },
                  minItems: WORD_METAS_TOOL_PARAMETERS.properties.tags.minItems,
                  maxItems: WORD_METAS_TOOL_PARAMETERS.properties.tags.maxItems,
                  description: WORD_METAS_TOOL_PARAMETERS.properties.tags.description,
                  uniqueItems: true
                },
                tag_colors: {
                  type: Type.OBJECT,
                  description: WORD_METAS_TOOL_PARAMETERS.properties.tag_colors.description,
                  additionalProperties: {
                    type: Type.STRING,
                    pattern: '^#[0-9A-Fa-f]{6}$',
                    description: 'Valid hex color code (e.g., #FF5733)'
                  },
                  propertyNames: {
                    type: Type.STRING
                  }
                },
                synonyms: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING
                  },
                  minItems: WORD_METAS_TOOL_PARAMETERS.properties.synonyms.minItems,
                  maxItems: WORD_METAS_TOOL_PARAMETERS.properties.synonyms.maxItems,
                  description: WORD_METAS_TOOL_PARAMETERS.properties.synonyms.description
                },
                antonyms: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING
                  },
                  minItems: WORD_METAS_TOOL_PARAMETERS.properties.antonyms.minItems,
                  maxItems: WORD_METAS_TOOL_PARAMETERS.properties.antonyms.maxItems,
                  description: WORD_METAS_TOOL_PARAMETERS.properties.antonyms.description
                }
              },
              required: WORD_METAS_TOOL_PARAMETERS.required
            }
          }
        ]
      }
    ];


    try {
      const response = await this.genAI.models.generateContent({
        model: model,
        contents: messages,
        config: {
          systemInstruction: WORD_METAS_SYSTEM_PROMPT,
          tools: tools,
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ['generate_word_metas']
            }
          }
        }
      });

      // Check for function calls in the response
      const functionCall = response.functionCalls?.[0];
      if (functionCall && functionCall.name === 'generate_word_metas') {
        const args = functionCall.args;
        if (args) {
          const result: ProcessedToolData = {
            summary: (typeof args.summary === 'string' && args.summary.trim()) ? args.summary : WORD_DUMMY_METAS.summary,
            tags: Array.isArray(args.tags) ? args.tags : WORD_DUMMY_METAS.tags,
            tag_colors: (typeof args.tag_colors === 'object' && args.tag_colors !== null && Object.keys(args.tag_colors).length > 0) ? args.tag_colors as Record<string, string> : WORD_DUMMY_METAS.tag_colors as Record<string, string>,
            synonyms: Array.isArray(args.synonyms) ? args.synonyms : WORD_DUMMY_METAS.synonyms,
            antonyms: Array.isArray(args.antonyms) ? args.antonyms : WORD_DUMMY_METAS.antonyms
          };
          return result;
        } else {
          console.warn('⚠️ Invalid function call arguments in Gemini completion');
          return WORD_DUMMY_METAS;
        }
      } else {
        console.warn('⚠️ No function calls found in Gemini completion');
        return WORD_DUMMY_METAS;
      }
    } catch (error) {
      const err = 'Failed to generate word metadata. ' + ((error as any) instanceof Error ? (error as Error).message : 'Unknown error');
      throw new Error(err);
    }    
  }

  async getAvailableModels(profile: ProfileConfig): Promise<string[]> {
    // Google AI doesn't provide a models list API like OpenAI
    // Return commonly available Gemini models
    return [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro',
      'gemini-pro-vision'
    ];
  }
}

// Provider factory function
function createProvider(profile: ProfileConfig): AIProvider {
  switch (profile.model_config.provider) {
    case 'openai':
      return new OpenAIProvider();
    case 'google':
      return new GeminiProvider();
    default:
      // Default to OpenAI for backward compatibility
      return new OpenAIProvider();
  }
}

// Main AIModelClient that delegates to appropriate provider
export class AIModelClient {
  async generateWordMeaning(word: string, profile: ProfileConfig, onWordMeaningStreaming?: (content: string) => void): Promise<string> {
    const provider = createProvider(profile);
    return provider.generateWordMeaning(word, profile, onWordMeaningStreaming);
  }

  async generateWordMetas(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData> {
    const provider = createProvider(profile);
    return provider.generateWordMetas(word, meaning, profile);
  }

  // Method to get available models (for future use)
  async getAvailableModels(profile: ProfileConfig): Promise<string[]> {
    const provider = createProvider(profile);
    return provider.getAvailableModels ? provider.getAvailableModels(profile) : [];
  }
}
