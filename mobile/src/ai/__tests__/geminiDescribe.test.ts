import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeMealWithGemini } from '../geminiDescribe';

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

const estimate = {
  items: [
    {
      name: 'Scrambled eggs',
      grams: 120,
      kcal: 220,
      proteinG: 14,
      carbsG: 2,
      fatG: 17,
      fiberG: 0,
      confidence: 'high',
      assumption: 'Two large eggs cooked in butter.',
    },
  ],
  notes: '',
  notFood: false,
};

const geminiResponse = (payload: unknown, usage = { promptTokenCount: 310, candidatesTokenCount: 95 }) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      usageMetadata: usage,
    }),
    { status: 200 },
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('describeMealWithGemini', () => {
  it('parses a well-formed estimate and reports token usage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse(estimate)));

    const result = await describeMealWithGemini('two scrambled eggs', '');

    expect(result.estimate.items[0].name).toBe('Scrambled eggs');
    expect(result.estimate.items[0].kcal).toBe(220);
    expect(result.usage).toEqual({ inputTokens: 310, outputTokens: 95 });
  });

  it('sends the shared system prompt so the eval compares providers, not prompts', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => geminiResponse(estimate));
    vi.stubGlobal('fetch', fetchMock);

    await describeMealWithGemini('two scrambled eggs', '');

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.systemInstruction.parts[0].text).toContain('Be accurate rather than cautious');
  });

  it('routes through the proxy when no key is given', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => geminiResponse(estimate));
    vi.stubGlobal('fetch', fetchMock);

    await describeMealWithGemini('two scrambled eggs', '');

    expect(fetchMock.mock.calls[0][0]).toContain('/api/gemini');
  });

  it('sends the signed-in person\'s token to the proxy, and not to Google', async () => {
    session.token.mockResolvedValue('jwt-1');
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => geminiResponse(estimate));
    vi.stubGlobal('fetch', fetchMock);

    await describeMealWithGemini('two scrambled eggs', '');
    await describeMealWithGemini('two scrambled eggs', 'AIzaUserKey');

    const headersOf = (call: number) => (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
    expect(headersOf(0).Authorization).toBe('Bearer jwt-1');
    expect(headersOf(1).Authorization).toBeUndefined();
  });

  it('refreshes once and retries when the proxy says the session expired', async () => {
    session.token.mockResolvedValue('jwt-old');
    session.refresh.mockResolvedValue('jwt-new');
    const fetchMock = vi
      .fn(async (..._args: Parameters<typeof fetch>) => geminiResponse(estimate))
      .mockResolvedValueOnce(new Response('{}', { status: 401, headers: { 'x-auth': 'expired' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await describeMealWithGemini('two scrambled eggs', '');

    expect(result.estimate.items[0].name).toBe('Scrambled eggs');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(((fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>).Authorization).toBe(
      'Bearer jwt-new',
    );
  });

  it('says the personal AI allowance is used up when the proxy names it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429, headers: { 'x-limit': 'user-daily' } })));

    await expect(describeMealWithGemini('two scrambled eggs', '')).rejects.toThrow(
      "You've used today's AI allowance. It resets tomorrow.",
    );
  });

  it('asks the person to sign in again when the proxy rejects their session', async () => {
    session.token.mockResolvedValue('jwt-1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));

    await expect(describeMealWithGemini('two scrambled eggs', '')).rejects.toThrow(
      'Sign in again to use AI features.',
    );
  });

  it('keeps the generic message for any other failure status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));

    await expect(describeMealWithGemini('two scrambled eggs', '')).rejects.toThrow('returned 429');
  });

  it('uses the key directly when one is given', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => geminiResponse(estimate));
    vi.stubGlobal('fetch', fetchMock);

    await describeMealWithGemini('two scrambled eggs', 'AIzaUserKey');

    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
  });

  // Gemini's responseSchema is a hint, not a guarantee. zod is what actually
  // decides whether a response reaches the diary, exactly as it does for Claude.
  it('rejects a response that satisfies no schema, with a message a person can read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse({ items: 'lots', notes: 5 })));

    await expect(describeMealWithGemini('two scrambled eggs', '')).rejects.toThrow(
      'Gemini replied in a form this app could not read. Try rephrasing.',
    );
  });

  // A ZodError's message is a JSON dump of validation issues. Surfacing it
  // would put that dump straight on the describe screen.
  it('does not leak zod validation detail into the error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse({ items: 'lots', notes: 5 })));

    const error = await describeMealWithGemini('two scrambled eggs', '').catch((e) => e);

    expect(error.message).not.toContain('invalid_type');
    expect(error.message).not.toContain('[');
  });

  it('rejects malformed JSON rather than returning half a meal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"items":' }] } }] }),
        { status: 200 },
      ),
    ));

    await expect(describeMealWithGemini('two scrambled eggs', '')).rejects.toThrow();
  });

  it('carries notFood through instead of inventing items', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      geminiResponse({ items: [], notes: 'That is a bicycle.', notFood: true }),
    ));

    const result = await describeMealWithGemini('my bicycle', '');

    expect(result.estimate.notFood).toBe(true);
    expect(result.estimate.items).toHaveLength(0);
  });

  it('reports a timeout as a sentence rather than an AbortError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }));

    await expect(describeMealWithGemini('two scrambled eggs', '')).rejects.toThrow(
      'The estimate took too long. Try again.',
    );
  });

  it('reports an unreachable service as a sentence rather than a raw fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const error = await describeMealWithGemini('two scrambled eggs', '').catch((e) => e);

    expect(error.message).toBe('Could not reach the estimate service. Check your connection.');
  });

  it('still reports an HTTP status rather than relabelling it a connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));

    await expect(describeMealWithGemini('two scrambled eggs', '')).rejects.toThrow(
      'The estimate service returned 503.',
    );
  });
});
