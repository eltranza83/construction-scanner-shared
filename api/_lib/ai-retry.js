/**
 * Helper to perform fetch requests with exponential backoff and jitter.
 * Replaces hardcoded multi-model trial failover loops with reliable retries on the configured model.
 */
export async function fetchWithExponentialBackoff(
  url,
  options = {},
  retryConfig = { maxRetries: 3, initialDelayMs: 500, backoffFactor: 2, jitter: true, retryableStatusCodes: [429, 500, 502, 503, 504] },
  fetchImpl = fetch
) {
  const { maxRetries = 3, initialDelayMs = 500, backoffFactor = 2, jitter = true, retryableStatusCodes = [429, 500, 502, 503, 504] } = retryConfig;
  const timeoutMs = options.timeoutMs || 25000;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const signal = options.signal || (typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined);
      const fetchOptions = signal ? { ...options, signal } : options;
      const response = await fetchImpl(url, fetchOptions);

      if (response.ok) {
        return response;
      }

      if (!retryableStatusCodes.includes(response.status) || attempt === maxRetries) {
        return response;
      }

      const errorText = await response.text().catch(() => '');
      lastError = `Status ${response.status}: ${errorText}`;
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`Upstream AI request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      lastError = err.message || String(err);
      if (attempt === maxRetries) {
        throw new Error(`Request failed after ${maxRetries} retries: ${lastError}`);
      }
    }

    let delay = initialDelayMs * Math.pow(backoffFactor, attempt);
    if (jitter) {
      delay += Math.random() * 200;
    }

    console.warn(`[AI Retry] Request failed (${lastError}). Retrying attempt ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(`Request failed after ${maxRetries} retries: ${lastError}`);
}
