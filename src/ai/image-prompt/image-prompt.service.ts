import { Injectable } from '@nestjs/common';

export const IMAGE_STYLES = [
  'auto',
  'risograph',
  'minimalist-ink',
  'watercolor-line',
  'editorial-conceptual',
  'schematic',
] as const;

export type ImageStyle = (typeof IMAGE_STYLES)[number];

export const IMAGE_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '3:4',
  '4:3',
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];
export type ImageResolution = '1K' | '2K' | '4K';

export const IMAGE_PROMPT_WORKFLOW = `
Saat pengguna meminta gambar, bertindaklah seperti creative director:
- Jika brief masih luas dan pengguna tidak meminta langsung dibuatkan, tawarkan tepat 3 konsep visual yang konkret, tidak klise, beri rekomendasi, lalu tunggu pilihan pengguna.
- Jika brief sudah jelas, pengguna memilih konsep, atau pengguna meminta langsung dibuatkan, panggil tool generate_image tanpa menunda.
- Prompt tool harus berupa kalimat natural yang lengkap, bukan kumpulan tag. Jelaskan subjek, konsep, latar, komposisi, pencahayaan, warna, tekstur, mood, hal yang harus dihindari, dan format.
- Gunakan satu fokus utama, maksimal 2-3 elemen penting, dan ruang negatif yang cukup. Hindari metafora generik seperti bohlam untuk ide, jabat tangan untuk kemitraan, roda gigi untuk proses, dan puzzle untuk koneksi kecuali diminta pengguna.
- Jangan menambahkan tulisan ke gambar kecuali pengguna secara eksplisit meminta tulisan. Jika diminta, tulis teks persis dalam tanda kutip.
- Pilih style dan aspect_ratio berdasarkan tujuan pengguna. Gunakan resolution 2K secara default untuk hasil final, 1K untuk draft cepat, dan 4K hanya jika pengguna meminta kualitas cetak/tinggi.
- Jika pengguna meminta beberapa versi, isi variations sesuai permintaan, maksimal 3.
- Untuk mengedit foto yang dikirim pengguna, set use_source_image=true dan jelaskan dengan tegas bagian yang dipertahankan serta bagian yang diubah.
- Jika pengguna memberi ukuran cm/inch/px, teruskan width, height, unit, dan dpi. Jangan mengarang ukuran jika tidak diberikan.
`;

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  auto: `STYLE DIRECTION: Use a professional, non-generic visual treatment suited to the subject. Favor a clear focal hierarchy, intentional material detail, and a coherent limited palette.`,
  risograph: `STYLE DIRECTION: Risograph screen-print aesthetic with visible halftone dots, slight misregistration between color layers, flat spot colors, warm tactile paper grain, and handmade indie-print character. Use a limited palette with one dominant accent. Avoid smooth gradients, glossy rendering, clip art, and empty white borders.`,
  'minimalist-ink': `STYLE DIRECTION: Minimalist black-and-white ink illustration with confident hand-drawn linework, strong silhouettes, crosshatching for depth, and intentional imperfection. Avoid vector-clean edges, gray gradients, photorealism, and decorative clutter.`,
  'watercolor-line': `STYLE DIRECTION: Confident ink linework with loose watercolor washes, visible brushstrokes, natural bleeding and pooling, uneven saturation, and warm paper grain. Use a restrained palette and avoid digitally perfect edges, gradients, and photorealistic rendering.`,
  'editorial-conceptual': `STYLE DIRECTION: Sophisticated conceptual editorial illustration with visual wit, an unexpected but immediately readable metaphor, asymmetrical balance, generous negative space, analog texture, and no more than three distinct elements. Avoid corporate stock imagery, clichés, glossy AI rendering, and busy quadrant layouts.`,
  schematic: `STYLE DIRECTION: Clean technical schematic with crisp black linework on a white background, uniform line weight, simplified essential geometry, and minimal hatching only where depth is necessary. Avoid color, gradients, photorealistic texture, decoration, and busy backgrounds.`,
};

@Injectable()
export class ImagePromptService {
  enhance(
    prompt: string,
    style: ImageStyle = 'auto',
    aspectRatio?: ImageAspectRatio,
  ): string {
    const normalized = prompt.trim();
    if (!IMAGE_STYLES.includes(style)) {
      throw new Error('Gaya gambar tidak didukung.');
    }
    if (aspectRatio && !IMAGE_ASPECT_RATIOS.includes(aspectRatio)) {
      throw new Error('Rasio gambar tidak didukung.');
    }
    const format = aspectRatio
      ? `FORMAT: ${aspectRatio} aspect ratio.`
      : 'FORMAT: Choose framing appropriate to the requested use.';

    return [
      normalized,
      STYLE_PROMPTS[style],
      'COMPOSITION RULES: One clear focal point, no more than two or three important elements, intentional visual hierarchy, and enough negative space for readability.',
      format,
    ].join('\n\n');
  }
}
