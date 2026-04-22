// ============================================================
// lang-mode.js — Athena Language Mode
//
// Built on Swain's Output Hypothesis: learners must PRODUCE.
// Three written task types + one spoken task type (Speaking Mode).
// Speaking uses Web Speech API (Chrome/Edge) → transcript → Gemini eval.
// ============================================================

const LangMode = (() => {

  let state = {
    language: '',
    level: '',
    focus: [],
    tasks: [],
    currentTask: 0,
    responses: [],
    scores: [],
    passageVisible: true,
    // Speech
    recognition: null,
    isRecording: false,
    transcript: '',
    interimTranscript: '',
    speechSupported: false,
  };

  const LEVEL_DESCRIPTORS = {
    beginner:     'A1–A2: knows basic greetings, numbers, common nouns. Very limited sentence construction.',
    elementary:   'A2–B1: can form simple present/past sentences on familiar topics. Limited vocabulary range.',
    intermediate: 'B1–B2: can discuss everyday topics, express opinions, handle most situations. Some errors under pressure.',
    advanced:     'C1–C2: can discuss abstract/complex ideas with nuance. Near-fluent with possible edge gaps.',
  };

  // ─── Init speech API ──────────────────────────────────────
  function initSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      state.speechSupported = true;
      // Create fresh recognition instance each recording session
      // to avoid resultIndex confusion across restarts
      state.SR = SR;
    }
  }

  function createRecognition() {
    const rec = new state.SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = state.recognitionLang || 'en-US';

    rec.onresult = (event) => {
      // Only process results from resultIndex onwards to avoid re-processing
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          // Append finalized text only once
          state.transcript += event.results[i][0].transcript + ' ';
          state.interimTranscript = '';
        } else {
          // Replace interim (not append — only latest interim matters)
          state.interimTranscript = event.results[i][0].transcript;
        }
      }
      updateTranscriptDisplay();
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed') {
        showError('Microphone access denied. Please allow microphone access and try again.');
        stopRecording();
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('Speech recognition error:', e.error);
      }
    };

    rec.onend = () => {
      // Do NOT auto-restart — prevents resultIndex confusion
      // If user is still recording, they can press stop and start again
      if (state.isRecording) {
        state.isRecording = false;
        const btn = document.getElementById('record-btn');
        if (btn) {
          btn.textContent = '🎙 Start Speaking';
          btn.classList.remove('recording');
        }
        const indicator = document.getElementById('recording-indicator');
        if (indicator) indicator.style.display = 'none';
      }
    };

    return rec;
  }

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
      speaking:      document.getElementById('focus-speaking').checked,
    };

    state.focus = Object.keys(focusMap).filter(k => focusMap[k]);
    if (state.focus.length === 0) { showError('Please select at least one focus area.'); return; }

    // Warn if speaking selected but not supported
    if (state.focus.includes('speaking') && !state.speechSupported) {
      showError('Speaking mode requires Chrome or Edge browser. It has been removed from this session.');
      state.focus = state.focus.filter(f => f !== 'speaking');
      if (state.focus.length === 0) return;
    }

    state.language = lang;
    state.tasks = [];
    state.currentTask = 0;
    state.responses = [];
    state.scores = [];

    // Store recognition language for use when creating fresh instances
    state.recognitionLang = getLangCode(lang);

    showLoading('Athena is preparing your session...');

    try {
      const tasks = await generateTasks();
      state.tasks = tasks;
      hideLoading();

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

  // Map common language names to BCP47 codes for Web Speech API
  function getLangCode(lang) {
    const map = {
      english: 'en-US', french: 'fr-FR', spanish: 'es-ES', german: 'de-DE',
      italian: 'it-IT', portuguese: 'pt-PT', dutch: 'nl-NL', russian: 'ru-RU',
      japanese: 'ja-JP', chinese: 'zh-CN', mandarin: 'zh-CN', arabic: 'ar-SA',
      swahili: 'sw-KE', korean: 'ko-KR', hindi: 'hi-IN', turkish: 'tr-TR',
      polish: 'pl-PL', swedish: 'sv-SE',
    };
    return map[lang.toLowerCase()] || lang;
  }

  async function generateTasks() {
    const levelDesc = LEVEL_DESCRIPTORS[state.level];
    const focusTypes = state.focus;

    const prompt = `You are Athena, a language learning AI grounded in Swain's Output Hypothesis.
Generate exactly ${focusTypes.length} language tasks for a learner of ${state.language}.
Learner level: ${state.level} (${levelDesc})
Task types to include IN THIS ORDER: ${focusTypes.join(', ')}

RULES:
- "comprehension": Short passage IN ${state.language} (4-8 sentences, level-appropriate). Two comprehension questions the learner answers IN ${state.language}.
- "composition": A real writing prompt (describe, argue, narrate) — learner writes IN ${state.language}. No passage.
- "expression": An open compelling topic — learner writes freely IN ${state.language}. No passage. Pick real-world topics.
- "speaking": A speaking prompt — learner will SPEAK in ${state.language} for 1-2 minutes. Topic should match their level. No passage needed.

For beginner/elementary: simple sentence structures, familiar topics, shorter tasks.
For intermediate/advanced: nuanced topics, longer responses, push for precise expression.

NO grammar fill-in-the-blanks. NO translation tasks. NO multiple choice.
All written/spoken responses must be IN ${state.language}.

Respond ONLY with a valid JSON array (no fences):
[
  {
    "type": "comprehension|composition|expression|speaking",
    "passage": "passage text in ${state.language} or null",
    "prompt": "task instruction in English",
    "minWords": 30,
    "difficulty": "${state.level}"
  }
]`;

    const raw = await callGemini(prompt, SYSTEM_LANG_MODE);
    return parseGeminiJSON(raw);
  }

  // ─── Task rendering ───────────────────────────────────────
  function renderTask() {
    const task = state.tasks[state.currentTask];
    if (!task) { showReport(); return; }

    const isSpeaking = task.type === 'speaking';

    // Type badge
    const typeBadge = document.getElementById('lang-task-type-badge');
    const typeLabels = {
      comprehension: 'Reading Comprehension',
      composition:   'Written Composition',
      expression:    'Free Expression',
      speaking:      'Speaking Task',
    };
    typeBadge.textContent = typeLabels[task.type] || task.type;
    typeBadge.className = `lang-task-type lang-type-${task.type}`;

    document.getElementById('lang-task-meta').textContent = `${state.language} · ${task.difficulty}`;

    // Passage
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

    // Show/hide response areas
    document.getElementById('lang-written-block').style.display = isSpeaking ? 'none' : 'block';
    document.getElementById('lang-speaking-block').style.display = isSpeaking ? 'block' : 'none';

    if (!isSpeaking) {
      document.getElementById('lang-response').value = '';
      document.getElementById('lang-wc').textContent = '0';
      document.getElementById('lang-response-lang').textContent = state.language;
      document.getElementById('lang-response').placeholder =
        `Write your response in ${state.language}... (at least ${task.minWords} words)`;
    } else {
      resetSpeakingUI();
    }

    updateTaskCounter();
  }

  // ─── Speaking UI ──────────────────────────────────────────
  function resetSpeakingUI() {
    state.transcript = '';
    state.interimTranscript = '';
    state.isRecording = false;
    const btn = document.getElementById('record-btn');
    if (btn) {
      btn.textContent = '🎙 Start Speaking';
      btn.classList.remove('recording');
    }
    const display = document.getElementById('transcript-display');
    if (display) display.textContent = '';
    const wc = document.getElementById('speech-wc');
    if (wc) wc.textContent = '0 words';
  }

  function toggleRecording() {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function startRecording() {
    if (!state.SR) return;
    // Always create a fresh instance — avoids resultIndex drift across sessions
    state.transcript = '';
    state.interimTranscript = '';
    state.isRecording = true;
    state.recognition = createRecognition();
    try {
      state.recognition.start();
    } catch (e) {
      showError('Could not start microphone: ' + e.message);
      state.isRecording = false;
      return;
    }
    const btn = document.getElementById('record-btn');
    if (btn) {
      btn.textContent = '⏹ Stop Speaking';
      btn.classList.add('recording');
    }
    document.getElementById('recording-indicator').style.display = 'flex';
  }

  function stopRecording() {
    state.isRecording = false;
    if (state.recognition) {
      try { state.recognition.stop(); } catch (_) {}
    }
    const btn = document.getElementById('record-btn');
    if (btn) {
      btn.textContent = '🎙 Start Speaking';
      btn.classList.remove('recording');
    }
    const indicator = document.getElementById('recording-indicator');
    if (indicator) indicator.style.display = 'none';
  }

  function updateTranscriptDisplay() {
    const display = document.getElementById('transcript-display');
    if (!display) return;
    display.textContent = state.transcript + state.interimTranscript;
    const words = (state.transcript + state.interimTranscript)
      .trim().split(/\s+/).filter(w => w).length;
    const wc = document.getElementById('speech-wc');
    if (wc) wc.textContent = `${words} words spoken`;
  }

  function togglePassage() {
    const text = document.getElementById('lang-passage-text');
    const btn = document.getElementById('lang-hide-btn');
    state.passageVisible = !state.passageVisible;
    text.style.display = state.passageVisible ? 'block' : 'none';
    btn.textContent = state.passageVisible ? 'Hide Passage' : 'Show Passage';
  }

  // Live word count for written
  document.addEventListener('DOMContentLoaded', () => {
    const ta = document.getElementById('lang-response');
    if (ta) {
      ta.addEventListener('input', () => {
        const words = ta.value.trim().split(/\s+/).filter(w => w.length > 0).length;
        document.getElementById('lang-wc').textContent = words;
      });
    }
    initSpeech();

    // Show/hide speaking option based on browser support
    const speakingOption = document.getElementById('focus-speaking-row');
    if (speakingOption) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        speakingOption.style.display = 'none';
      }
    }
  });

  // ─── Submit ───────────────────────────────────────────────
  async function submitResponse() {
    const task = state.tasks[state.currentTask];
    const isSpeaking = task.type === 'speaking';

    let response = '';
    if (isSpeaking) {
      stopRecording();
      response = state.transcript.trim();
      if (!response) {
        showError('No speech detected. Press "Start Speaking" and speak into your microphone.');
        return;
      }
    } else {
      response = document.getElementById('lang-response').value.trim();
      if (!response) { showError('Please write your response first.'); return; }
      const wc = response.split(/\s+/).filter(w => w).length;
      if (wc < Math.floor(task.minWords * 0.5)) {
        showError(`Too short — aim for at least ${task.minWords} words.`);
        return;
      }
    }

    state.responses[state.currentTask] = response;
    showLoading(isSpeaking ? 'Analysing your speech...' : 'Evaluating your response...');

    try {
      const feedback = await evaluateResponse(task, response, isSpeaking);
      hideLoading();
      state.scores[state.currentTask] = feedback.score;
      renderFeedback(feedback, isSpeaking);
      adaptDifficulty(feedback.score);
      showStep('feedback');
    } catch (err) {
      hideLoading();
      showError('Evaluation error: ' + err.message);
    }
  }

  async function evaluateResponse(task, response, isSpeaking) {
    const levelDesc = LEVEL_DESCRIPTORS[state.level];

    const prompt = isSpeaking
      ? `You are Athena evaluating a ${state.language} SPEAKING task response.
The learner spoke and their speech was transcribed to text. Evaluate the SPOKEN content.

Learner level: ${state.level} (${levelDesc})
Speaking prompt: ${task.prompt}
Transcribed speech:
---
${response}
---

Evaluate based on:
1. Communicative effectiveness: Did they address the topic? Could a listener understand them?
2. Fluency indicators in the transcript: Natural word order? Appropriate vocabulary? Or heavy L1 interference visible in phrasing?
3. Vocabulary range: Is word choice varied and appropriate for their level?
4. Coherence: Did ideas connect logically?
5. Pronunciation note: Based on typical patterns for learners of ${state.language}, note any likely pronunciation challenges visible in word choices or common errors.

NOTE: The transcript may have errors from speech recognition — be lenient about exact spelling but evaluate the intended meaning.
Be honest. Calibrate to their level.

Respond ONLY with valid JSON (no fences):
{
  "score": 7.5,
  "comprehensibility": 8,
  "precision": 7,
  "fluency": 7,
  "taskCompletion": 8,
  "what_worked": "What they expressed well, referencing specific phrases from transcript",
  "gaps": "Specific gaps — unnatural phrasing, ideas they struggled to express, vocabulary limitations",
  "better_phrasing": "2-3 of their sentences rewritten more naturally in ${state.language}",
  "next_focus": "One specific thing to practise — vocabulary, phrasing pattern, or topic area"
}`
      : `You are Athena evaluating a ${state.language} written response.

Learner level: ${state.level} (${levelDesc})
Task type: ${task.type}
Task prompt: ${task.prompt}
${task.passage ? `Passage:\n${task.passage}\n` : ''}
Learner's response:
---
${response}
---

Evaluate on Swain's Output Hypothesis criteria:
1. Comprehensibility: coherent and understandable?
2. Precision: ideas expressed accurately in ${state.language}?
3. Fluency: natural constructions or heavily translated from L1?
4. Task completion: did they answer what was asked?

Be honest. Calibrate to their level.

Respond ONLY with valid JSON (no fences):
{
  "score": 7.5,
  "comprehensibility": 8,
  "precision": 7,
  "fluency": 7,
  "taskCompletion": 8,
  "what_worked": "Specific things they expressed well with examples from their text",
  "gaps": "Specific gaps — unnatural constructions, vocabulary limitations, missed ideas",
  "better_phrasing": "2-3 of their sentences rewritten more naturally in ${state.language}",
  "next_focus": "One concrete thing to practise next"
}`;

    const raw = await callGemini(prompt, SYSTEM_EVALUATOR);
    return parseGeminiJSON(raw);
  }

  // ─── Feedback ─────────────────────────────────────────────
  function renderFeedback(fb, isSpeaking) {
    const dims = [
      { key: 'comprehensibility', label: 'Comprehensibility' },
      { key: 'precision',         label: isSpeaking ? 'Vocabulary' : 'Precision' },
      { key: 'fluency',           label: 'Fluency' },
      { key: 'taskCompletion',    label: 'Task Completion' },
    ];

    document.getElementById('lang-feedback-scores').innerHTML = `
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
          </div>`).join('')}
      </div>`;

    document.getElementById('lang-feedback-sections').innerHTML = `
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
      </div>`;

    const isLast = state.currentTask >= state.tasks.length - 1;
    document.getElementById('lang-next-btn-text').textContent = isLast ? 'See Report' : 'Next Task →';
  }

  function adaptDifficulty(score) {
    const recent = state.scores.filter(s => s !== undefined);
    const avg = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
    const levels = ['beginner', 'elementary', 'intermediate', 'advanced'];
    const idx = levels.indexOf(state.level);
    let target = state.level;
    if (avg >= 8.5 && idx < levels.length - 1) target = levels[idx + 1];
    else if (avg <= 4 && idx > 0) target = levels[idx - 1];
    for (let i = state.currentTask + 1; i < state.tasks.length; i++) {
      state.tasks[i].difficulty = target;
    }
  }

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

  async function showReport() {
    const total = state.scores.length;
    const avg = total > 0 ? state.scores.reduce((a, b) => a + b, 0) / total : 0;
    const grade = avg.toFixed(1);

    document.getElementById('lang-final-score').textContent = grade;
    const offset = 314 - ((avg / 10) * 314);
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
      document.getElementById('lang-report-weak').innerHTML = '<li>Review responses above</li>';
      document.getElementById('lang-report-practise').innerHTML = `<li>Keep producing in ${state.language} daily</li>`;
    }
    showStep('report');
  }

  async function generateReport() {
    const summary = state.tasks.map((t, i) => ({
      type: t.type,
      score: state.scores[i] || 0,
      excerpt: (state.responses[i] || '').slice(0, 150),
    }));
    const raw = await callGemini(
      `${state.language} learner session (level: ${state.level}). Diagnose.
Data: ${JSON.stringify(summary)}
Respond ONLY with JSON (no fences):
{"canDo":["3-4 things they demonstrated"],"gaps":["3-4 specific gaps"],"practise":["3-4 concrete exercises"]}`,
      SYSTEM_EVALUATOR
    );
    return parseGeminiJSON(raw);
  }

  function restartSession() {
    stopRecording();
    const savedSR = state.SR;
    const savedSupported = state.speechSupported;
    state = {
      language: '', level: '', focus: [], tasks: [],
      currentTask: 0, responses: [], scores: [],
      passageVisible: true, isRecording: false,
      transcript: '', interimTranscript: '',
      recognition: null,
      SR: savedSR,
      speechSupported: savedSupported,
      recognitionLang: '',
    };
    document.getElementById('lang-input').value = '';
    document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
    ['focus-comprehension','focus-composition','focus-expression','focus-speaking']
      .forEach(id => { const el = document.getElementById(id); if (el) el.checked = true; });
    document.getElementById('lang-score-display').style.display = 'none';
    showStep('setup');
  }

  return { selectLevel, startSession, togglePassage, submitResponse, nextTask, restartSession, toggleRecording };
})();

// Global bindings
function selectLevel(l)       { LangMode.selectLevel(l); }
function startLangSession()   { LangMode.startSession(); }
function togglePassage()      { LangMode.togglePassage(); }
function submitLangResponse() { LangMode.submitResponse(); }
function nextLangTask()       { LangMode.nextTask(); }
function restartLangSession() { LangMode.restartSession(); }
function toggleRecording()    { LangMode.toggleRecording(); }
