import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
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
      console.log('🚀 Starting parallel generation of summary and tags...');

      // Run both API calls in parallel and wait for both to complete
      const [summaryResult, tagsResult] = await Promise.all([
        this.generateSummaryOnly(word, meaning, profile),
        this.generateTagsOnly(word, meaning, profile)
      ]);

      console.log('✅ Both API calls completed successfully');
      console.log('📝 Summary result:', summaryResult);
      console.log('🏷️ Tags result:', tagsResult);

      const finalResult = {
        summary: summaryResult.summary,
        tags: tagsResult.tags,
        tag_colors: tagsResult.tag_colors
      };

      console.log('🎯 Final result:', finalResult);
      return finalResult;

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

  private async generateTagsOnly(word: string, meaning: string, profile: ProfileConfig): Promise<{ tags: string[], tag_colors: Record<string, string> }> {
    console.log('🏷️ generateTagsOnly called for word:', word);

    // Create a separate OpenAI instance for this call
    const openai = new OpenAI({
      apiKey: profile.model_config.api_key,
      baseURL: profile.model_config.endpoint || undefined,
    });

    console.log('✅ Tags OpenAI client created');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a language assistant. Your task is to provide relevant tags and colors for categorizing words.`
      },
      {
        role: 'user',
        content: `Provide 5-10 relevant tags for the word "${word}" based on this meaning: ${meaning}. Include appropriate colors for each tag.`
      }
    ];

    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'add_tags',
          description: 'Add relevant tags to categorize the word',
          parameters: {
            type: 'object',
            properties: {
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
            required: ['tags']
          }
        }
      }
    ];

    console.log('🚀 Making tags API call with model:', profile.model_config.model);

    try {
      const completion = await openai.chat.completions.create({
        model: profile.model_config.model,
        messages,
        tools,
        tool_choice: { type: 'function', function: { name: 'add_tags' } } // Force specific tool
      });

      console.log('✅ Tags API call completed');
      console.log('📋 Completion response:', JSON.stringify(completion, null, 2));

      if (completion.choices[0]?.message?.tool_calls?.[0]) {
        const toolCall = completion.choices[0].message.tool_calls[0];
        console.log('🔧 Tags tool call found:', toolCall);

        const args = JSON.parse((toolCall as any).function.arguments);
        console.log('🏷️ Parsed tags args:', args);

        const result = {
          tags: args.tags,
          tag_colors: args.tag_colors || {}
        };
        console.log('🎯 Tags result:', result);
        return result;
      } else {
        console.warn('⚠️ No tool calls found in tags completion');
        console.log('📋 Full completion:', completion);
      }
    } catch (error) {
      console.error('❌ Error in generateTagsOnly API call:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Fallback if tool call fails
    console.log('🔄 Using fallback for tags');
    const fallback = {
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
          contents: `Please provide a detailed meaning and explanation for the word "${word}".`,
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
      console.log('🚀 Starting Gemini generation of summary and tags...');

      const model = profile.model_config.model || 'gemini-2.5-flash';

      // Generate summary
      const summaryPrompt = `Provide a brief one-line summary for the word "${word}" based on this meaning: ${meaning}`;

      const summaryResponse = await this.genAI.models.generateContent({
        model: model,
        contents: summaryPrompt,
        config: {
          systemInstruction: 'You are a language assistant. Provide a concise one-line summary of a word\'s meaning.',
        }
      });

      const summary = summaryResponse.text?.trim() || `A word: ${word}`;

      // Generate tags
      const tagsPrompt = `Provide 5-10 relevant tags for the word "${word}" based on this meaning: ${meaning}.

Respond with a JSON object in this exact format:
{
  "tags": ["tag1", "tag2", "tag3"],
  "tag_colors": {"tag1": "#hexcolor1", "tag2": "#hexcolor2"}
}

Include appropriate hex colors for each tag. Respond with only the JSON, no additional text.`;

      const tagsResponse = await this.genAI.models.generateContent({
        model: model,
        contents: tagsPrompt,
        config: {
          systemInstruction: 'You are a language assistant. Provide relevant tags and colors for categorizing words.',
        }
      });

      const tagsText = tagsResponse.text?.trim() || '';

      console.log('📋 Gemini Tags raw response:', tagsText);

      // Parse the JSON response
      let tags: string[] = ['general'];
      let tag_colors: Record<string, string> = { 'general': '#6b7280' };

      try {
        const parsed = JSON.parse(tagsText);
        tags = parsed.tags || tags;
        tag_colors = parsed.tag_colors || tag_colors;
      } catch (parseError) {
        console.warn('⚠️ Failed to parse Gemini tags JSON, using defaults');
      }

      const finalResult = {
        summary: summary,
        tags: tags,
        tag_colors: tag_colors
      };

      console.log('🎯 Final result:', finalResult);
      return finalResult;

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
