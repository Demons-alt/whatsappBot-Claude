import { Injectable } from '@nestjs/common';
import axios from 'axios';

const BASE_URL = 'https://api.frankfurter.app';

@Injectable()
export class CurrencyTool {
  readonly definition = {
    name: 'get_currency',
    description:
      'Mengecek nilai tukar / kurs mata uang secara real-time. Gunakan tool ini ketika pengguna bertanya tentang kurs, nilai tukar, atau konversi mata uang.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from: {
          type: 'string',
          description: 'Kode mata uang asal dalam format ISO 4217 (contoh: USD, SGD, EUR, JPY)',
        },
        to: {
          type: 'string',
          description: 'Kode mata uang tujuan dalam format ISO 4217 (contoh: IDR, USD, EUR)',
        },
        amount: {
          type: 'number',
          description: 'Jumlah yang ingin dikonversi. Opsional, default 1.',
        },
      },
      required: ['from', 'to'],
    },
  };

  async execute(from: string, to: string, amount = 1): Promise<string> {
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();

    try {
      const res = await axios.get(`${BASE_URL}/latest`, {
        params: { from: fromCode, to: toCode, amount },
      });

      const rate: number = res.data.rates[toCode];
      const date: string = res.data.date;

      if (!rate) {
        return `Kode mata uang "${toCode}" tidak dikenali. Gunakan kode ISO seperti USD, IDR, EUR, SGD, JPY.`;
      }

      const formattedAmount = amount.toLocaleString('id-ID');
      const formattedRate = rate.toLocaleString('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });

      return (
        `💱 Kurs Mata Uang:\n` +
        `${formattedAmount} ${fromCode} = ${formattedRate} ${toCode}\n` +
        `(Data per ${date} · Frankfurter / ECB)`
      );
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 422) {
        return `Kode mata uang "${fromCode}" tidak dikenali. Gunakan kode ISO seperti USD, IDR, EUR, SGD, JPY.`;
      }
      return `Gagal mengambil data kurs. Coba lagi nanti.`;
    }
  }
}
