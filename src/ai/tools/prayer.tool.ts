import { Injectable } from '@nestjs/common';
import axios from 'axios';

// Method 11 = KEMENAG (Kementerian Agama RI)
const BASE_URL = 'https://api.aladhan.com/v1/timingsByCity';
const METHOD = 11;

const PRAYER_LABELS: Record<string, string> = {
  Fajr: 'Subuh  ',
  Dhuhr: 'Dzuhur ',
  Asr: 'Ashar  ',
  Maghrib: 'Maghrib',
  Isha: 'Isya   ',
};

@Injectable()
export class PrayerTool {
  readonly definition = {
    name: 'get_prayer_times',
    description:
      'Mendapatkan jadwal sholat 5 waktu untuk sebuah kota. Gunakan tool ini ketika pengguna bertanya tentang jadwal sholat, waktu adzan, atau waktu ibadah.',
    input_schema: {
      type: 'object' as const,
      properties: {
        city: {
          type: 'string',
          description: 'Nama kota (contoh: Jakarta, Surabaya, Bandung, Medan)',
        },
        country: {
          type: 'string',
          description:
            'Nama negara dalam bahasa Inggris. Opsional, default "Indonesia".',
        },
      },
      required: ['city'],
    },
  };

  async execute(city: string, country = 'Indonesia'): Promise<string> {
    try {
      const res = await axios.get(BASE_URL, {
        params: { city, country, method: METHOD },
      });

      const timings = res.data.data.timings;
      const dateInfo = res.data.data.date.readable;
      const hijriDate: string = res.data.data.date.hijri.date;
      const hijriMonth: string = res.data.data.date.hijri.month.en;

      const lines = Object.entries(PRAYER_LABELS).map(
        ([key, label]) => `${label} : ${timings[key]}`,
      );

      return (
        `🕌 Jadwal Sholat ${city}, ${country}\n` +
        `${dateInfo} / ${hijriDate} ${hijriMonth}\n\n` +
        lines.join('\n')
      );
    } catch (err: any) {
      if (err.response?.status === 400) {
        return `Kota "${city}" tidak ditemukan. Pastikan nama kota sudah benar.`;
      }
      return `Gagal mengambil jadwal sholat untuk "${city}". Coba lagi nanti.`;
    }
  }
}
