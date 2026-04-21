// ============================================================
// app.js — Athena core: navigation, API key, loading, prompts
// ============================================================

// ─── System Prompts ──────────────────────────────────────────

const SYSTEM_KNOWLEDGE_MODE = `You are Athena, an AI designed for mastery learning — not passive tutoring.
Your role is to test, probe, and diagnose — never to explain unprompted.
Generate questions that require genuine understanding, not surface recall.
Be honest in evaluation. Don't inflate scores or offer false encouragement.
Every response must be valid JSON with no markdown fences or preamble.`;

const SYSTEM_EVALUATOR = `You are Athena's evaluation engine.
Be precise, direct, and honest. Identify exactly what is missing and why it matters.
Don't soften criticism. Acknowledge what is genuinely good.
Every response must be valid JSON with no markdown fences or preamble.`;

const SYSTEM_LANG_MODE = `You are Athena, a language learning AI grounded in Swain's Output Hypothesis and modern neurolinguistic research.
Your purpose is to make learners PRODUCE language, not just recognise it.
Never give grammar drills, fill-in-the-blanks, or multiple choice vocabulary tests.
Every task should push the learner to articulate real thoughts in the target language.
Evaluate on whether they can COMMUNICATE — precisely, coherently, comprehensibly.
Be honest. Calibrate to their level. Don't inflate. Don't be discouraging.
Every response must be valid JSON with no markdown fences or preamble.`;

const SYSTEM_CODING_MODE = `You are Athena, a coding education AI.
You understand full programming curricula and can identify exactly what a student has and hasn't learned.
You assign real, application-level projects — not exercises or syntax drills.
You evaluate code like a senior engineer reviewing a junior's PR: specific, honest, constructive.
Every response must be valid JSON with no markdown fences or preamble.`;

// ─── Navigation ───────────────────────────────────────────────

let pendingMode = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function enterMode(mode) {
  pendingMode = mode;
  const key = sessionStorage.getItem('athena_api_key');
  if (!key) {
    showScreen('screen-apikey');
  } else {
    launchMode(mode);
  }
}

function launchMode(mode) {
  if (mode === 'pdf') {
    showScreen('screen-pdf');
    document.querySelectorAll('.pdf-step').forEach(s => s.classList.remove('active'));
    document.getElementById('pdf-step-upload').classList.add('active');
    document.getElementById('pdf-score-display').style.display = 'none';
  } else if (mode === 'lang') {
    showScreen('screen-lang');
    document.querySelectorAll('.lang-step').forEach(s => s.classList.remove('active'));
    document.getElementById('lang-step-setup').classList.add('active');
    document.getElementById('lang-score-display').style.display = 'none';
  } else if (mode === 'coding') {
    showScreen('screen-coding');
    document.querySelectorAll('.coding-step').forEach(s => s.classList.remove('active'));
    document.getElementById('coding-step-topic').classList.add('active');
    document.getElementById('topic-input').value = '';
    document.getElementById('checklist-btn-text').textContent = 'Map the Curriculum';
  }
}

function goHome() {
  showScreen('screen-home');
}

// ─── API Key ──────────────────────────────────────────────────

function saveApiKey() {
  const key = document.getElementById('apikey-input').value.trim();
  if (!key || key.length < 10) {
    showError('Please enter a valid API key.');
    return;
  }
  sessionStorage.setItem('athena_api_key', key);
  if (pendingMode) launchMode(pendingMode);
}

function toggleKeyVisibility() {
  const input = document.getElementById('apikey-input');
  const btn = document.querySelector('.reveal-btn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'hide';
  } else {
    input.type = 'password';
    btn.textContent = 'show';
  }
}

// ─── Loading Overlay ──────────────────────────────────────────

let loadingEl = null;

function showLoading(message = 'Thinking...') {
  if (loadingEl) return;
  loadingEl = document.createElement('div');
  loadingEl.className = 'loading-overlay';
  loadingEl.innerHTML = `
    <img src="assets/owl-logo.png" class="loading-owl-img" alt="Athena" />
    <div class="loading-text">${message}</div>
    <div class="loading-dots">
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
    </div>
  `;
  document.body.appendChild(loadingEl);
}

function hideLoading() {
  if (loadingEl) {
    loadingEl.remove();
    loadingEl = null;
  }
}

// ─── Error toast ──────────────────────────────────────────────

function showError(message) {
  hideLoading();
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    background: var(--danger); color: white; padding: 0.8rem 1.5rem;
    border-radius: 8px; font-size: 0.9rem; z-index: 9999;
    font-family: var(--font-body); box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    max-width: 90vw; text-align: center;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─── Constellation animation ──────────────────────────────────

function initConstellation() {
  const container = document.getElementById('constellation');
  if (!container) return;

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let W, H, stars, frame;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    initStars();
  }

  function initStars() {
    const count = Math.floor((W * H) / 14000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + 0.2,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      opacity: Math.random() * 0.5 + 0.1,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x;
        const dy = stars[i].y - stars[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(201,168,76,${0.04 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(stars[i].x, stars[i].y);
          ctx.lineTo(stars[j].x, stars[j].y);
          ctx.stroke();
        }
      }
    }

    stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(232,228,220,${s.opacity})`;
      ctx.fill();

      s.x += s.vx;
      s.y += s.vy;
      if (s.x < 0) s.x = W;
      if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H;
      if (s.y > H) s.y = 0;
    });

    frame = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();

  const observer = new MutationObserver(() => {
    const home = document.getElementById('screen-home');
    if (home && home.classList.contains('active')) {
      if (!frame) draw();
    } else {
      if (frame) { cancelAnimationFrame(frame); frame = null; }
    }
  });

  document.querySelectorAll('.screen').forEach(s => {
    observer.observe(s, { attributes: true, attributeFilter: ['class'] });
  });
}

// ─── DOM ready ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('apikey-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveApiKey();
  });
  document.getElementById('topic-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') generateChecklist();
  });
  initConstellation();
});

// ─── Tab key in code editor ───────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.target.classList.contains('code-editor') && e.key === 'Tab') {
    e.preventDefault();
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    e.target.value = e.target.value.substring(0, start) + '  ' + e.target.value.substring(end);
    e.target.selectionStart = e.target.selectionEnd = start + 2;
    updatePreview();
  }
});
