import { routeFor } from '../api/gemini';
import {
  type BuildOptions,
  buildRoutinePrompt,
  DEFAULT_BUILD_OPTIONS,
  ROUTINE_BUILD_SYSTEM,
  type RoutineFocus,
} from './routineBuild';
import {
  ROUTINE_IMPORT_PROMPT,
  ROUTINE_RESPONSE_SCHEMA,
  type RoutineDraft,
  type RoutineImport,
  RoutineImportSchema,
  toRoutineDrafts,
} from './routineImport';

/**
 * Reading a programme document through Gemini.
 *
 * Gemini takes a PDF or an image inline, the same way the meal photo goes, so
 * there is no upload step and nothing stored anywhere but the request.
 */

const MODEL = 'gemini-3.5-flash';

/**
 * A multi-page PDF is the slowest thing this app sends: a few megabytes up,
 * then the model reading every page. Kept under the proxy's 120 s so a slow
 * read is reported here as slow, not as a dropped connection.
 */
const TIMEOUT_MS = 100_000;

/**
 * Gemini refuses an inline request over about 20 MB, and base64 grows a file
 * by a third, so this is the largest original that still fits.
 */
export const MAX_DOCUMENT_BYTES = 14 * 1024 * 1024;

/** What Gemini can read inline, by extension. A spreadsheet is not among them. */
const READABLE: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const SPREADSHEET = new Set(['xlsx', 'xls', 'xlsm', 'csv', 'numbers', 'ods']);

/**
 * The media type to send a picked file as, or why it cannot be sent.
 *
 * Decided by the extension before the type the picker reports: a browser
 * leaves `File.type` empty for HEIC, and some report a PDF as
 * `application/octet-stream`.
 */
export const documentKindOf = (
  name: string,
  reportedType: string,
): { mimeType: string } | { problem: 'spreadsheet' | 'unsupported' } => {
  const extension = name.toLowerCase().split('.').pop() ?? '';
  if (READABLE[extension]) return { mimeType: READABLE[extension] };
  if (Object.values(READABLE).includes(reportedType)) return { mimeType: reportedType };
  if (SPREADSHEET.has(extension) || reportedType.includes('spreadsheet') || reportedType.includes('excel')) {
    return { problem: 'spreadsheet' };
  }
  return { problem: 'unsupported' };
};

export interface ProgrammeDocument {
  mimeType: string;
  base64: string;
}

/** Marks an error raised on purpose, so the transport catch passes it through. */
class RoutineResponseError extends Error {}

const textOf = (response: unknown): string => {
  const parts = (response as any)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
};

/** What differs between reading a file and building from scratch. */
interface RoutineRequest {
  system: string;
  parts: unknown[];
  timeoutMs: number;
  /** Shown when the answer holds no usable routine. */
  unusable: string;
  /** Shown when the request ran out of time. */
  slow: string;
}

const requestRoutines = async (request: RoutineRequest, apiKey: string): Promise<RoutineImport> => {
  const route = routeFor(MODEL, apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  let payload: any;
  try {
    const response = await fetch(route.url, {
      method: 'POST',
      signal: controller.signal,
      headers: route.headers,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ parts: request.parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: ROUTINE_RESPONSE_SCHEMA,
        },
      }),
    });

    if (response.status === 429) {
      throw new RoutineResponseError('Too many requests just now. Wait a few minutes and try again.');
    }
    if (!response.ok) {
      throw new RoutineResponseError(`The routine service returned ${response.status}.`);
    }
    payload = await response.json();
  } catch (error) {
    if (error instanceof RoutineResponseError) throw error;
    if ((error as Error)?.name === 'AbortError') throw new Error(request.slow);
    throw new Error('Could not reach the routine service. Check your connection.');
  } finally {
    clearTimeout(timer);
  }

  // zod, not Gemini, is the boundary; its message is a JSON dump, so it is
  // replaced with a sentence rather than shown.
  try {
    return RoutineImportSchema.parse(JSON.parse(textOf(payload)));
  } catch {
    throw new Error(request.unusable);
  }
};

const UNREADABLE = 'The programme could not be read from that file. Try a clearer PDF or screenshot.';

export const readRoutinesWithGemini = async (
  document: ProgrammeDocument,
  apiKey: string,
): Promise<RoutineDraft[]> => {
  const parsed = await requestRoutines(
    {
      system: ROUTINE_IMPORT_PROMPT,
      parts: [
        { text: 'Extract the routines from this programme.' },
        { inlineData: { mimeType: document.mimeType, data: document.base64 } },
      ],
      timeoutMs: TIMEOUT_MS,
      unusable: UNREADABLE,
      slow: 'Reading the programme took too long. Try a shorter file, or a screenshot of one week.',
    },
    apiKey,
  );

  if (parsed.notProgram) {
    throw new Error('That file does not look like a training programme.');
  }

  const drafts = toRoutineDrafts(parsed);
  if (drafts.length === 0) throw new Error(UNREADABLE);
  return drafts;
};

/** Text only and a short answer, so this is quick next to reading a PDF. */
const BUILD_TIMEOUT_MS = 45_000;

const UNBUILDABLE = 'Could not build a routine just now. Try again.';

export const buildRoutinesWithGemini = async (
  focuses: RoutineFocus[],
  known: string[],
  apiKey: string,
  options: BuildOptions = DEFAULT_BUILD_OPTIONS,
): Promise<RoutineDraft[]> => {
  const parsed = await requestRoutines(
    {
      system: ROUTINE_BUILD_SYSTEM,
      parts: [{ text: buildRoutinePrompt(focuses, known, options) }],
      timeoutMs: BUILD_TIMEOUT_MS,
      unusable: UNBUILDABLE,
      slow: 'Building the routine took too long. Try again.',
    },
    apiKey,
  );

  // notProgram means nothing here; the routines are what was asked for.
  const drafts = toRoutineDrafts({ ...parsed, notProgram: false });
  if (drafts.length === 0) throw new Error(UNBUILDABLE);
  return drafts;
};
