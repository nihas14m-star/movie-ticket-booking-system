import env, { aiConfigured } from '../../config/env.js';
import { AiUnavailableError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

/**
 * OpenRouter client.
 *
 * The ONLY module in the project that knows how to talk to an LLM provider, and
 * the only place the API key is read. Everything above it works with plain
 * `chat()` calls, so swapping providers or models never touches booking logic.
 *
 * Flow:  Frontend -> our API -> OpenRouter -> selected model
 * The key never leaves this process (see docs/ARCHITECTURE.md#security).
 */

/** Is an API key present? Without one the app degrades to local fallbacks. */
export const isConfigured = () => aiConfigured();

/** Short description of the current AI configuration (safe for the UI). */
export function getAiStatus() {
  return {
    configured: isConfigured(),
    model: env.ai.model,
    baseUrl: env.ai.baseUrl,
    timeoutMs: env.ai.timeoutMs,
  };
}

/**
 * Single entry point for a chat completion.
 *
 * @param {object} options
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} options.messages
 * @param {string} [options.model]
 * @param {boolean} [options.jsonMode] ask the provider for strict JSON
 * @throws {AiUnavailableError} for every failure mode (no key, timeout, HTTP error)
 */
export async function chat({
  messages,
  model = env.ai.model,
  temperature = env.ai.temperature,
  maxTokens = env.ai.maxTokens,
  jsonMode = false,
}) {
  if (!isConfigured()) {
    throw new AiUnavailableError('OPENROUTER_API_KEY is not configured', 'not_configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs);

  try {
    const response = await fetch(`${env.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.ai.apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter attribution headers (optional but recommended).
        'HTTP-Referer': env.ai.referer,
        'X-Title': env.ai.title,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const reason = response.status === 429 ? 'rate_limited'
        : response.status === 401 || response.status === 403 ? 'unauthorized'
          : `http_${response.status}`;
      logger.warn(`OpenRouter responded ${response.status}`, body.slice(0, 200), 'ai');
      throw new AiUnavailableError(`OpenRouter returned HTTP ${response.status}`, reason);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content || !String(content).trim()) {
      throw new AiUnavailableError('OpenRouter returned an empty completion', 'empty_response');
    }

    return {
      content: String(content),
      model: payload.model ?? model,
      usage: payload.usage ?? null,
    };
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    if (error.name === 'AbortError') {
      throw new AiUnavailableError(`OpenRouter request timed out after ${env.ai.timeoutMs}ms`, 'timeout');
    }
    throw new AiUnavailableError(`OpenRouter request failed: ${error.message}`, 'network_error');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull a JSON object out of a model reply.
 *
 * Models wrap JSON in prose or markdown fences often enough that parsing must be
 * forgiving: try a direct parse, then the first fenced block, then the first
 * balanced {...} region.
 */
export function extractJson(content) {
  const text = String(content ?? '').trim();
  if (!text) throw new AiUnavailableError('Empty AI response', 'unparseable');

  const candidates = [text];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) candidates.push(fenced[1].trim());
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // try the next candidate
    }
  }
  throw new AiUnavailableError('AI response was not valid JSON', 'unparseable');
}

export default { chat, isConfigured, getAiStatus, extractJson };
