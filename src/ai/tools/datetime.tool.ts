import { Injectable } from '@nestjs/common';

const TIMEZONE = 'Asia/Jakarta';

@Injectable()
export class DateTimeTool {
  readonly definition = {
    name: 'get_datetime',
    description:
      'Mendapatkan tanggal dan waktu saat ini. Gunakan tool ini ketika pengguna bertanya tentang hari ini, tanggal, jam, atau waktu sekarang.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  };

  execute(): string {
    const now = new Date();

    const dateStr = now.toLocaleDateString('id-ID', {
      timeZone: TIMEZONE,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const timeStr = now.toLocaleTimeString('id-ID', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    return `Sekarang: ${dateStr}, pukul ${timeStr} WIB`;
  }
}
