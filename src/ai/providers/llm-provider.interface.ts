/**
 * Provider-agnostic chat contract. Each concrete LLM provider (Anthropic, Hermes, ...)
 * translates these normalized shapes into its own API format and back.
 */

export type NormalizedContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; base64: string };

export interface NormalizedMessage {
  role: 'user' | 'assistant';
  content: string | NormalizedContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LlmChatParams {
  systemPrompt: string;
  messages: NormalizedMessage[];
  tools: ToolDefinition[];
  executeTool: (name: string, input: unknown) => Promise<string>;
}

export interface LlmProvider {
  /** Runs a full chat turn, including any tool-use loop, and returns the final assistant text. */
  chat(params: LlmChatParams): Promise<string>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
