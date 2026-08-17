import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const GEO_API = 'https://api.openweathermap.org/geo/1.0/direct';

@Injectable()
export class WeatherTool {
  readonly definition = {
    name: 'get_weather',
    description:
      'Mendapatkan informasi cuaca terkini untuk sebuah kota. Gunakan tool ini ketika pengguna menanyakan cuaca suatu kota.',
    input_schema: {
      type: 'object' as const,
      properties: {
        city: {
          type: 'string',
          description:
            'Nama kota dalam bahasa Inggris (contoh: Jakarta, Surabaya, Bandung)',
        },
      },
      required: ['city'],
    },
  };

  constructor(private readonly config: ConfigService) {}

  async execute(city: string): Promise<string> {
    const apiKey = this.config.get<string>('openweather.apiKey');
    const baseUrl = this.config.get<string>('openweather.baseUrl');

    // Coba langsung dengan nama kota
    try {
      const response = await axios.get(`${baseUrl}/weather`, {
        params: { q: city, appid: apiKey, units: 'metric', lang: 'id' },
      });
      return this.formatWeather(response.data);
    } catch (err: any) {
      if (err.response?.status !== 404) {
        return `Gagal mengambil data cuaca untuk "${city}". Coba lagi nanti.`;
      }
    }

    // Kota tidak ditemukan — cari lokasi terdekat via Geocoding API
    try {
      const geoRes = await axios.get(GEO_API, {
        params: { q: city, limit: 1, appid: apiKey },
      });

      const locations: any[] = geoRes.data;
      if (!locations || locations.length === 0) {
        return `Lokasi "${city}" tidak ditemukan. Coba cek ejaan atau gunakan nama kota lain.`;
      }

      const found = locations[0];
      const label = found.state
        ? `${found.name}, ${found.state}, ${found.country}`
        : `${found.name}, ${found.country}`;

      const weatherRes = await axios.get(`${baseUrl}/weather`, {
        params: {
          lat: found.lat,
          lon: found.lon,
          appid: apiKey,
          units: 'metric',
          lang: 'id',
        },
      });

      return (
        `(Lokasi "${city}" tidak ditemukan, menampilkan cuaca untuk ${label} yang paling mendekati)\n\n` +
        this.formatWeather(weatherRes.data)
      );
    } catch {
      return `Lokasi "${city}" tidak ditemukan. Coba cek ejaan atau gunakan nama kota lain.`;
    }
  }

  private formatWeather(data: any): string {
    const temp = Math.round(data.main.temp);
    const feelsLike = Math.round(data.main.feels_like);
    const humidity: number = data.main.humidity;
    const description: string = data.weather[0].description;
    const windSpeed: number = data.wind.speed;
    const cityName: string = data.name;
    const country: string = data.sys.country;

    return (
      `Cuaca di ${cityName}, ${country}:\n` +
      `🌡️ Suhu: ${temp}°C (terasa seperti ${feelsLike}°C)\n` +
      `🌤️ Kondisi: ${description}\n` +
      `💧 Kelembapan: ${humidity}% — ${this.describeHumidity(humidity)}\n` +
      `💨 Angin: ${this.describeWind(windSpeed)}`
    );
  }

  private describeHumidity(humidity: number): string {
    if (humidity < 40)
      return 'udara kering, kulit mungkin terasa sedikit kering';
    if (humidity < 60) return 'udara nyaman, tidak terlalu lembap';
    if (humidity < 75) return 'agak lembap, masih cukup nyaman';
    if (humidity < 85) return 'lembap, keringat terasa lebih lambat kering';
    return 'sangat lembap, gerah dan lengket';
  }

  private describeWind(speedMs: number): string {
    const kmh = Math.round(speedMs * 3.6);

    let label: string;
    if (speedMs < 0.5) label = 'tenang, hampir tidak ada angin';
    else if (speedMs < 1.6) label = 'sepoi-sepoi, angin terasa di wajah';
    else if (speedMs < 3.4) label = 'angin pelan, daun-daun bergoyang';
    else if (speedMs < 5.5) label = 'angin sedang, ranting kecil bergerak';
    else if (speedMs < 8.0) label = 'agak kencang, susah buka payung';
    else if (speedMs < 10.8) label = 'kencang, berjalan terasa berat';
    else label = 'sangat kencang, berbahaya di luar ruangan';

    return `${kmh} km/jam — ${label}`;
  }
}
