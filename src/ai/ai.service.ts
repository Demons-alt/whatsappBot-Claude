import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ConversationService } from '../conversation/conversation.service';
import { WeatherTool } from './tools/weather.tool';
import { DateTimeTool } from './tools/datetime.tool';
import { CurrencyTool } from './tools/currency.tool';
import { PrayerTool } from './tools/prayer.tool';
import { HolidayTool } from './tools/holiday.tool';

const BUBBLE_DELIMITER = '|||';

const SYSTEM_PROMPT = `Kamu adalah Chloe yang tengil, agak random namun sesuai konteks, pintar, dan membantu.
Kamu berbicara dalam bahasa Indonesia secara natural dan santai, tetapi agak mengacaukan beberapa kata.

Ketika menjawab, kamu bisa membagi jawaban menjadi beberapa pesan terpisah menggunakan delimiter "${BUBBLE_DELIMITER}".
Gunakan pemisahan ini untuk membuat percakapan terasa lebih natural, seperti mengirim beberapa bubble chat.
Contoh: "Halo! ${BUBBLE_DELIMITER}Ada yang bisa aku bantu hari ini?"

Jangan gunakan terlalu banyak pemisahan — maksimal 3-4 bubble per respons.
Jika pertanyaan sederhana, cukup satu bubble saja.`;

@Injectable()
export class AIService {
  private readonly client: Anthropic;
  private readonly logger = new Logger(AIService.name);

  private get tools() {
    return [
      this.weatherTool.definition,
      this.dateTimeTool.definition,
      this.currencyTool.definition,
      this.prayerTool.definition,
      this.holidayTool.definition,
    ];
  }

  constructor(
    private readonly config: ConfigService,
    private readonly convService: ConversationService,
    private readonly weatherTool: WeatherTool,
    private readonly dateTimeTool: DateTimeTool,
    private readonly currencyTool: CurrencyTool,
    private readonly prayerTool: PrayerTool,
    private readonly holidayTool: HolidayTool,
  ) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('anthropic.apiKey'),
    });
  }

  async chat(phoneNumber: string, userMessage: string): Promise<string[]> {
    const conversation = await this.convService.getOrCreate(phoneNumber);
    const history = await this.convService.getMessages(conversation.id, 20);

    const messages: Anthropic.MessageParam[] = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    messages.push({ role: 'user', content: userMessage });
    await this.convService.addMessage(conversation.id, 'user', userMessage);

    const model =
      this.config.get<string>('anthropic.model') ?? 'claude-haiku-4-5-20251001';

    const response = await this.runModel(messages, model);

    const textContent = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    await this.convService.addMessage(conversation.id, 'assistant', textContent);

    return textContent
      .split(BUBBLE_DELIMITER)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async chatWithImage(
    phoneNumber: string,
    imageBuffer: Buffer,
    mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
    caption?: string,
  ): Promise<string[]> {
    const conversation = await this.convService.getOrCreate(phoneNumber);
    const history = await this.convService.getMessages(conversation.id, 20);

    const messages: Anthropic.MessageParam[] = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    const userContent: Anthropic.ContentBlockParam[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: imageBuffer.toString('base64'),
        },
      },
    ];
    if (caption) userContent.push({ type: 'text', text: caption });

    messages.push({ role: 'user', content: userContent });

    const storedContent = caption ? `[Foto: ${caption}]` : '[Foto]';
    await this.convService.addMessage(conversation.id, 'user', storedContent);

    const model =
      this.config.get<string>('anthropic.model') ?? 'claude-haiku-4-5-20251001';

    const response = await this.runModel(messages, model);

    const textContent = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    await this.convService.addMessage(conversation.id, 'assistant', textContent);

    return textContent
      .split(BUBBLE_DELIMITER)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private async runModel(
    messages: Anthropic.MessageParam[],
    model: string,
  ): Promise<Anthropic.Message> {
    let response = await this.client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: this.tools,
      messages,
    });

    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: await this.executeTool(block),
        })),
      );

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await this.client.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: this.tools,
        messages,
      });
    }

    return response;
  }

  private async executeTool(block: Anthropic.ToolUseBlock): Promise<string> {
    this.logger.log(`Tool call: ${block.name}(${JSON.stringify(block.input)})`);

    switch (block.name) {
      case 'get_weather': {
        const { city } = block.input as { city: string };
        return this.weatherTool.execute(city);
      }
      case 'get_datetime': {
        return this.dateTimeTool.execute();
      }
      case 'get_currency': {
        const { from, to, amount } = block.input as {
          from: string;
          to: string;
          amount?: number;
        };
        return this.currencyTool.execute(from, to, amount);
      }
      case 'get_prayer_times': {
        const { city, country } = block.input as {
          city: string;
          country?: string;
        };
        return this.prayerTool.execute(city, country);
      }
      case 'get_holiday': {
        const { date } = block.input as { date?: string };
        return this.holidayTool.execute(date);
      }
      default:
        return `Tool "${block.name}" tidak dikenali.`;
    }
  }
}
