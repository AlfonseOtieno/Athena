// ============================================================
// gemini.js — Athena's AI interface
// Model: gemini-1.5-flash
// No fallback chain — clean error handling for quota limits
// ============================================================

const GEMINI_MODEL = 'gemini-1.5-flash';

async function callGemini(prompt, systemInstruction = '') {
  const apiKey = sessionStorage.getItem('athena_api_key');
  if (!apiKey) throw new Error('No API key set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

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

    if (status === 429) {
      throw new Error('Rate limit reached. Wait 1–2 minutes then try again. Free tier allows 15 requests/minute.');
    }
    if (status === 400) {
      throw new Error('Bad request — your API key may be invalid. Re-enter it from aistudio.google.com.');
    }
    if (status === 403) {
      throw new Error('API key unauthorized. Make sure the Gemini API is enabled in your Google AI Studio project.');
    }
    if (status === 404) {
      throw new Error('Model not available for your API key. Make sure you are using a key from aistudio.google.com (not Google Cloud).');
    }

    // Fallback: show the raw message but trim it
    const raw = err?.error?.message || '';
    const short = raw.length > 120 ? raw.slice(0, 120) + '...' : raw;
    throw new Error(short || `API error ${status}`);
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
