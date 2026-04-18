// ============================================================
// gemini.js — Athena's AI interface
// Model order confirmed from working projects (Apela, CodeReview)
// ============================================================

const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

async function callGemini(prompt, systemInstruction = '', modelIndex = 0) {
  const apiKey = sessionStorage.getItem('athena_api_key');
  if (!apiKey) throw new Error('No API key set');

  const model = GEMINI_MODELS[modelIndex];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }], role: 'user' }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    }
  };

  if (systemInstruction) {
    body.system_instruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;

    // Retry on quota or model-not-found — try next model in chain
    if ((status === 429 || status === 404 || status === 503) && modelIndex < GEMINI_MODELS.length - 1) {
      console.warn(`Model ${model} returned ${status}, trying ${GEMINI_MODELS[modelIndex + 1]}...`);
      return callGemini(prompt, systemInstruction, modelIndex + 1);
    }

    // All models exhausted or unrecoverable error — show clean message
    if (status === 429) throw new Error('Rate limit reached. Wait 1–2 minutes and try again. (Free tier: 15 requests/min)');
    if (status === 400 || status === 403) throw new Error('Invalid API key. Re-enter your key from aistudio.google.com.');
    if (status === 404) throw new Error('No available model found for your API key. Make sure your key is from aistudio.google.com.');

    const raw = err?.error?.message || '';
    throw new Error(raw.length > 120 ? raw.slice(0, 120) + '...' : raw || `API error ${status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

// Parse JSON safely — strips markdown fences if Gemini wraps response
function parseGeminiJSON(text) {
  const clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(clean);
}
