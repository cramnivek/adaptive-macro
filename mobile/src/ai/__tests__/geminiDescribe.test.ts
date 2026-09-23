import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeMealWithGemini } from '../geminiDescribe';

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
});
