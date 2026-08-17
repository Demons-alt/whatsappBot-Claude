import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmChatParams,
  LlmProvider,
  NormalizedMessage,
  ToolDefinition,
} from './llm-provider.interface';

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface OpenAiTool {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

/**
 * Talks to the internal Hermes gateway through an OpenAI-compatible chat
 * completions endpoint (same request/response shape as OpenAI/OpenRouter,
 * so no extra SDK is needed) — except auth is the raw key with no "Bearer " prefix.
 */
@Injectable()
export class HermesProvider implements LlmProvider {
  private readonly logger = new Logger(HermesProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('hermes.apiKey') ?? '';
    this.baseUrl =
      this.config.get<string>('hermes.baseUrl') ?? 'http://10.20.30.50:8645/v1';
    this.model =
      this.config.get<string>('hermes.model') ?? 'upstage/solar-pro4:free';
    this.maxTokens = this.config.get<number>('hermes.maxTokens') ?? 2048;
  }

  async chat({
    systemPrompt,
    messages,
    tools,
    executeTool,
  }: LlmChatParams): Promise<string> {
    const openAiMessages: OpenAiMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => this.toOpenAiMessage(m)),
    ];
    const openAiTools = tools.map((t) => this.toOpenAiTool(t));

    let message = await this.createCompletion(openAiMessages, openAiTools);

    while (message.tool_calls?.length) {
      openAiMessages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: message.tool_calls,
      });

      for (const call of message.tool_calls) {
        let input: unknown = {};
        try {
          input = JSON.parse(call.function.arguments || '{}');
        } catch {
          this.logger.warn(
            `Failed to parse tool arguments: ${call.function.arguments}`,
          );
        }
        const result = await executeTool(call.function.name, input);
        openAiMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        });
      }

      message = await this.createCompletion(openAiMessages, openAiTools);
    }

    return message.content ?? '';
  }

  private async createCompletion(
    messages: OpenAiMessage[],
    tools: OpenAiTool[],
  ): Promise<{ content: string | null; tool_calls?: OpenAiToolCall[] }> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The internal Hermes gateway expects the raw key, not a "Bearer " prefix.
        Authorization: this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages,
        tools: tools.length ? tools : undefined,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      this.logger.error(`Hermes API error ${response.status}: ${errText}`);
      throw new Error(`Hermes API error ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
      }>;
    };
    const choice = data.choices?.[0]?.message ?? {};
    return { content: choice.content ?? null, tool_calls: choice.tool_calls };
  }

  private toOpenAiTool(tool: ToolDefinition): OpenAiTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    };
  }

  private toOpenAiMessage(msg: NormalizedMessage): OpenAiMessage {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }

    const content = msg.content.map((block) =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : {
            type: 'image_url',
            image_url: { url: `data:${block.mimeType};base64,${block.base64}` },
          },
    );

    return { role: msg.role, content };
  }
}
