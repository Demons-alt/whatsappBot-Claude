import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageGenerationTool } from './image-generation.tool';

describe('ImageGenerationTool', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('generates an image through the configured 9Router base URL', async () => {
    const imageBytes = Buffer.from('generated-image');
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(imageBytes, {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      }),
    );
    global.fetch = fetchMock;

    const config = new ConfigService({
      chatCombos: {
        apiKey: 'secret-key',
        baseUrl: 'http://9router.local/v1/',
        imageModel: 'gemini/test-image-model',
      },
    });
    const tool = new ImageGenerationTool(config);

    const result = await tool.execute('  a cat astronaut  ');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://9router.local/v1/images/generations?response_format=binary',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-key',
        },
        body: JSON.stringify({
          model: 'gemini/test-image-model',
          prompt: 'a cat astronaut',
          n: 1,
        }),
      }),
    );
    expect(result).toEqual({
      buffer: imageBytes,
      mimeType: 'image/webp',
      prompt: 'a cat astronaut',
    });
  });

  it('rejects a non-image response', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad response' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const tool = new ImageGenerationTool(
      new ConfigService({
        chatCombos: { baseUrl: 'http://9router.local/v1' },
      }),
    );

    await expect(tool.execute('test')).rejects.toThrow(
      'tidak mengembalikan gambar',
    );
  });

  it('converts centimeters to pixels at 300 DPI by default', () => {
    const tool = new ImageGenerationTool(new ConfigService({ chatCombos: {} }));

    expect(tool.toPixelSize({ width: 10, height: 15, unit: 'cm' })).toBe(
      '1181x1772',
    );
  });

  it('keeps pixel dimensions unchanged', () => {
    const tool = new ImageGenerationTool(new ConfigService({ chatCombos: {} }));

    expect(tool.toPixelSize({ width: 1920, height: 1080, unit: 'px' })).toBe(
      '1920x1080',
    );
  });

  it('passes a converted custom size to 9Router', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(Buffer.from('image'), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    global.fetch = fetchMock;
    const tool = new ImageGenerationTool(
      new ConfigService({
        chatCombos: {
          baseUrl: 'http://9router.local/v1',
          imageModel: 'image-model',
        },
      }),
    );

    await tool.execute('poster', {
      width: 20,
      height: 10,
      unit: 'cm',
      dpi: 150,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          model: 'image-model',
          prompt: 'poster',
          n: 1,
          size: '1181x591',
        }),
      }),
    );
  });
});
