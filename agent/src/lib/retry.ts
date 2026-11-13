export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }

  const record = err as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name : '';
  const message = typeof record.message === 'string' ? record.message : '';
  const status = record.status ?? record.code;

  if (
    status === 503 ||
    status === '503' ||
    status === 'UNAVAILABLE' ||
    status === 429 ||
    status === '429' ||
    status === 'RESOURCE_EXHAUSTED'
  ) {
    return true;
  }

  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    record.code === 'ETIMEDOUT'
  ) {
    return true;
  }

  const lowerMsg = message.toLowerCase();
  return (
    lowerMsg.includes('503') ||
    lowerMsg.includes('429') ||
    lowerMsg.includes('unavailable') ||
    lowerMsg.includes('resource_exhausted') ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('high demand') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('timed out') ||
    lowerMsg.includes('aborted')
  );
}

function getRetryDelayMs(
  err: unknown,
  attempt: number,
  baseDelayMs: number
): number {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';

  // Respect server-provided retry delay (e.g. "Please retry in 39.7s" or "retryDelay":"39s")
  const retryMatch =
    message.match(/retry in (\d+(?:\.\d+)?)s/i) ||
    message.match(/"retryDelay"\s*:\s*"(\d+)s"/i);

  if (retryMatch) {
    const seconds = Math.ceil(Number(retryMatch[1]));
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min((seconds + 2) * 1_000, 65_000);
    }
  }

  return baseDelayMs * 2 ** attempt;
}

/**
 * Retries a Gemini LLM call with exponential backoff on 503/429 or timeout errors.
 */
export async function withGeminiRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 2_000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryableGeminiError(err)) {
        const delayMs = getRetryDelayMs(err, attempt, baseDelayMs);
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(
          `${label} failed with retryable error (attempt ${attempt + 1}/${maxRetries + 1}): ${errMsg}. Retrying in ${delayMs}ms...`
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
