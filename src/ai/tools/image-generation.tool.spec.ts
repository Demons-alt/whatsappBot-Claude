import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImagePromptService } from '../image-prompt/image-prompt.service';
import { ImageGenerationTool } from './image-generation.tool';

describe('ImageGenerationTool', () => {
  const originalFetch = global.fetch;
  const requestBody = (
    fetchMock: jest.MockedFunction<typeof fetch>,
    callIndex = 0,
  ): Record<string, unknown> => {
    const init = fetchMock.mock.calls[callIndex][1];
    if (!init || typeof init.body !== 'string') {
      throw new Error('Expected a JSON request body');
    }
    return JSON.parse(init.body) as Record<string, unknown>;
  };
  const createTool = (chatCombos: Record<string, unknown> = {}) =>
    new ImageGenerationTool(
      new ConfigService({ chatCombos }),
      new ImagePromptService(),
    );

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('generates an image through the configured 9Router base URL', async () => {
    const imageBytes = Buffer.from('generated-image');
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(() =>
      Promise.resolve(
        new Response(imageBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/webp' },
        }),
      ),
    );
    global.fetch = fetchMock;

    const tool = createTool({
      apiKey: 'secret-key',
      baseUrl: 'http://9router.local/v1/',
      imageModel: 'gemini/test-image-model',
    });

    const result = await tool.execute('  a cat astronaut  ');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://9router.local/v1/images/generations?response_format=binary',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-key',
        },
      }),
    );
    const body = requestBody(fetchMock);
    expect(body.model).toBe('gemini/test-image-model');
    expect(body.prompt).toEqual(expect.stringContaining('a cat astronaut'));
    expect(body.n).toBe(1);
    expect(result).toEqual({
      buffer: imageBytes,
      mimeType: 'image/webp',
      prompt: 'a cat astronaut',
    });
  });

  it('rejects a non-image response', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'bad response' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    global.fetch = fetchMock;
    const tool = createTool({ baseUrl: 'http://9router.local/v1' });

    await expect(tool.execute('test')).rejects.toThrow(
      'tidak mengembalikan gambar',
    );
  });

  it('converts centimeters to pixels at 300 DPI by default', () => {
    const tool = createTool();

    expect(tool.toPixelSize({ width: 10, height: 15, unit: 'cm' })).toBe(
      '1181x1772',
    );
  });

  it('keeps pixel dimensions unchanged', () => {
    const tool = createTool();

    expect(tool.toPixelSize({ width: 1920, height: 1080, unit: 'px' })).toBe(
      '1920x1080',
    );
  });

  it('passes a converted custom size to 9Router', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(() =>
      Promise.resolve(
        new Response(Buffer.from('image'), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    );
    global.fetch = fetchMock;
    const tool = createTool({
      baseUrl: 'http://9router.local/v1',
      imageModel: 'image-model',
    });

    await tool.execute('poster', {
      width: 20,
      height: 10,
      unit: 'cm',
      dpi: 150,
    });

    const body = requestBody(fetchMock);
    expect(body.model).toBe('image-model');
    expect(body.prompt).toEqual(expect.stringContaining('poster'));
    expect(body.n).toBe(1);
    expect(body.size).toBe('1181x591');
  });

  it('applies style options and generates capped variations', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(() =>
      Promise.resolve(
        new Response(Buffer.from('image'), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    );
    global.fetch = fetchMock;
    const tool = createTool({
      baseUrl: 'http://9router.local/v1',
      imageModel: 'image-model',
    });

    const images = await tool.executeMany('an editorial illustration', {
      style: 'risograph',
      aspectRatio: '16:9',
      resolution: '2K',
      variations: 2,
    });

    expect(images).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = requestBody(fetchMock);
    expect(body.prompt).toEqual(expect.stringContaining('Risograph'));
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.resolution).toBe('2K');
  });

  it('passes a WhatsApp image as a data URL for editing', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(() =>
      Promise.resolve(
        new Response(Buffer.from('edited-image'), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    );
    global.fetch = fetchMock;
    const tool = createTool({ baseUrl: 'http://9router.local/v1' });

    await tool.execute('make the lighting warmer', {
      sourceImage: {
        buffer: Buffer.from('source-image'),
        mimeType: 'image/jpeg',
      },
    });

    expect(requestBody(fetchMock)).toEqual(
      expect.objectContaining({
        image: `data:image/jpeg;base64,${Buffer.from('source-image').toString('base64')}`,
      }),
    );
  });

  it('rejects more than three variations', async () => {
    const tool = createTool();

    await expect(tool.executeMany('test', { variations: 4 })).rejects.toThrow(
      'antara 1 dan 3',
    );
  });
});
