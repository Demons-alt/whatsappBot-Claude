import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeneratedImage } from '../../message/outgoing-message';
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_STYLES,
  ImageAspectRatio,
  ImagePromptService,
  ImageResolution,
  ImageStyle,
} from '../image-prompt/image-prompt.service';
import { ToolDefinition } from '../providers/llm-provider.interface';

const DEFAULT_IMAGE_MODEL = 'gemini/gemini-3-pro-image-preview';
const DEFAULT_DPI = 300;
const MAX_PROMPT_LENGTH = 5000;
const MAX_IMAGE_DIMENSION = 8192;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

export type ImageSizeUnit = 'px' | 'cm' | 'inch';

export interface ImageGenerationOptions {
  width?: number;
  height?: number;
  unit?: ImageSizeUnit;
  dpi?: number;
  style?: ImageStyle;
  aspectRatio?: ImageAspectRatio;
  resolution?: ImageResolution;
  variations?: number;
  sourceImage?: { buffer: Buffer; mimeType: string };
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
      'Buat atau edit gambar dari deskripsi pengguna melalui 9router. Gunakan tool ini ketika pengguna meminta dibuatkan gambar atau mengubah foto yang dikirim. Tulis prompt visual yang lengkap dan spesifik.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          maxLength: MAX_PROMPT_LENGTH,
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
        style: {
          type: 'string',
          enum: [...IMAGE_STYLES],
          description:
            'Gaya visual. Pilih auto jika pengguna tidak menentukan gaya tertentu.',
        },
        aspect_ratio: {
          type: 'string',
          enum: [...IMAGE_ASPECT_RATIOS],
          description:
            'Rasio gambar berdasarkan tujuan: 1:1 kotak, 16:9 landscape, 9:16 vertikal, 3:4 portrait, atau 4:3 landscape.',
        },
        resolution: {
          type: 'string',
          enum: ['1K', '2K', '4K'],
          description:
            'Resolusi keluaran. Gunakan 2K untuk hasil final, 1K untuk draft, dan 4K jika pengguna meminta kualitas tinggi/cetak.',
        },
        variations: {
          type: 'integer',
          minimum: 1,
          maximum: 3,
          description:
            'Jumlah variasi yang diminta pengguna, minimal 1 dan maksimal 3.',
        },
        use_source_image: {
          type: 'boolean',
          description:
            'Set true hanya ketika pengguna ingin mengedit atau memakai foto WhatsApp terakhir sebagai referensi.',
        },
      },
      required: ['prompt'],
    },
  };

  constructor(
    private readonly config: ConfigService,
    private readonly imagePromptService: ImagePromptService,
  ) {
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
    const images = await this.executeMany(prompt, {
      ...options,
      variations: 1,
    });
    return images[0];
  }

  async executeMany(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage[]> {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      throw new Error('Prompt gambar tidak boleh kosong.');
    }
    if (normalizedPrompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Prompt gambar maksimal ${MAX_PROMPT_LENGTH} karakter.`);
    }

    const variations = options.variations ?? 1;
    if (!Number.isInteger(variations) || variations < 1 || variations > 3) {
      throw new Error('Jumlah variasi gambar harus antara 1 dan 3.');
    }

    const size = this.toPixelSize(options);
    if (
      options.sourceImage &&
      options.sourceImage.buffer.length > MAX_SOURCE_IMAGE_BYTES
    ) {
      throw new Error('Foto referensi maksimal berukuran 20 MB.');
    }
    const enhancedPrompt = this.imagePromptService.enhance(
      normalizedPrompt,
      options.style,
      options.aspectRatio,
    );
    const images: GeneratedImage[] = [];
    for (let index = 0; index < variations; index++) {
      images.push(
        await this.generateOne(enhancedPrompt, normalizedPrompt, size, options),
      );
    }
    return images;
  }

  private async generateOne(
    enhancedPrompt: string,
    originalPrompt: string,
    size: string | undefined,
    options: ImageGenerationOptions,
  ): Promise<GeneratedImage> {
    const response = await fetch(
      `${this.baseUrl}/images/generations?response_format=binary`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt: enhancedPrompt,
          n: 1,
          ...(size ? { size } : {}),
          ...(!size && options.aspectRatio
            ? { aspect_ratio: options.aspectRatio }
            : {}),
          ...(!size && options.resolution
            ? { resolution: options.resolution }
            : {}),
          ...(options.sourceImage
            ? {
                image: `data:${options.sourceImage.mimeType};base64,${options.sourceImage.buffer.toString('base64')}`,
              }
            : {}),
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

    return { buffer, mimeType: contentType, prompt: originalPrompt };
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
    if (pixelWidth > MAX_IMAGE_DIMENSION || pixelHeight > MAX_IMAGE_DIMENSION) {
      throw new Error(
        `Ukuran gambar maksimal ${MAX_IMAGE_DIMENSION} pixel per sisi.`,
      );
    }
    return `${pixelWidth}x${pixelHeight}`;
  }
}
