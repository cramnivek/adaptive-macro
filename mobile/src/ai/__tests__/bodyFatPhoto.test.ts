import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyFatRequestBody, estimateBodyFatFromPhotos, parseBodyFatReply } from '../bodyFatPhoto';

// The real helpers read the Supabase session, which needs react-native.
const session = vi.hoisted(() => ({
  token: vi.fn(async (): Promise<string | null> => null),
  refresh: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock('../../social/api', () => ({
  currentAccessToken: session.token,
  refreshAccessToken: session.refresh,
}));

beforeEach(() => {
  session.token.mockReset().mockResolvedValue(null);
  session.refresh.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const front = { base64: 'RlJPTlQ=', mimeType: 'image/jpeg' as const };
const side = { base64: 'U0lERQ==', mimeType: 'image/jpeg' as const };
const context = { sex: 'male' as const, age: 30, heightCm: 178, weightKg: 75.24 };

const reply = (payload: unknown, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), {
    status,
  });

describe('bodyFatRequestBody', () => {
  it('labels each photo and sends the person’s context alongside', () => {
    const body = JSON.parse(bodyFatRequestBody(front, side, context));
    const parts = body.contents[0].parts;
    expect(parts[0]).toEqual({ text: 'Front view:' });
    expect(parts[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: 'RlJPTlQ=' });
    expect(parts[2]).toEqual({ text: 'Side view:' });
    expect(parts[3].inlineData.data).toBe('U0lERQ==');
    expect(parts[4].text).toBe('Sex: male\nAge: 30\nHeight: 178 cm\nWeight: 75.2 kg');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('leaves weight out when there is no trend yet', () => {
    const body = JSON.parse(bodyFatRequestBody(front, side, { ...context, weightKg: null }));
    expect(body.contents[0].parts[4].text).not.toContain('Weight');
  });
});

describe('parseBodyFatReply', () => {
  it('keeps the model’s range and observations as given', () => {
    const result = parseBodyFatReply(
      JSON.stringify({ usable: true, reason: '', lowPct: 16, highPct: 22, basis: [' Some abdominal outline ', ''] }),
    );
    expect(result).toEqual({ usable: true, lowPct: 16, highPct: 22, basis: ['Some abdominal outline'] });
  });

  it('passes on the model’s reason for declining', () => {
    expect(
      parseBodyFatReply(JSON.stringify({ usable: false, reason: 'Retake in fitted clothing.', lowPct: 0, highPct: 0, basis: [] })),
    ).toEqual({ usable: false, reason: 'Retake in fitted clothing.' });
  });

  it('refuses a range that is backwards or cannot describe a person, rather than repairing it', () => {
    for (const [lowPct, highPct] of [[22, 16], [1, 8], [55, 70], [18, 18]]) {
      expect(() =>
        parseBodyFatReply(JSON.stringify({ usable: true, reason: '', lowPct, highPct, basis: [] })),
      ).toThrow(/could not read/);
    }
    expect(() => parseBodyFatReply('not json')).toThrow(/could not read/);
  });
});

describe('estimateBodyFatFromPhotos', () => {
  it('sends both photos through the proxy and returns the range', async () => {
    const fetchMock = vi.fn(async () => reply({ usable: true, reason: '', lowPct: 17, highPct: 23, basis: ['x'] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await estimateBodyFatFromPhotos(front, side, context, '');
    expect(result).toEqual({ usable: true, lowPct: 17, highPct: 23, basis: ['x'] });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(String(init.body)).toContain('U0lERQ==');
  });

  it('says when today’s allowance is spent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429, headers: { 'x-limit': 'user-daily' } })),
    );
    await expect(estimateBodyFatFromPhotos(front, side, context, '')).rejects.toThrow(/allowance/);
  });

  it('turns a dropped connection into a sentence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(estimateBodyFatFromPhotos(front, side, context, '')).rejects.toThrow(/Check your connection/);
  });
});
