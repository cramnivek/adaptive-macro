import Constants from 'expo-constants';
import { Platform } from 'react-native';
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

const OLLAMA_PORT = 11434;
const LOOPBACK_OLLAMA_HOST = `http://127.0.0.1:${OLLAMA_PORT}`;

/**
 * Where to look for Ollama before the user points it somewhere else.
 *
 * On a desktop browser the server is on the same machine, so loopback is
 * right. On a phone running Expo Go it is not: 127.0.0.1 is the phone, which
 * has no Ollama on it. The machine serving this bundle over the LAN is almost
 * certainly the one running the model, so its address is taken from the dev
 * server's own host URI rather than asking the user to go and find it.
 *
 * Only a bare IPv4 literal is trusted. A tunnel gives an ngrok-style hostname
 * and a production build gives nothing at all; in both cases the dev host is
 * not the model host, so the guess is dropped rather than pointed somewhere
 * wrong.
 */
export const defaultOllamaHost = (): string => {
  if (Platform.OS === 'web') return LOOPBACK_OLLAMA_HOST;

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (!host || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return LOOPBACK_OLLAMA_HOST;

  return `http://${host}:${OLLAMA_PORT}`;
};

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
