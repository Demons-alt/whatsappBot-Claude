import { Injectable } from '@nestjs/common';
import axios from 'axios';

const BASE_URL = 'https://date.nager.at/api/v3/PublicHolidays';
const COUNTRY = 'ID';

interface Holiday {
  date: string;
  localName: string;
  name: string;
}

const MONTH_ID = [
  '',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

@Injectable()
export class HolidayTool {
  readonly definition = {
    name: 'get_holiday',
    description:
      'Mengecek apakah suatu tanggal adalah hari libur nasional Indonesia, dan menampilkan daftar libur terdekat berikutnya. Gunakan tool ini ketika pengguna bertanya tentang hari libur, tanggal merah, atau libur nasional.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: {
          type: 'string',
          description:
            'Tanggal yang ingin dicek dalam format YYYY-MM-DD (contoh: 2026-08-17). Opsional, default hari ini.',
        },
      },
      required: [],
    },
  };

  async execute(date?: string): Promise<string> {
    const target = date ? new Date(date) : new Date();
    target.setHours(0, 0, 0, 0);

    const year = target.getFullYear();

    try {
      const res = await axios.get<Holiday[]>(`${BASE_URL}/${year}/${COUNTRY}`);
      const holidays = res.data;

      const targetStr = this.toDateStr(target);
      const match = holidays.find((h) => h.date === targetStr);

      const targetLabel = this.formatDate(target);

      const upcoming = holidays
        .filter((h) => new Date(h.date) > target)
        .slice(0, 3)
        .map((h) => `  • ${this.formatDate(new Date(h.date))} — ${h.localName}`)
        .join('\n');

      const upcomingSection = upcoming
        ? `\n\n📅 Libur nasional berikutnya:\n${upcoming}`
        : '';

      if (match) {
        return `🎉 ${targetLabel} adalah hari libur nasional:\n${match.localName}${upcomingSection}`;
      }

      return `📅 ${targetLabel} bukan hari libur nasional.${upcomingSection}`;
    } catch {
      return `Gagal mengambil data hari libur. Coba lagi nanti.`;
    }
  }

  private toDateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatDate(date: Date): string {
    const d = date.getDate();
    const m = MONTH_ID[date.getMonth() + 1];
    const y = date.getFullYear();
    return `${d} ${m} ${y}`;
  }
}
