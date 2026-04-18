// ============================================================
// gemini.js — Athena's AI interface
// Loop pattern mirrored from Apela (confirmed working)
// ============================================================

const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

async function callGemini(prompt, systemInstruction = '') {
  const apiKey = sessionStorage.getItem('athena_api_key');
  if (!apiKey) throw new Error('No API key set. Please enter your Gemini API key.');

  let lastError = '';

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      };

      if (systemInstruction) {
        body.system_instruction = { parts: [{ text: systemInstruction }] };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Rate limit — try next model
      if (res.status === 429) {
        lastError = `Rate limit on ${model}`;
        continue;
      }

      // Any other non-OK — log and try next
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        lastError = err?.error?.message || `HTTP ${res.status} on ${model}`;
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        lastError = `Empty response from ${model}`;
        continue;
      }

      return text.trim();

    } catch (err) {
      lastError = err.message || 'Network error';
      continue;
    }
  }

  // All models failed — surface a clean message
  if (lastError.includes('API_KEY_INVALID') || lastError.includes('400')) {
    throw new Error('Invalid API key. Re-enter your key from aistudio.google.com.');
  }
  throw new Error(`All models failed. Last error: ${lastError}`);
}

// Parse JSON safely — strips markdown fences Gemini sometimes adds
function parseGeminiJSON(text) {
  const clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(clean);
}
