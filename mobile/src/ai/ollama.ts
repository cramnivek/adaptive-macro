import * as z from 'zod/v4';
import {
  type DescribeResult,
  MealEstimateSchema,
  SYSTEM_PROMPT,
} from './describeMeal';

/**
 * Meal estimation against a local Ollama server.
 *
 * Same system prompt and same output schema as the hosted path — Ollama's
 * `format` parameter constrains generation to the schema, so a local model is
 * held to the identical contract rather than being asked politely for JSON.
 *
 * This exists because the hosted path needs an API key and a billing
 * relationship, and neither is necessary for this task. Measured on the repo's
 * eval, qwen2.5:32b scored 15/15 with −2.5% calorie bias on precisely
 * specified meals — better than good enough for logging weighed food, at no
 * cost and with nothing leaving the machine.
 */

export const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';

export class OllamaUnreachableError extends Error {
  constructor(host: string) {
    super(`Could not reach Ollama at ${host}`);
    this.name = 'OllamaUnreachableError';
  }
}

export class OllamaModelMissingError extends Error {
  constructor(readonly model: string) {
    super(`Ollama has no model "${model}"`);
    this.name = 'OllamaModelMissingError';
  }
}

/** Model tags the server currently has, for the picker in Settings. */
export const listOllamaModels = async (host: string): Promise<string[]> => {
  let response: Response;
  try {
    response = await fetch(`${host.replace(/\/$/, '')}/api/tags`);
  } catch {
    throw new OllamaUnreachableError(host);
  }
  if (!response.ok) throw new OllamaUnreachableError(host);

  const body = (await response.json()) as { models?: { name?: string }[] };
  return (body.models ?? [])
    .map((m) => m.name)
    .filter((name): name is string => typeof name === 'string')
    .sort();
};

export const describeMealWithOllama = async (
  description: string,
  host: string,
  model: string,
): Promise<DescribeResult> => {
  if (!model.trim()) throw new OllamaModelMissingError(model);

  const schema = z.toJSONSchema(MealEstimateSchema);

  let response: Response;
  try {
    response = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: schema,
        options: {
          temperature: 0,
          // Ollama's per-model default context can be as low as 2k, which the
          // system prompt plus a long answer can exceed. A truncation would
          // surface as a wrong estimate rather than an error.
          num_ctx: 8192,
          num_predict: 2048,
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: description.trim() },
        ],
      }),
    });
  } catch {
    throw new OllamaUnreachableError(host);
  }

  if (response.status === 404) throw new OllamaModelMissingError(model);
  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    model?: string;
    message?: { content?: string };
    done_reason?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };

  const text = body.message?.content ?? '';

  // Validated against the same schema the hosted path uses. A local model that
  // returns well-formed but wrong-shaped JSON fails here rather than being
  // logged as a half-parsed meal.
  const parsed = MealEstimateSchema.safeParse(JSON.parse(text || '{}'));
  if (!parsed.success) {
    throw new Error(
      'The local model replied in a form this app could not read. Try rephrasing, or a larger model.',
    );
  }

  return {
    estimate: parsed.data,
    usage: {
      inputTokens: body.prompt_eval_count ?? 0,
      outputTokens: body.eval_count ?? 0,
    },
    model: body.model ?? model,
    raw: { stopReason: body.done_reason ?? null, text },
  };
};
