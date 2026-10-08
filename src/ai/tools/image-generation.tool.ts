import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeneratedImage } from '../../message/outgoing-message';
import { ToolDefinition } from '../providers/llm-provider.interface';

const DEFAULT_IMAGE_MODEL = 'gemini/gemini-3-pro-image-preview';
const DEFAULT_DPI = 300;

export type ImageSizeUnit = 'px' | 'cm' | 'inch';

export interface ImageGenerationOptions {
  width?: number;
  height?: number;
  unit?: ImageSizeUnit;
  dpi?: number;
}

@Injectable()
export class ImageGenerationTool {
  private readonly logger = new Logger(ImageGenerationTool.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  readonly definition: ToolDefinition = {
    name: 'generate_image',
    description:
      'Buat gambar baru dari deskripsi pengguna. Gunakan tool ini setiap kali pengguna meminta dibuatkan, digambarkan, atau dihasilkan sebuah gambar. Tulis prompt visual yang lengkap dan spesifik. Jika pengguna memberikan ukuran, isi width, height, dan unit sesuai permintaan.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Deskripsi visual lengkap untuk gambar yang akan dibuat, termasuk subjek, gaya, komposisi, pencahayaan, dan detail penting.',
        },
        width: {
          type: 'number',
          description:
            'Lebar gambar. Isi bersama height jika pengguna memberi ukuran.',
        },
        height: {
          type: 'number',
          description:
            'Tinggi gambar. Isi bersama width jika pengguna memberi ukuran.',
        },
        unit: {
          type: 'string',
          enum: ['px', 'cm', 'inch'],
          description:
            'Satuan width dan height. Gunakan px jika pengguna tidak menyebut satuan.',
        },
        dpi: {
          type: 'number',
          description:
            'Resolusi untuk konversi cm/inch ke pixel. Gunakan nilai dari pengguna; jika tidak disebutkan, tool memakai 300 DPI.',
        },
      },
      required: ['prompt'],
    },
  };

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('chatCombos.apiKey') ?? '';
    this.baseUrl = (
      this.config.get<string>('chatCombos.baseUrl') ??
      'http://10.20.30.50:20128/v1'
    ).replace(/\/$/, '');
    this.model =
      this.config.get<string>('chatCombos.imageModel') ?? DEFAULT_IMAGE_MODEL;
  }

  async execute(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage> {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      throw new Error('Prompt gambar tidak boleh kosong.');
    }

    const size = this.toPixelSize(options);
    const response = await fetch(
      `${this.baseUrl}/images/generations?response_format=binary`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt: normalizedPrompt,
          n: 1,
          ...(size ? { size } : {}),
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(
        `9Router image API error ${response.status}: ${detail}`,
      );
      throw new Error(`9Router image API error ${response.status}`);
    }

    const contentType =
      response.headers.get('content-type')?.split(';')[0].trim() || 'image/png';
    if (!contentType.startsWith('image/')) {
      const detail = await response.text();
      this.logger.error(`9Router image API returned ${contentType}: ${detail}`);
      throw new Error('9Router image API tidak mengembalikan gambar.');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error('9Router image API mengembalikan gambar kosong.');
    }

    return { buffer, mimeType: contentType, prompt: normalizedPrompt };
  }

  toPixelSize(options: ImageGenerationOptions): string | undefined {
    const { width, height } = options;
    if (width === undefined && height === undefined) return undefined;
    if (
      width === undefined ||
      height === undefined ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error('Lebar dan tinggi gambar harus berupa angka positif.');
    }

    const unit = options.unit ?? 'px';
    if (!['px', 'cm', 'inch'].includes(unit)) {
      throw new Error('Satuan gambar harus px, cm, atau inch.');
    }
    const dpi = options.dpi ?? DEFAULT_DPI;
    if (!Number.isFinite(dpi) || dpi <= 0) {
      throw new Error('DPI gambar harus berupa angka positif.');
    }

    const pixelsPerUnit =
      unit === 'cm' ? dpi / 2.54 : unit === 'inch' ? dpi : 1;
    const pixelWidth = Math.round(width * pixelsPerUnit);
    const pixelHeight = Math.round(height * pixelsPerUnit);
    return `${pixelWidth}x${pixelHeight}`;
  }
}
