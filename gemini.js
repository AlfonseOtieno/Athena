// ============================================================
// gemini.js — Athena's AI interface
// Model: gemini-2.0-flash (with fallback to gemini-1.5-flash)
// ============================================================

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest'
];

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
    if (res.status === 404 && modelIndex < GEMINI_MODELS.length - 1) {
      return callGemini(prompt, systemInstruction, modelIndex + 1);
    }
    throw new Error(err?.error?.message || `Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

// Parse JSON safely from Gemini's response (strips markdown fences)
function parseGeminiJSON(text) {
  const clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(clean);
}
