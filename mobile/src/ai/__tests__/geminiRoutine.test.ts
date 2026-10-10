import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentKindOf, readRoutinesWithGemini } from '../geminiRoutine';

const pdf = { mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' };

const geminiResponse = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), {
    status: 200,
  });

const programme = {
  notProgram: false,
  routines: [{ name: 'Upper', exercises: [{ name: 'Bench Press', sets: 4, reps: '6-8' }] }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readRoutinesWithGemini', () => {
  it('returns the routines the document holds, ready to save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse(programme)));

    const drafts = await readRoutinesWithGemini(pdf, '');

    expect(drafts).toEqual([{ name: 'Upper', exercises: [{ name: 'Bench Press', sets: 4, reps: '6-8' }] }]);
  });

  it('sends the document inline, with its own media type, beside the extraction prompt', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => geminiResponse(programme));
    vi.stubGlobal('fetch', fetchMock);

    await readRoutinesWithGemini(pdf, '');

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'application/pdf', data: 'JVBERi0xLjQK' } });
    expect(body.systemInstruction.parts[0].text).toContain('Never add an exercise it does not list');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('says so when the file is not a programme, rather than returning nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse({ notProgram: true, routines: [] })));

    await expect(readRoutinesWithGemini(pdf, '')).rejects.toThrow('does not look like a training programme');
  });

  it('treats a programme with no usable exercises as unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse({ notProgram: false, routines: [{ name: 'Day 1', exercises: [] }] })));

    await expect(readRoutinesWithGemini(pdf, '')).rejects.toThrow('could not be read from that file');
  });

  it('does not leak zod validation detail when the shape is wrong', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse({ routines: 'lots' })));

    const error = await readRoutinesWithGemini(pdf, '').catch((e) => e);

    expect(error.message).toContain('could not be read from that file');
    expect(error.message).not.toContain('invalid_type');
  });

  it('names the rate limit instead of reporting a bare status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })));

    await expect(readRoutinesWithGemini(pdf, '')).rejects.toThrow('Too many requests');
  });

  it('reports a timeout as a sentence rather than an AbortError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }));

    await expect(readRoutinesWithGemini(pdf, '')).rejects.toThrow('took too long');
  });

  it('reports an unreachable service as a sentence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(readRoutinesWithGemini(pdf, '')).rejects.toThrow('Could not reach the import service');
  });
});

describe('documentKindOf', () => {
  it('sends a PDF or an image as what its extension says', () => {
    expect(documentKindOf('PPL Programme.PDF', '')).toEqual({ mimeType: 'application/pdf' });
    expect(documentKindOf('week1.jpeg', 'image/jpeg')).toEqual({ mimeType: 'image/jpeg' });
  });

  it('trusts the extension over a generic reported type', () => {
    expect(documentKindOf('plan.pdf', 'application/octet-stream')).toEqual({ mimeType: 'application/pdf' });
    // A browser reports HEIC with an empty type.
    expect(documentKindOf('IMG_0042.HEIC', '')).toEqual({ mimeType: 'image/heic' });
  });

  it('falls back to the reported type when the name has no extension', () => {
    expect(documentKindOf('image', 'image/png')).toEqual({ mimeType: 'image/png' });
  });

  it('names a spreadsheet as such, so the screen can say how to convert it', () => {
    expect(documentKindOf('12 week plan.xlsx', '')).toEqual({ problem: 'spreadsheet' });
    expect(documentKindOf('plan', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toEqual({
      problem: 'spreadsheet',
    });
    expect(documentKindOf('plan.csv', 'text/csv')).toEqual({ problem: 'spreadsheet' });
  });

  it('turns away anything else', () => {
    expect(documentKindOf('plan.docx', '')).toEqual({ problem: 'unsupported' });
    expect(documentKindOf('notes.txt', 'text/plain')).toEqual({ problem: 'unsupported' });
  });
});
