import OpenAI from 'openai';
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

export class AIModelClient {
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

        const args = JSON.parse(toolCall.function.arguments);
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

        const args = JSON.parse(toolCall.function.arguments);
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

  private async processToolCalls(toolCalls: ToolCall[], word: string): Promise<ProcessedToolData> {
    const toolData: ProcessedToolData = {};

    console.log('Processing tool calls:', toolCalls.length);

    for (const toolCall of toolCalls) {
      try {
        console.log('Processing tool call:', toolCall.function.name);
        switch (toolCall.function.name) {
          case 'add_summary':
            const summaryArgs = JSON.parse(toolCall.function.arguments);
            toolData.summary = summaryArgs.summary;
            console.log('Summary extracted:', toolData.summary);
            break;

          case 'add_tags':
            const tagsArgs = JSON.parse(toolCall.function.arguments);
            toolData.tags = tagsArgs.tags;
            toolData.tag_colors = tagsArgs.tag_colors || {};
            console.log('Tags extracted:', toolData.tags);
            break;

          default:
            console.log('Unknown tool called:', toolCall.function.name);
        }
      } catch (error) {
        console.error('Error processing tool call:', error, 'Arguments:', toolCall.function.arguments);
      }
    }

    // Ensure we have fallback data if tools failed
    if (!toolData.summary) {
      toolData.summary = `A word related to: ${word}`;
    }
    if (!toolData.tags || toolData.tags.length === 0) {
      toolData.tags = ['general'];
      toolData.tag_colors = { 'general': '#6b7280' };
    }

    console.log('Final processed tool data:', toolData);
    return toolData;
  }

  // Method to get available models (for future use)
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
