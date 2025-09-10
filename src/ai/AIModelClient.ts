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
}

// Provider interface for different AI services
export interface AIProvider {
  generateMeaningOnly(word: string, profile: ProfileConfig, onStreamingContent?: (content: string) => void): Promise<string>;
  generateTagsAndSummary(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData>;
  getAvailableModels?(profile: ProfileConfig): Promise<string[]>;
}

// OpenAI provider implementation
export class OpenAIProvider implements AIProvider {
  private openai: OpenAI | null = null;

  async generateMeaningOnly(word: string, profile: ProfileConfig, onStreamingContent?: (content: string) => void): Promise<string> {
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
        content: `Please provide a meaning for the word "${word}".`
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
          if (onStreamingContent) {
            onStreamingContent(delta.content);
          }
        }
      }

      return fullContent;

    } catch (error) {
      console.error('Error generating meaning:', error);
      throw new Error('Failed to generate meaning. Please check your API configuration.');
    }
  }

  async generateTagsAndSummary(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData> {
    console.log('🔄 generateTagsAndSummary called with word:', word, 'meaning length:', meaning.length);

    if (!profile.model_config.api_key) {
      console.error('❌ API key not configured for this profile');
      throw new Error('API key not configured for this profile');
    }

    this.openai = new OpenAI({
      apiKey: profile.model_config.api_key,
      baseURL: profile.model_config.endpoint || undefined,
    });

    console.log('✅ OpenAI client initialized');

    try {
      console.log('🚀 Starting OpenAI combined generation of summary, tags and colors...');

      // Generate summary, tags and colors in a single tool call
      const result = await this.generateSummaryTagsAndColors(word, meaning, profile);

      console.log('✅ OpenAI combined result:', result);
      return result;

    } catch (error) {
      console.error('❌ Error in generateTagsAndSummary:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      // Provide fallbacks if any call fails
      const fallbackResult = {
        summary: `A word: ${word}`,
        tags: ['general'],
        tag_colors: { 'general': '#6b7280' }
      };

      console.log('🔄 Returning fallback result:', fallbackResult);
      return fallbackResult;
    }
  }

  private async generateSummaryOnly(word: string, meaning: string, profile: ProfileConfig): Promise<{ summary: string }> {
    console.log('📝 generateSummaryOnly called for word:', word);

    // Create a separate OpenAI instance for this call
    const openai = new OpenAI({
      apiKey: profile.model_config.api_key,
      baseURL: profile.model_config.endpoint || undefined,
    });

    console.log('✅ Summary OpenAI client created');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a language assistant. Your task is to provide a concise one-line summary of a word's meaning.`
      },
      {
        role: 'user',
        content: `Provide a brief one-line summary for the word "${word}" based on this meaning: ${meaning}`
      }
    ];

    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'add_summary',
          description: 'Add a concise one-line summary of the word\'s meaning',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'A brief one-line summary of the word\'s primary meaning'
              }
            },
            required: ['summary']
          }
        }
      }
    ];

    console.log('🚀 Making summary API call with model:', profile.model_config.model);

    try {
      const completion = await openai.chat.completions.create({
        model: profile.model_config.model,
        messages,
        tools,
        tool_choice: { type: 'function', function: { name: 'add_summary' } } // Force specific tool
      });

      console.log('✅ Summary API call completed');
      console.log('📋 Completion response:', JSON.stringify(completion, null, 2));

      if (completion.choices[0]?.message?.tool_calls?.[0]) {
        const toolCall = completion.choices[0].message.tool_calls[0];
        console.log('🔧 Summary tool call found:', toolCall);

        const args = JSON.parse((toolCall as any).function.arguments);
        console.log('📝 Parsed summary args:', args);

        const result = { summary: args.summary };
        console.log('🎯 Summary result:', result);
        return result;
      } else {
        console.warn('⚠️ No tool calls found in summary completion');
        console.log('📋 Full completion:', completion);
      }
    } catch (error) {
      console.error('❌ Error in generateSummaryOnly API call:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Fallback if tool call fails
    console.log('🔄 Using fallback for summary');
    const fallback = { summary: `A word: ${word}` };
    console.log('🔄 Fallback result:', fallback);
    return fallback;
  }

  // Generate summary, tags and colors in a single tool call
  private async generateSummaryTagsAndColors(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData> {
    console.log('📝🏷️ OpenAI generateSummaryTagsAndColors called for word:', word);

    // Create a separate OpenAI instance for this call
    const openai = new OpenAI({
      apiKey: profile.model_config.api_key,
      baseURL: profile.model_config.endpoint || undefined,
    });

    console.log('✅ Combined OpenAI client created');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a language assistant. Your task is to provide a concise summary, relevant tags, and appropriate colors for categorizing words.`
      },
      {
        role: 'user',
        content: `Provide a brief one-line summary, 5-10 relevant tags, and appropriate colors for each tag for the word "${word}" based on this meaning: ${meaning}.`
      }
    ];

    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'add_summary_tags_colors',
          description: 'Add a summary, relevant tags, and colors to categorize the word',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'A brief one-line summary of the word\'s primary meaning'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of 5-10 relevant tags for the word'
              },
              tag_colors: {
                type: 'object',
                description: 'Hex color codes for each tag (e.g., {"noun": "#3B82F6", "animal": "#10B981"})',
                additionalProperties: { type: 'string' }
              }
            },
            required: ['summary', 'tags', 'tag_colors']
          }
        }
      }
    ];

    console.log('🚀 Making OpenAI combined API call with model:', profile.model_config.model);

    try {
      const completion = await openai.chat.completions.create({
        model: profile.model_config.model,
        messages,
        tools,
        tool_choice: { type: 'function', function: { name: 'add_summary_tags_colors' } } // Force specific tool
      });

      console.log('✅ OpenAI Combined API call completed');
      console.log('📋 Completion response:', JSON.stringify(completion, null, 2));

      if (completion.choices[0]?.message?.tool_calls?.[0]) {
        const toolCall = completion.choices[0].message.tool_calls[0];
        console.log('🔧 OpenAI function call found:', toolCall);

        const args = JSON.parse((toolCall as any).function.arguments);
        console.log('📝🏷️ Parsed combined function args:', args);

        const result: ProcessedToolData = {
          summary: (typeof args.summary === 'string' && args.summary.trim()) ? args.summary : `A word: ${word}`,
          tags: Array.isArray(args.tags) ? args.tags : ['general'],
          tag_colors: (typeof args.tag_colors === 'object' && args.tag_colors !== null && Object.keys(args.tag_colors).length > 0) ? args.tag_colors : { 'general': '#6b7280' }
        };
        console.log('🎯 OpenAI combined result:', result);
        return result;
      } else {
        console.warn('⚠️ No function calls found in OpenAI completion');
        console.log('📋 Full completion:', completion);
      }
    } catch (error) {
      console.error('❌ Error in OpenAI generateSummaryTagsAndColors API call:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Fallback if function call fails
    console.log('🔄 Using fallback for OpenAI combined generation');
    const fallback: ProcessedToolData = {
      summary: `A word: ${word}`,
      tags: ['general'],
      tag_colors: { 'general': '#6b7280' }
    };
    console.log('🔄 Fallback result:', fallback);
    return fallback;
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

  async generateMeaningOnly(word: string, profile: ProfileConfig, onStreamingContent?: (content: string) => void): Promise<string> {
    if (!profile.model_config.api_key) {
      throw new Error('API key not configured for this profile');
    }

    // Initialize Google AI client
    this.genAI = new GoogleGenAI({
      apiKey: profile.model_config.api_key,
    });

    try {
      const model = profile.model_config.model || 'gemini-2.5-flash';

      if (onStreamingContent) {
        // Use streaming for real-time updates
        const responseStream = await this.genAI.models.generateContentStream({
          model: model,
          contents: `Please provide a slim meaning and explanation for the word "${word}".`,
          config: {
            systemInstruction: profile.system_prompt,
          }
        });

        let fullContent = '';
        for await (const chunk of responseStream) {
          if (chunk.text) {
            fullContent += chunk.text;
            onStreamingContent(chunk.text);
          }
        }
        return fullContent;
      } else {
        // Non-streaming response
        const response = await this.genAI.models.generateContent({
          model: model,
          contents: `Please provide a detailed meaning and explanation for the word "${word}".`,
          config: {
            systemInstruction: profile.system_prompt,
          }
        });

        return response.text || '';
      }

    } catch (error) {
      console.error('Error generating meaning with Gemini:', error);
      throw new Error('Failed to generate meaning. Please check your API configuration.');
    }
  }

  async generateTagsAndSummary(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData> {
    console.log('🔄 Gemini generateTagsAndSummary called with word:', word, 'meaning length:', meaning.length);

    if (!profile.model_config.api_key) {
      console.error('❌ API key not configured for this profile');
      throw new Error('API key not configured for this profile');
    }

    // Initialize Google AI client
    this.genAI = new GoogleGenAI({
      apiKey: profile.model_config.api_key,
    });

    try {
      console.log('🚀 Starting Gemini combined generation of summary, tags and colors...');

      const model = profile.model_config.model || 'gemini-2.5-flash';

      // Generate summary, tags and colors in a single tool call
      const result = await this.generateSummaryTagsAndColors(word, meaning, profile);

      console.log('✅ Gemini combined result:', result);
      return result;

    } catch (error) {
      console.error('❌ Error in Gemini generateTagsAndSummary:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      // Provide fallbacks if any call fails
      const fallbackResult = {
        summary: `A word: ${word}`,
        tags: ['general'],
        tag_colors: { 'general': '#6b7280' }
      };

      console.log('🔄 Returning fallback result:', fallbackResult);
      return fallbackResult;
    }
  }

  // Generate summary, tags and colors in a single tool call
  private async generateSummaryTagsAndColors(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData> {
    console.log('📝🏷️ Gemini generateSummaryTagsAndColors called for word:', word);

    if (!this.genAI) {
      throw new Error('Gemini client not initialized');
    }

    const model = profile.model_config.model || 'gemini-2.5-flash';

    const messages = [
      {
        role: 'user',
        parts: [{
          text: `Provide a brief one-line summary, 5-10 relevant tags, and appropriate colors for each tag for the word "${word}" based on this meaning: ${meaning}.`
        }]
      }
    ];

    const tools = [
      {
        functionDeclarations: [
          {
            name: 'add_summary_tags_colors',
            description: 'Add a summary, relevant tags, and colors to categorize the word',
            // Here must use : Parameters JSON schema
            parametersJsonSchema: {
              type: Type.OBJECT,
              properties: {
                summary: {
                  type: Type.STRING,
                  description: 'A brief one-line summary of the word\'s primary meaning'
                },
                tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Array of 5-10 relevant tags for the word'
                },
                tag_colors: {
                  type: Type.OBJECT,
                  description: 'Hex color codes for each tag (e.g., {"noun": "#3B82F6", "animal": "#10B981"})',
                  additionalProperties: { type: Type.STRING }
                }
              },
              required: ['summary', 'tags', 'tag_colors']
            }
          }
        ]
      }
    ];

    console.log('🚀 Making Gemini combined API call with model:', model);

    try {
      const response = await this.genAI.models.generateContent({
        model: model,
        contents: messages,
        config: {
          systemInstruction: 'You are a language assistant. Your task is to provide a concise summary, relevant tags, and appropriate colors for categorizing words.',
          tools: tools,
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ['add_summary_tags_colors']
            }
          }
        }
      });

      console.log('✅ Gemini Combined API call completed');

      // Check for function calls in the response
      const functionCall = response.functionCalls?.[0];
      if (functionCall && functionCall.name === 'add_summary_tags_colors') {
        console.log('🔧 Gemini function call found:', functionCall);

        const args = functionCall.args;
        if (args) {
          console.log('📝🏷️ Parsed combined function args:', args);

          const result: ProcessedToolData = {
            summary: (typeof args.summary === 'string' && args.summary.trim()) ? args.summary : `A word: ${word}`,
            tags: Array.isArray(args.tags) ? args.tags : ['general'],
            tag_colors: (typeof args.tag_colors === 'object' && args.tag_colors !== null && Object.keys(args.tag_colors).length > 0) ? args.tag_colors as Record<string, string> : { 'general': '#6b7280' }
          };
          console.log('🎯 Gemini combined result:', result);
          return result;
        }
      } else {
        console.warn('⚠️ No function calls found in Gemini response');
        console.log('📋 Full response:', response);
      }
    } catch (error) {
      console.error('❌ Error in Gemini generateSummaryTagsAndColors API call:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Fallback if function call fails
    console.log('🔄 Using fallback for Gemini combined generation');
    const fallback: ProcessedToolData = {
      summary: `A word: ${word}`,
      tags: ['general'],
      tag_colors: { 'general': '#6b7280' }
    };
    console.log('🔄 Fallback result:', fallback);
    return fallback;
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
  async generateMeaningOnly(word: string, profile: ProfileConfig, onStreamingContent?: (content: string) => void): Promise<string> {
    const provider = createProvider(profile);
    return provider.generateMeaningOnly(word, profile, onStreamingContent);
  }

  async generateTagsAndSummary(word: string, meaning: string, profile: ProfileConfig): Promise<ProcessedToolData> {
    const provider = createProvider(profile);
    return provider.generateTagsAndSummary(word, meaning, profile);
  }

  // Method to get available models (for future use)
  async getAvailableModels(profile: ProfileConfig): Promise<string[]> {
    const provider = createProvider(profile);
    return provider.getAvailableModels ? provider.getAvailableModels(profile) : [];
  }
}
