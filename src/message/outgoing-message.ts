export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  prompt: string;
}

export interface BotResponse {
  bubbles: string[];
  images: GeneratedImage[];
}

export function textResponse(bubbles: string[]): BotResponse {
  return { bubbles, images: [] };
}
