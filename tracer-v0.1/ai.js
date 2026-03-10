/**
 * TRACER v0.1 - Anthropic API with retries (TRD §7.1)
 * 3 retries with exponential backoff (1s, 4s, 16s) on 429, 5xx, timeout.
 */

const RETRY_DELAYS_MS = [1000, 4000, 16000];
const REQUEST_TIMEOUT_MS = 60000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Anthropic messages API with retries. Returns parsed response body.
 * Throws on final failure with error.code === 'AI_PROVIDER_FAILURE'.
 */
async function callAnthropicWithRetry(body, apiKey) {
  const url = 'https://api.anthropic.com/v1/messages';
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const isRetryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`Anthropic API ${res.status}: ${text}`);
        err.status = res.status;
        if (isRetryable && attempt < RETRY_DELAYS_MS.length) {
          lastError = err;
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        err.code = 'AI_PROVIDER_FAILURE';
        throw err;
      }
      return JSON.parse(text);
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      const isRetryable = isTimeout || (err.status === 429) || (err.status >= 500 && err.status < 600);
      if (isRetryable && attempt < RETRY_DELAYS_MS.length) {
        lastError = err;
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      const out = new Error(err.message || 'AI provider request failed');
      out.code = 'AI_PROVIDER_FAILURE';
      out.cause = err;
      throw out;
    }
  }
  if (lastError) {
    const out = new Error(lastError.message || 'AI provider request failed');
    out.code = 'AI_PROVIDER_FAILURE';
    out.cause = lastError;
    throw out;
  }
}

module.exports = { callAnthropicWithRetry };
