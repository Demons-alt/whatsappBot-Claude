import { ImagePromptService } from './image-prompt.service';

describe('ImagePromptService', () => {
  const service = new ImagePromptService();

  it('adds the selected style and format to the user prompt', () => {
    const prompt = service.enhance(
      'A compass pointing toward a coffee stain',
      'editorial-conceptual',
      '16:9',
    );

    expect(prompt).toContain('A compass pointing toward a coffee stain');
    expect(prompt).toContain('conceptual editorial illustration');
    expect(prompt).toContain('FORMAT: 16:9 aspect ratio');
  });

  it('uses a professional automatic direction when no style is selected', () => {
    expect(service.enhance('A product photo')).toContain(
      'professional, non-generic visual treatment',
    );
  });
});
