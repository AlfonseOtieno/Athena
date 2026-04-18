// ============================================================
// lang-mode.js — Athena Language Mode
//
// Grounded in Swain's Output Hypothesis & interaction research:
// - Forced output: learners must produce, not just recognise
// - Comprehension → production pipeline per task
// - Feedback targets fluency gaps, not grammar rules in isolation
// - Adaptive: easier tasks if struggling, harder if performing well
// ============================================================

const LangMode = (() => {

  let state = {
    language: '',
    level: '',         // beginner | elementary | intermediate | advanced
    focus: [],         // ['comprehension', 'composition', 'expression']
    tasks: [],         // generated task objects
    currentTask: 0,
    responses: [],
    scores: [],        // per task 0-10
    passageVisible: true,
  };

  const LEVEL_DESCRIPTORS = {
    beginner:     'A1–A2: knows basic greetings, numbers, common nouns. Very limited sentence construction.',
    elementary:   'A2–B1: can form simple present/past sentences on familiar topics. Limited vocabulary range.',
    intermediate: 'B1–B2: can discuss everyday topics, express opinions, handle most situations. Some errors under complexity.',
    advanced:     'C1–C2: can discuss abstract/complex ideas with nuance. Near-fluent but may have edge gaps.',
  };

  // ─── Step control ─────────────────────────────────────────
  function showStep(step) {
    document.querySelectorAll('.lang-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`lang-step-${step}`).classList.add('active');
  }

  // ─── Level selection ──────────────────────────────────────
  function selectLevel(level) {
    state.level = level;
    document.querySelectorAll('.level-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.level === level);
    });
  }

  // ─── Session start ────────────────────────────────────────
  async function startSession() {
    const lang = document.getElementById('lang-input').value.trim();
    if (!lang) { showError('Please enter a language.'); return; }
    if (!state.level) { showError('Please select your level.'); return; }

    const focusMap = {
      comprehension: document.getElementById('focus-comprehension').checked,
      composition:   document.getElementById('focus-composition').checked,
      expression:    document.getElementById('focus-expression').checked,
    };

    state.focus = Object.keys(focusMap).filter(k => focusMap[k]);
    if (state.focus.length === 0) { showError('Please select at least one focus area.'); return; }

    state.language = lang;
    state.tasks = [];
    state.currentTask = 0;
    state.responses = [];
    state.scores = [];

    showLoading('Athena is preparing your session...');

    try {
      const tasks = await generateTasks();
      state.tasks = tasks;
      hideLoading();

      // Show score tracker
      document.getElementById('lang-score-display').style.display = 'flex';
      document.getElementById('lang-task-total').textContent = tasks.length;
      updateTaskCounter();

      showStep('task');
      renderTask();
    } catch (err) {
      hideLoading();
      showError('Could not generate session: ' + err.message);
    }
  }

  async function generateTasks() {
    const levelDesc = LEVEL_DESCRIPTORS[state.level];
    const focusTypes = state.focus;

    const prompt = `You are Athena, a language learning AI grounded in Swain's Output Hypothesis.
Generate a session of ${focusTypes.length * 1} language tasks for a learner of ${state.language}.

Learner level: ${state.level} (${levelDesc})
Task types to include: ${focusTypes.join(', ')}

Rules:
- "comprehension": Provide a short passage IN ${state.language} (4-8 sentences, level-appropriate), then ask 2 comprehension questions the learner must answer IN ${state.language}.
- "composition": Give a clear writing prompt the learner responds to IN ${state.language} (no passage needed). E.g. "Describe your morning routine", "Write about a challenge you overcame", "Argue for or against owning a pet".
- "expression": Ask the learner to write freely on an open topic IN ${state.language} for at least 60 words. Pick compelling, real-world topics — not textbook prompts.

For beginner/elementary: use simple sentence structures, familiar vocabulary, short tasks.
For intermediate/advanced: use nuanced topics, longer passages, and push for precise expression.

DO NOT include grammar exercises, fill-in-the-blanks, or translation tasks.
All writing responses must be IN ${state.language}, not the learner's native language.

Respond ONLY with a valid JSON array (no fences, no preamble):
[
  {
    "type": "comprehension",
    "passage": "...(passage in ${state.language})...",
    "prompt": "...(2 comprehension questions, written in English so the learner understands the task)...",
    "minWords": 30,
    "difficulty": "${state.level}"
  },
  {
    "type": "composition",
    "passage": null,
    "prompt": "...(composition prompt in English)...",
    "minWords": 60,
    "difficulty": "${state.level}"
  },
  {
    "type": "expression",
    "passage": null,
    "prompt": "...(free expression prompt in English)...",
    "minWords": 80,
    "difficulty": "${state.level}"
  }
]

Include exactly the task types in this order: ${focusTypes.join(', ')}.`;

    const raw = await callGemini(prompt, SYSTEM_LANG_MODE);
    return parseGeminiJSON(raw);
  }

  // ─── Task rendering ───────────────────────────────────────
  function renderTask() {
    const task = state.tasks[state.currentTask];
    if (!task) { showReport(); return; }

    // Type badge
    const typeBadge = document.getElementById('lang-task-type-badge');
    const typeLabels = {
      comprehension: 'Reading Comprehension',
      composition:   'Written Composition',
      expression:    'Free Expression',
    };
    typeBadge.textContent = typeLabels[task.type] || task.type;
    typeBadge.className = `lang-task-type lang-type-${task.type}`;

    // Meta
    document.getElementById('lang-task-meta').textContent =
      `${state.language} · ${task.difficulty}`;

    // Passage block
    const passageBlock = document.getElementById('lang-passage-block');
    if (task.passage) {
      passageBlock.style.display = 'block';
      document.getElementById('lang-passage-text').textContent = task.passage;
      state.passageVisible = true;
      document.getElementById('lang-hide-btn').textContent = 'Hide Passage';
    } else {
      passageBlock.style.display = 'none';
    }

    // Prompt
    document.getElementById('lang-prompt-text').textContent = task.prompt;

    // Response area
    document.getElementById('lang-response').value = '';
    document.getElementById('lang-wc').textContent = '0';
    document.getElementById('lang-response-lang').textContent = state.language;

    // Min word hint
    document.getElementById('lang-response').placeholder =
      `Write your response in ${state.language}... (at least ${task.minWords} words)`;

    updateTaskCounter();
  }

  function togglePassage() {
    const text = document.getElementById('lang-passage-text');
    const btn = document.getElementById('lang-hide-btn');
    state.passageVisible = !state.passageVisible;
    text.style.display = state.passageVisible ? 'block' : 'none';
    btn.textContent = state.passageVisible ? 'Hide Passage' : 'Show Passage';
  }

  // Live word count
  document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('lang-response');
    if (textarea) {
      textarea.addEventListener('input', () => {
        const words = textarea.value.trim().split(/\s+/).filter(w => w.length > 0).length;
        document.getElementById('lang-wc').textContent = words;
      });
    }
  });

  // ─── Response submission ───────────────────────────────────
  async function submitResponse() {
    const task = state.tasks[state.currentTask];
    const response = document.getElementById('lang-response').value.trim();

    if (!response) { showError('Please write your response first.'); return; }

    const wordCount = response.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < Math.floor(task.minWords * 0.5)) {
      showError(`Your response is too short. Try to write at least ${task.minWords} words.`);
      return;
    }

    state.responses[state.currentTask] = response;
    showLoading('Evaluating your response...');

    try {
      const feedback = await evaluateResponse(task, response);
      hideLoading();
      state.scores[state.currentTask] = feedback.score;
      renderFeedback(feedback);
      adaptDifficulty(feedback.score);
      showStep('feedback');
    } catch (err) {
      hideLoading();
      showError('Evaluation error: ' + err.message);
    }
  }

  async function evaluateResponse(task, response) {
    const prompt = `You are Athena evaluating a ${state.language} language learner's written response.

Learner level: ${state.level} (${LEVEL_DESCRIPTORS[state.level]})
Task type: ${task.type}
Task prompt: ${task.prompt}
${task.passage ? `Original passage:\n${task.passage}\n` : ''}
Learner's response:
---
${response}
---

Evaluate based on Swain's Output Hypothesis criteria:
1. Comprehensibility: Can the message be understood? Is it coherent?
2. Precision: Does the learner express ideas accurately in ${state.language}?
3. Fluency indicators: Are there natural constructions, or is it heavily translated from English?
4. Task completion: Did they actually answer what was asked?
5. Vocabulary range: Is vocabulary appropriate and varied for their level?

DO NOT focus on grammar rules in isolation. Focus on whether they can COMMUNICATE precisely.
Be honest. Don't inflate scores. But calibrate to their stated level — a beginner using basic sentences well deserves credit.

Respond ONLY with valid JSON (no fences):
{
  "score": 7.5,
  "comprehensibility": 8,
  "precision": 7,
  "fluency": 7,
  "taskCompletion": 8,
  "what_worked": "Specific things the learner expressed well, with examples from their text",
  "gaps": "Specific gaps — phrases they struggled with, unnatural constructions, ideas they couldn't express",
  "better_phrasing": "2-3 example sentences from their response rewritten more naturally in ${state.language}",
  "next_focus": "One concrete thing to practise next — specific, not generic"
}`;

    const raw = await callGemini(prompt, SYSTEM_EVALUATOR);
    return parseGeminiJSON(raw);
  }

  // ─── Feedback rendering ───────────────────────────────────
  function renderFeedback(fb) {
    // Score grid
    const scoresEl = document.getElementById('lang-feedback-scores');
    const dims = [
      { key: 'comprehensibility', label: 'Comprehensibility' },
      { key: 'precision',         label: 'Precision' },
      { key: 'fluency',           label: 'Fluency' },
      { key: 'taskCompletion',    label: 'Task Completion' },
    ];

    scoresEl.innerHTML = `
      <div class="lang-overall-score">
        <span class="lang-score-num">${fb.score}</span>
        <span class="lang-score-denom">/10</span>
      </div>
      <div class="lang-score-dims">
        ${dims.map(d => `
          <div class="lang-score-dim">
            <div class="lang-dim-label">${d.label}</div>
            <div class="lang-dim-bar">
              <div class="lang-dim-fill" style="width:${(fb[d.key] || 0) * 10}%"></div>
            </div>
            <div class="lang-dim-val">${fb[d.key] || '—'}</div>
          </div>
        `).join('')}
      </div>
    `;

    // Feedback sections
    const sectionsEl = document.getElementById('lang-feedback-sections');
    sectionsEl.innerHTML = `
      <div class="lang-fb-section lang-fb-good">
        <h4>✓ What worked</h4>
        <p>${fb.what_worked || '—'}</p>
      </div>
      <div class="lang-fb-section lang-fb-gaps">
        <h4>◎ Gaps</h4>
        <p>${fb.gaps || '—'}</p>
      </div>
      <div class="lang-fb-section lang-fb-better">
        <h4>→ More natural phrasing</h4>
        <p class="lang-better-text">${fb.better_phrasing || '—'}</p>
      </div>
      <div class="lang-fb-section lang-fb-next">
        <h4>⬡ Practise next</h4>
        <p>${fb.next_focus || '—'}</p>
      </div>
    `;

    // Next button text
    const isLast = state.currentTask >= state.tasks.length - 1;
    document.getElementById('lang-next-btn-text').textContent = isLast ? 'See Report' : 'Next Task →';
  }

  // ─── Adaptive difficulty ──────────────────────────────────
  function adaptDifficulty(score) {
    // If remaining tasks exist, nudge their difficulty
    const recentScores = state.scores.filter(s => s !== undefined);
    const avg = recentScores.reduce((a, b) => a + b, 0) / (recentScores.length || 1);

    const levels = ['beginner', 'elementary', 'intermediate', 'advanced'];
    const currentIdx = levels.indexOf(state.level);

    let targetLevel = state.level;
    if (avg >= 8.5 && currentIdx < levels.length - 1) targetLevel = levels[currentIdx + 1];
    else if (avg <= 4 && currentIdx > 0) targetLevel = levels[currentIdx - 1];

    // Apply to remaining tasks
    for (let i = state.currentTask + 1; i < state.tasks.length; i++) {
      state.tasks[i].difficulty = targetLevel;
    }
  }

  // ─── Task navigation ──────────────────────────────────────
  function nextTask() {
    state.currentTask++;
    if (state.currentTask >= state.tasks.length) {
      showReport();
    } else {
      showStep('task');
      renderTask();
    }
  }

  function updateTaskCounter() {
    document.getElementById('lang-task-num').textContent = state.currentTask + 1;
    document.getElementById('lang-task-total').textContent = state.tasks.length;
  }

  // ─── Session report ───────────────────────────────────────
  async function showReport() {
    const total = state.scores.length;
    const avg = total > 0
      ? state.scores.reduce((a, b) => a + b, 0) / total
      : 0;
    const grade = avg.toFixed(1);

    document.getElementById('lang-final-score').textContent = grade;
    const circumference = 314;
    const offset = circumference - ((avg / 10) * circumference);
    setTimeout(() => {
      document.getElementById('lang-ring-fill').style.strokeDashoffset = offset;
    }, 100);

    showLoading('Building your report...');
    try {
      const report = await generateReport();
      hideLoading();
      document.getElementById('lang-report-strong').innerHTML =
        report.canDo.map(i => `<li>${i}</li>`).join('');
      document.getElementById('lang-report-weak').innerHTML =
        report.gaps.map(i => `<li>${i}</li>`).join('');
      document.getElementById('lang-report-practise').innerHTML =
        report.practise.map(i => `<li>${i}</li>`).join('');
    } catch (e) {
      hideLoading();
      document.getElementById('lang-report-strong').innerHTML = '<li>Session complete</li>';
      document.getElementById('lang-report-weak').innerHTML = '<li>Review your responses above</li>';
      document.getElementById('lang-report-practise').innerHTML = '<li>Keep writing daily in ' + state.language + '</li>';
    }

    showStep('report');
  }

  async function generateReport() {
    const summary = state.tasks.map((t, i) => ({
      type: t.type,
      score: state.scores[i] || 0,
      response: (state.responses[i] || '').slice(0, 200),
    }));

    const prompt = `Based on this ${state.language} learner's session (level: ${state.level}), write a diagnostic report.

Session data:
${JSON.stringify(summary, null, 2)}

Respond ONLY with JSON (no fences):
{
  "canDo": ["3-4 specific things they demonstrated they can do in ${state.language}"],
  "gaps": ["3-4 specific gaps or patterns of error observed"],
  "practise": ["3-4 concrete exercises or activities to improve — be specific, not generic"]
}`;

    const raw = await callGemini(prompt, SYSTEM_EVALUATOR);
    return parseGeminiJSON(raw);
  }

  function restartSession() {
    state = {
      language: '',
      level: '',
      focus: [],
      tasks: [],
      currentTask: 0,
      responses: [],
      scores: [],
      passageVisible: true,
    };
    document.getElementById('lang-input').value = '';
    document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('focus-comprehension').checked = true;
    document.getElementById('focus-composition').checked = true;
    document.getElementById('focus-expression').checked = true;
    document.getElementById('lang-score-display').style.display = 'none';
    showStep('setup');
  }

  return {
    selectLevel,
    startSession,
    togglePassage,
    submitResponse,
    nextTask,
    restartSession,
  };

})();

// Global bindings
function selectLevel(l) { LangMode.selectLevel(l); }
function startLangSession() { LangMode.startSession(); }
function togglePassage() { LangMode.togglePassage(); }
function submitLangResponse() { LangMode.submitResponse(); }
function nextLangTask() { LangMode.nextTask(); }
function restartLangSession() { LangMode.restartSession(); }
