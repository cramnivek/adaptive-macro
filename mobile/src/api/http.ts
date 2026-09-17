/** Identifies the app to food databases; Open Food Facts requires one. */
export const USER_AGENT = 'adaptive-macros/0.1 (https://github.com/cramnivek/adaptive-macros)';

export class FoodApiError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FoodApiError';
  }
}

/**
 * Fetch with a hard timeout.
 *
 * A phone on flaky signal will hold a request open indefinitely rather than
 * failing, which in a search box reads as the app being broken. Ten seconds
 * then a clear error beats an eternal spinner.
 */
export const fetchJson = async <T,>(
  url: string,
  source: string,
  timeoutMs = 10_000,
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new FoodApiError(
        `${source} returned ${response.status}`,
        source,
        response.status,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof FoodApiError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new FoodApiError(`${source} timed out`, source);
    }
    throw new FoodApiError(`Could not reach ${source}`, source);
  } finally {
    clearTimeout(timer);
  }
};

/** kJ to kcal, for entries that carry only the metric energy field. */
export const kjToKcal = (kj: number): number => kj / 4.184;

export const isUsableNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
