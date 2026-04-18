// ============================================================
// gemini.js — Athena's AI interface
// Primary: gemini-1.5-flash (generous free tier)
// Fallback: gemini-1.5-flash-8b (lightest, highest quota)
// ============================================================

const GEMINI_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

// HTTP status codes that warrant trying the next model
const RETRY_ON = new Set([404, 429, 503]);

async function callGemini(prompt, systemInstruction = '', modelIndex = 0) {
  const apiKey = sessionStorage.getItem('athena_api_key');
  if (!apiKey) throw new Error('No API key set');

  const model = GEMINI_MODELS[modelIndex] || GEMINI_MODELS[0];
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
    const canRetry = RETRY_ON.has(res.status) && modelIndex < GEMINI_MODELS.length - 1;

    if (canRetry) {
      console.warn(`Model ${model} returned ${res.status}, falling back to ${GEMINI_MODELS[modelIndex + 1]}...`);
      return callGemini(prompt, systemInstruction, modelIndex + 1);
    }

    if (res.status === 429) {
      throw new Error('API quota exceeded. Your free tier limit has been reached — wait a few minutes and try again, or upgrade your Gemini API plan at aistudio.google.com.');
    }
    if (res.status === 400 || res.status === 403) {
      throw new Error('Invalid or unauthorized API key. Please re-enter your Gemini API key.');
    }

    throw new Error(err?.error?.message || `Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

// Parse JSON safely from Gemini response (strips markdown fences)
function parseGeminiJSON(text) {
  const clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(clean);
}
