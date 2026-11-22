// Small shared client for the free AI providers, plus the maths needed to
// show an estimate before anything is sent. No key means no network call.

export const PROVIDER_LABELS = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' };

export const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free'
};

// Rough character cost per request. Gemini and the OpenAI-compatible hosts all
// bill/limit by tokens, and ~4 characters per token is close enough for a warning.
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text) {
  return Math.ceil(String(text || '').length / CHARS_PER_TOKEN);
}

// Describes the request before it is made: bookmarks, characters, rough tokens.
export function estimateRequest(bookmarks, { perBookmarkChars = 220, promptChars = 600 } = {}) {
  let chars = promptChars;
  for (const bm of bookmarks) {
    chars += Math.min(String(bm.title || '').length, 70);
    chars += Math.min(String(bm.content?.text || bm.indexText || '').length, perBookmarkChars);
    chars += 40;
  }
  return {
    count: bookmarks.length,
    chars,
    tokens: estimateTokens('x'.repeat(chars))
  };
}

export function hasKey(settings) {
  return Boolean(settings && settings.apiKey && settings.apiKey.trim());
}

// One place that talks to Gemini, Groq, and OpenRouter. Returns plain text.
export async function requestModel({ settings, system, user, json = false, maxOutputTokens = 700 }) {
  const { provider, apiKey, model } = settings || {};
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Add a free API key in Settings, or use the local option.');
  }
  const chosen = (model && model.trim()) || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;

  if (provider === 'gemini') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosen)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens,
          ...(json ? { responseMimeType: 'application/json' } : {})
        }
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini API error (${res.status}): ${detail.slice(0, 120) || 'Check your API key.'}`);
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  }

  const isGroq = provider === 'groq';
  const endpoint = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` };
  if (!isGroq) {
    headers['HTTP-Referer'] = 'https://bookbox.local';
    headers['X-Title'] = 'BookBox';
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: chosen,
      temperature: 0.2,
      max_tokens: maxOutputTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${PROVIDER_LABELS[provider] || 'AI'} API error (${res.status}): ${detail.slice(0, 120) || 'Check your API key.'}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/* ---------- Embeddings (semantic search) ---------- */

// Embedding models per provider. Only Gemini has one configured, because Groq
// does not host an embeddings endpoint and OpenRouter's support is inconsistent.
// Claiming a model that 404s would leave "Meaning search" looking broken, so the
// other providers simply report that they cannot do it.
export const EMBEDDING_MODELS = {
  gemini: 'text-embedding-004'
};

// Groq and OpenRouter are omitted deliberately: if a provider has no embedding
// model here, the Meaning search toggle hides instead of offering a feature
// that would fail on the first request.
export function supportsEmbeddings(provider) {
  return Boolean(EMBEDDING_MODELS[provider]);
}

// Returns one vector per input string, in the same order. Batched because
// embedding APIs take many inputs per request.
export async function requestEmbeddings({ settings, texts }) {
  const { provider, apiKey } = settings || {};
  if (!apiKey || !apiKey.trim()) throw new Error('Add a free API key in Settings to use semantic search.');
  if (!supportsEmbeddings(provider)) {
    throw new Error(`${PROVIDER_LABELS[provider] || 'This provider'} has no embedding model configured.`);
  }
  const model = EMBEDDING_MODELS[provider];

  if (provider === 'gemini') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents?key=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text: String(text).slice(0, 8000) }] }
        }))
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini embeddings error (${res.status}): ${detail.slice(0, 120) || 'Check your API key.'}`);
    }
    const data = await res.json();
    return (data?.embeddings || []).map((row) => row.values || []);
  }

  // Groq and OpenRouter both expose OpenAI-compatible embeddings.
  const endpoint = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/embeddings'
    : 'https://openrouter.ai/api/v1/embeddings';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` };
  if (provider !== 'groq') {
    headers['HTTP-Referer'] = 'https://bookbox.local';
    headers['X-Title'] = 'BookBox';
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, input: texts.map((t) => String(t).slice(0, 8000)) })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${PROVIDER_LABELS[provider] || 'AI'} embeddings error (${res.status}): ${detail.slice(0, 120) || 'Check your API key.'}`);
  }
  const data = await res.json();
  return (data?.data || []).map((row) => row.embedding || []);
}

// Asks for JSON and returns a parsed object, tolerating fences and prose.
export async function requestJson({ settings, system, user, maxOutputTokens = 700 }) {
  const raw = await requestModel({ settings, system, user, json: true, maxOutputTokens });
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The model did not return JSON. Try again.');
  return JSON.parse(candidate.slice(start, end + 1));
}

/* ---------- Local fallbacks (no key, no network) ---------- */

// Extractive summary: the first sentences, trimmed to a readable length.
export function localSummary(bookmark) {
  const text = String(bookmark.content?.text || bookmark.indexText || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).length > 240) break;
    out += sentence;
  }
  return (out || text.slice(0, 240)).trim();
}

// Keyword answer over the local library: scores each bookmark and quotes the
// best line that contains the query words.
export function localAnswer(question, bookmarks) {
  const words = String(question || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (words.length === 0 || bookmarks.length === 0) return { answer: '', hits: [] };

  const scored = bookmarks
    .map((bm) => {
      const hay = `${bm.title} ${bm.url} ${bm.content?.text || bm.indexText || ''} ${(bm.tags || []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const word of words) if (hay.includes(word)) score += 1;
      return { bm, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const hits = scored.map((row) => row.bm);
  if (hits.length === 0) {
    return { answer: 'Nothing in your library mentions that yet.', hits: [] };
  }
  const top = hits[0];
  const context = String(top.content?.text || top.indexText || '');
  const sentence = context
    .split(/(?<=[.!?])\s+/)
    .find((s) => words.some((w) => s.toLowerCase().includes(w)));
  return {
    answer: `Closest match is “${top.title}”.${sentence ? ` ${sentence.trim()}` : ''}`,
    hits
  };
}
