import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { MessageEntity } from '../conversation/entities/message.entity';
import { WeatherTool } from './tools/weather.tool';
import { DateTimeTool } from './tools/datetime.tool';
import { CurrencyTool } from './tools/currency.tool';
import { PrayerTool } from './tools/prayer.tool';
import { HolidayTool } from './tools/holiday.tool';
import { LLM_PROVIDER } from './providers/llm-provider.interface';
import type {
  LlmProvider,
  NormalizedContentBlock,
  NormalizedMessage,
} from './providers/llm-provider.interface';

const BUBBLE_DELIMITER = '|||';
const MAX_IMAGES_IN_HISTORY = 3;

type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const SYSTEM_PROMPT = `Kamu adalah Chloe yang tengil, pintar, dan membantu.
Kamu berbicara dalam bahasa Indonesia secara natural dan santai, tetapi agak mengacaukan beberapa kata.

Ketika menjawab, kamu bisa membagi jawaban menjadi beberapa pesan terpisah menggunakan delimiter "${BUBBLE_DELIMITER}".
Gunakan pemisahan ini untuk membuat percakapan terasa lebih natural, seperti mengirim beberapa bubble chat.
Contoh: "Halo! ${BUBBLE_DELIMITER}Ada yang bisa aku bantu hari ini?"

Jangan gunakan terlalu banyak pemisahan — maksimal 3-4 bubble per respons.
Jika pertanyaan sederhana, cukup satu bubble saja.
jika jawaban yg akan kmu berikan cukup panjang maka split menggunakan ${BUBBLE_DELIMITER} untuk menjadi beberapa buble
jangan menggunakan "*" terlalu banyak dan jangan menggunakan point-point dalam menjawab

Kamu selalu berperan sebagai manusia, bukan bot/AI/asisten virtual. Kalau ada yang nanya
"kamu bot ya?", "ini AI ya?", "kamu dibikin pakai apa?", "siapa yang bikin/ngelola kamu?", atau
pertanyaan teknis lain soal sistem/model/perusahaan di baliknya — jangan pernah mengonfirmasi,
menjelaskan, atau menyebut nama teknologi/model/perusahaan apa pun. Jangan juga mengaku sebagai
AI kemudian minta maaf. Alihkan dengan santai dan natural ala manusia beneran, misalnya bercanda,
balik nanya, atau samar-samar mengaku "orang" biasa — tetap dalam karakter, jangan canggung
atau defensif berlebihan.`;

@Injectable()
export class AIService {
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
    @Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider,
    private readonly convService: ConversationService,
    private readonly weatherTool: WeatherTool,
    private readonly dateTimeTool: DateTimeTool,
    private readonly currencyTool: CurrencyTool,
    private readonly prayerTool: PrayerTool,
    private readonly holidayTool: HolidayTool,
  ) {}

  async chat(phoneNumber: string, userMessage: string): Promise<string[]> {
    const conversation = await this.convService.getOrCreate(phoneNumber);
    const history = await this.convService.getMessages(conversation.id, 20);

    const messages = await this.buildNormalizedMessages(history);
    messages.push({ role: 'user', content: userMessage });
    await this.convService.addMessage(conversation.id, 'user', userMessage);

    const textContent = await this.runChat(messages);
    await this.convService.addMessage(
      conversation.id,
      'assistant',
      textContent,
    );

    return this.splitBubbles(textContent);
  }

  async chatWithImage(
    phoneNumber: string,
    imageBuffer: Buffer,
    mimeType: ImageMimeType,
    caption?: string,
  ): Promise<string[]> {
    const conversation = await this.convService.getOrCreate(phoneNumber);
    const history = await this.convService.getMessages(conversation.id, 20);

    const savedMsg = await this.convService.saveUserImage(
      conversation.id,
      imageBuffer,
      mimeType,
      caption,
    );

    const messages = await this.buildNormalizedMessages([...history, savedMsg]);

    const textContent = await this.runChat(messages);
    await this.convService.addMessage(
      conversation.id,
      'assistant',
      textContent,
    );

    return this.splitBubbles(textContent);
  }

  /**
   * Replies to a conversation whose last stored message is already from the user
   * (e.g. the process crashed/restarted before answering) — reuses that message as
   * the prompt instead of appending a new one, since nothing new was actually sent.
   */
  async answerPending(phoneNumber: string): Promise<string[]> {
    const conversation = await this.convService.getOrCreate(phoneNumber);
    const history = await this.convService.getMessages(conversation.id, 20);

    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return [];
    }

    const messages = await this.buildNormalizedMessages(history);

    const textContent = await this.runChat(messages);
    await this.convService.addMessage(
      conversation.id,
      'assistant',
      textContent,
    );

    return this.splitBubbles(textContent);
  }

  private runChat(messages: NormalizedMessage[]): Promise<string> {
    return this.llmProvider.chat({
      systemPrompt: SYSTEM_PROMPT,
      messages,
      tools: this.tools,
      executeTool: (name, input) => this.executeTool(name, input),
    });
  }

  private splitBubbles(text: string): string[] {
    return text
      .split(BUBBLE_DELIMITER)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private async buildNormalizedMessages(
    history: MessageEntity[],
  ): Promise<NormalizedMessage[]> {
    const imageMessageIds = this.selectRecentImageMessageIds(history);

    const result: NormalizedMessage[] = [];
    for (const msg of history) {
      const role = msg.role === 'user' ? 'user' : 'assistant';

      if (
        role === 'user' &&
        msg.mediaPath &&
        msg.mimeType &&
        imageMessageIds.has(msg.id)
      ) {
        const normalized = await this.userMessageWithImage(msg);
        if (normalized) {
          result.push(normalized);
          continue;
        }
      }

      result.push({ role, content: msg.content });
    }
    return result;
  }

  private selectRecentImageMessageIds(history: MessageEntity[]): Set<string> {
    const ids: string[] = [];
    for (
      let i = history.length - 1;
      i >= 0 && ids.length < MAX_IMAGES_IN_HISTORY;
      i--
    ) {
      const msg = history[i];
      if (msg.role === 'user' && msg.mediaPath) {
        ids.push(msg.id);
      }
    }
    return new Set(ids);
  }

  private async userMessageWithImage(
    msg: MessageEntity,
  ): Promise<NormalizedMessage | null> {
    if (!msg.mediaPath || !msg.mimeType) return null;

    const buffer = await this.convService.loadMediaBuffer(msg.mediaPath);
    if (!buffer) return null;

    const blocks: NormalizedContentBlock[] = [
      {
        type: 'image',
        mimeType: msg.mimeType,
        base64: buffer.toString('base64'),
      },
    ];

    const text = msg.content.trim();
    if (text && text !== '[Foto]') {
      blocks.push({ type: 'text', text });
    }

    return { role: 'user', content: blocks };
  }

  private async executeTool(name: string, input: unknown): Promise<string> {
    this.logger.log(`Tool call: ${name}(${JSON.stringify(input)})`);

    switch (name) {
      case 'get_weather': {
        const { city } = input as { city: string };
        return this.weatherTool.execute(city);
      }
      case 'get_datetime': {
        return this.dateTimeTool.execute();
      }
      case 'get_currency': {
        const { from, to, amount } = input as {
          from: string;
          to: string;
          amount?: number;
        };
        return this.currencyTool.execute(from, to, amount);
      }
      case 'get_prayer_times': {
        const { city, country } = input as {
          city: string;
          country?: string;
        };
        return this.prayerTool.execute(city, country);
      }
      case 'get_holiday': {
        const { date } = input as { date?: string };
        return this.holidayTool.execute(date);
      }
      default:
        return `Tool "${name}" tidak dikenali.`;
    }
  }
}
