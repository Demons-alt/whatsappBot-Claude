import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  LlmChatParams,
  LlmProvider,
  NormalizedMessage,
} from './llm-provider.interface';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('anthropic.apiKey'),
    });
    this.model =
      this.config.get<string>('anthropic.model') ?? 'claude-haiku-4-5-20251001';
  }

  async chat({
    systemPrompt,
    messages,
    tools,
    executeTool,
  }: LlmChatParams): Promise<string> {
    const anthropicMessages = messages.map((m) => this.toAnthropicMessage(m));
    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      tools: anthropicTools,
      messages: anthropicMessages,
    });

    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: await executeTool(block.name, block.input),
        })),
      );

      anthropicMessages.push({ role: 'assistant', content: response.content });
      anthropicMessages.push({ role: 'user', content: toolResults });

      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        tools: anthropicTools,
        messages: anthropicMessages,
      });
    }

    return response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  private toAnthropicMessage(msg: NormalizedMessage): Anthropic.MessageParam {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }

    const blocks: Anthropic.ContentBlockParam[] = msg.content.map((block) =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type:
                block.mimeType as Anthropic.Base64ImageSource['media_type'],
              data: block.base64,
            },
          },
    );

    return { role: msg.role, content: blocks };
  }
}
