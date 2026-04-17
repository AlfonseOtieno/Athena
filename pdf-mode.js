// ============================================================
// pdf-mode.js — Athena Knowledge Mode
// Adaptive questioning engine with diagnostic feedback
// ============================================================

const PDFMode = (() => {
  let state = {
    sourceText: '',
    totalQuestions: 10,
    questions: [],
    currentIndex: 0,
    answers: [],
    scores: [],        // per question: 0, 0.5, 1
    difficulty: 'medium', // 'easy' | 'medium' | 'hard'
    weakTopics: [],
    strongTopics: [],
    selectedMCQOption: null,
  };

  // ─── Step control ───────────────────────────────────────────
  function showStep(step) {
    document.querySelectorAll('.pdf-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`pdf-step-${step}`).classList.add('active');
  }

  // ─── File upload handler ─────────────────────────────────────
  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading('Reading your file...');
    try {
      const text = await extractTextFromFile(file);
      state.sourceText = text;
      document.getElementById('notes-input').value = text.slice(0, 3000) + (text.length > 3000 ? '\n...(truncated for display)' : '');

      // Show file tag
      const zone = document.getElementById('upload-zone');
      let tag = document.getElementById('file-tag');
      if (!tag) {
        tag = document.createElement('div');
        tag.id = 'file-tag';
        tag.className = 'file-tag';
        zone.after(tag);
      }
      tag.innerHTML = `📄 ${file.name} <span class="file-tag-remove" onclick="clearFile()">✕</span>`;
    } catch (err) {
      showError('Could not read file: ' + err.message);
    } finally {
      hideLoading();
    }
  }

  function clearFile() {
    state.sourceText = '';
    document.getElementById('notes-input').value = '';
    const tag = document.getElementById('file-tag');
    if (tag) tag.remove();
    document.getElementById('pdf-file-input').value = '';
  }

  // ─── Question generation ─────────────────────────────────────
  async function startSession() {
    const notesText = document.getElementById('notes-input').value.trim();
    const text = state.sourceText || notesText;

    if (!text) {
      showError('Please upload a file or paste your notes first.');
      return;
    }

    state.sourceText = text;
    state.totalQuestions = parseInt(document.getElementById('q-count').textContent);
    state.questions = [];
    state.currentIndex = 0;
    state.answers = [];
    state.scores = [];
    state.difficulty = 'medium';
    state.weakTopics = [];
    state.strongTopics = [];

    showLoading('Athena is reading your material...');

    try {
      const prompt = buildQuestionGenPrompt(text, state.totalQuestions);
      const raw = await callGemini(prompt, SYSTEM_KNOWLEDGE_MODE);
      state.questions = parseGeminiJSON(raw);

      if (!Array.isArray(state.questions) || state.questions.length === 0) {
        throw new Error('No questions generated');
      }

      hideLoading();
      startQuiz();
    } catch (err) {
      hideLoading();
      showError('Error generating questions: ' + err.message);
    }
  }

  function buildQuestionGenPrompt(text, count) {
    return `You are Athena, a mastery learning AI. Analyze the following study material and generate exactly ${count} questions.

Mix question types: some open-ended (type: "open") and some multiple choice (type: "mcq").
For MCQ: provide exactly 4 options, label them A, B, C, D. Include one correct answer and a brief explanation.
For open-ended: provide a model answer and key concepts that should be mentioned.

Start with medium difficulty. Mark difficulty as "easy", "medium", or "hard".
Focus on CONCEPTUAL UNDERSTANDING, not memorization of trivial facts.
Also identify 3-5 topic tags per question (e.g. "arrays", "loops", "photosynthesis").

STUDY MATERIAL:
---
${text.slice(0, 8000)}
---

Respond ONLY with a JSON array. No preamble, no markdown fences. Format:
[
  {
    "id": 1,
    "type": "mcq",
    "question": "...",
    "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
    "correct": "A",
    "explanation": "...",
    "difficulty": "medium",
    "topics": ["topic1", "topic2"]
  },
  {
    "id": 2,
    "type": "open",
    "question": "...",
    "modelAnswer": "...",
    "keyConcepts": ["concept1", "concept2"],
    "difficulty": "medium",
    "topics": ["topic1"]
  }
]`;
  }

  // ─── Quiz rendering ───────────────────────────────────────────
  function startQuiz() {
    document.getElementById('pdf-score-display').style.display = 'flex';
    updateScoreDisplay();
    showStep('quiz');
    renderQuestion();
  }

  function renderQuestion() {
    const q = state.questions[state.currentIndex];
    if (!q) { showReport(); return; }

    state.selectedMCQOption = null;

    // Progress bar
    const pct = (state.currentIndex / state.questions.length) * 100;
    document.getElementById('quiz-progress-fill').style.width = pct + '%';

    // Meta
    document.getElementById('quiz-q-num').textContent =
      `Question ${state.currentIndex + 1} of ${state.questions.length}`;

    const badge = document.getElementById('difficulty-badge');
    badge.textContent = q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1);
    badge.className = `difficulty-badge ${q.difficulty}`;

    // Question text
    document.getElementById('question-text').textContent = q.question;

    // Answer area
    const mcqDiv = document.getElementById('mcq-options');
    const openArea = document.getElementById('open-answer');

    if (q.type === 'mcq') {
      mcqDiv.style.display = 'flex';
      openArea.style.display = 'none';
      openArea.value = '';
      mcqDiv.innerHTML = '';

      Object.entries(q.options).forEach(([key, val]) => {
        const btn = document.createElement('button');
        btn.className = 'mcq-option';
        btn.textContent = `${key}. ${val}`;
        btn.onclick = () => {
          document.querySelectorAll('.mcq-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          state.selectedMCQOption = key;
        };
        mcqDiv.appendChild(btn);
      });
    } else {
      mcqDiv.style.display = 'none';
      openArea.style.display = 'block';
      openArea.value = '';
      openArea.placeholder = 'Write your answer here — explain in your own words...';
    }
  }

  // ─── Answer submission & evaluation ──────────────────────────
  async function submitAnswer() {
    const q = state.questions[state.currentIndex];
    let userAnswer = '';

    if (q.type === 'mcq') {
      if (!state.selectedMCQOption) {
        showError('Please select an answer.');
        return;
      }
      userAnswer = state.selectedMCQOption;
    } else {
      userAnswer = document.getElementById('open-answer').value.trim();
      if (!userAnswer) {
        showError('Please write your answer before submitting.');
        return;
      }
    }

    state.answers[state.currentIndex] = userAnswer;
    showLoading('Evaluating...');

    try {
      const evaluation = await evaluateAnswer(q, userAnswer);
      hideLoading();
      showFeedback(evaluation, q);

      // Track score
      state.scores[state.currentIndex] = evaluation.score;
      updateScoreDisplay();

      // Adapt difficulty
      adaptDifficulty(evaluation.score, q.topics);
    } catch (err) {
      hideLoading();
      showError('Error evaluating answer: ' + err.message);
    }
  }

  async function evaluateAnswer(question, userAnswer) {
    if (question.type === 'mcq') {
      const correct = userAnswer === question.correct;
      return {
        score: correct ? 1 : 0,
        verdict: correct ? 'correct' : 'incorrect',
        feedback: correct
          ? `Correct! ${question.explanation}`
          : `Not quite. The correct answer is ${question.correct}. ${question.explanation}`,
        missedConcepts: correct ? [] : question.topics
      };
    }

    const prompt = `You are Athena, a mastery learning AI evaluating a student's answer.

QUESTION: ${question.question}
MODEL ANSWER: ${question.modelAnswer}
KEY CONCEPTS TO COVER: ${question.keyConcepts.join(', ')}
STUDENT'S ANSWER: ${userAnswer}

Evaluate and respond ONLY with JSON (no fences):
{
  "score": 0.0 to 1.0,
  "verdict": "correct" | "partial" | "incorrect",
  "feedback": "2-3 sentence explanation of what was right, what was missing, and the correct understanding",
  "missedConcepts": ["concept1", "concept2"]
}`;

    const raw = await callGemini(prompt, SYSTEM_EVALUATOR);
    return parseGeminiJSON(raw);
  }

  function adaptDifficulty(score, topics) {
    const recentScores = state.scores.slice(-3).filter(s => s !== undefined);
    const avg = recentScores.reduce((a, b) => a + b, 0) / (recentScores.length || 1);

    // Track weak/strong topics
    topics.forEach(topic => {
      if (score < 0.5) {
        if (!state.weakTopics.includes(topic)) state.weakTopics.push(topic);
      } else if (score >= 0.8) {
        if (!state.strongTopics.includes(topic)) state.strongTopics.push(topic);
      }
    });

    // Adapt next question's expected difficulty
    if (avg >= 0.8) state.difficulty = 'hard';
    else if (avg <= 0.4) state.difficulty = 'easy';
    else state.difficulty = 'medium';

    // If we still have questions to generate adaptively, adjust next question's difficulty
    adjustUpcomingQuestions();
  }

  function adjustUpcomingQuestions() {
    // Set the difficulty label on remaining unasked questions
    for (let i = state.currentIndex + 1; i < state.questions.length; i++) {
      state.questions[i].difficulty = state.difficulty;
    }
  }

  // ─── Feedback rendering ───────────────────────────────────────
  function showFeedback(evaluation, question) {
    const verdictEl = document.getElementById('feedback-verdict');
    verdictEl.className = `feedback-verdict ${evaluation.verdict}`;
    const labels = { correct: '✓ Correct', partial: '◎ Partially Correct', incorrect: '✗ Incorrect' };
    verdictEl.textContent = labels[evaluation.verdict] || evaluation.verdict;

    document.getElementById('feedback-body').textContent = evaluation.feedback;
    showStep('feedback');
  }

  function nextQuestion() {
    state.currentIndex++;
    if (state.currentIndex >= state.questions.length) {
      showReport();
    } else {
      showStep('quiz');
      renderQuestion();
    }
  }

  // ─── Score display ────────────────────────────────────────────
  function updateScoreDisplay() {
    const answered = state.scores.filter(s => s !== undefined).length;
    const total = state.questions.length || state.totalQuestions;
    const points = state.scores.reduce((a, b) => a + (b || 0), 0);
    document.getElementById('pdf-score').textContent = points.toFixed(1);
    document.getElementById('pdf-total').textContent = answered;
  }

  // ─── Final report ─────────────────────────────────────────────
  async function showReport() {
    const total = state.scores.length;
    const points = state.scores.reduce((a, b) => a + (b || 0), 0);
    const pct = total > 0 ? points / total : 0;
    const grade = (pct * 10).toFixed(1);

    // Animate score ring
    document.getElementById('final-score-num').textContent = grade;
    const circumference = 314;
    const offset = circumference - (pct * circumference);
    setTimeout(() => {
      document.getElementById('ring-fill').style.strokeDashoffset = offset;
    }, 100);

    // Generate report from AI
    showLoading('Generating your report...');
    try {
      const report = await generateReport();
      hideLoading();

      const strongUl = document.getElementById('report-strong');
      const weakUl = document.getElementById('report-weak');
      const revisitUl = document.getElementById('report-revisit');

      strongUl.innerHTML = report.strongAreas.map(a => `<li>${a}</li>`).join('');
      weakUl.innerHTML = report.weakAreas.map(a => `<li>${a}</li>`).join('');
      revisitUl.innerHTML = report.revisitTopics.map(a => `<li>${a}</li>`).join('');

      // Store weak topics for retest
      state.weakTopics = report.weakAreas;
    } catch (e) {
      hideLoading();
      document.getElementById('report-strong').innerHTML = '<li>Session complete</li>';
      document.getElementById('report-weak').innerHTML = '<li>Review your answers above</li>';
      document.getElementById('report-revisit').innerHTML = '<li>Go over the full material again</li>';
    }

    showStep('report');
  }

  async function generateReport() {
    const qa = state.questions.map((q, i) => ({
      question: q.question,
      userAnswer: state.answers[i] || '(no answer)',
      score: state.scores[i] ?? 0,
      topics: q.topics
    }));

    const prompt = `Based on this student's quiz session, generate a brief diagnostic report.

QUESTIONS AND SCORES:
${JSON.stringify(qa, null, 2)}

Respond ONLY with JSON (no fences):
{
  "strongAreas": ["topic or concept they clearly understood", ...],
  "weakAreas": ["topic or concept they struggled with", ...],
  "revisitTopics": ["specific chapter/section/concept they should go back and re-read", ...]
}

Keep each item concise — max 10 words.`;

    const raw = await callGemini(prompt, SYSTEM_EVALUATOR);
    return parseGeminiJSON(raw);
  }

  async function retestWeakAreas() {
    if (state.weakTopics.length === 0) {
      showError('No weak areas identified — great job!');
      return;
    }

    showLoading('Generating focused retest...');
    try {
      const prompt = `Generate 5 focused questions on these weak areas: ${state.weakTopics.join(', ')}.
Use this source material as context:
---
${state.sourceText.slice(0, 5000)}
---

Make questions specifically target the weak concepts. Increase difficulty slightly.
Respond ONLY with valid JSON array (same format as before). No preamble.
[{"id":1,"type":"open","question":"...","modelAnswer":"...","keyConcepts":["..."],"difficulty":"medium","topics":["..."]}]`;

      const raw = await callGemini(prompt, SYSTEM_KNOWLEDGE_MODE);
      const newQuestions = parseGeminiJSON(raw);

      state.questions = newQuestions;
      state.currentIndex = 0;
      state.answers = [];
      state.scores = [];
      state.difficulty = 'medium';

      hideLoading();
      startQuiz();
    } catch (err) {
      hideLoading();
      showError('Could not generate retest: ' + err.message);
    }
  }

  // ─── Question count ───────────────────────────────────────────
  function adjustCount(delta) {
    const el = document.getElementById('q-count');
    let val = parseInt(el.textContent) + delta;
    val = Math.max(5, Math.min(30, val));
    el.textContent = val;
  }

  // ─── Expose ───────────────────────────────────────────────────
  return {
    handleFileUpload,
    clearFile,
    startSession,
    submitAnswer,
    nextQuestion,
    showReport,
    retestWeakAreas,
    adjustCount,
  };
})();

// Global bindings
function handleFileUpload(e) { PDFMode.handleFileUpload(e); }
function clearFile() { PDFMode.clearFile(); }
function startPdfSession() { PDFMode.startSession(); }
function submitAnswer() { PDFMode.submitAnswer(); }
function nextQuestion() { PDFMode.nextQuestion(); }
function retestWeakAreas() { PDFMode.retestWeakAreas(); }
function adjustCount(d) { PDFMode.adjustCount(d); }

// Drag & drop
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('upload-zone');
  if (!zone) return;

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.style.borderColor = 'var(--gold)';
    zone.style.background = 'var(--gold-dim)';
  });

  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = '';
    zone.style.background = '';
  });

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '';
    zone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) {
      const input = document.getElementById('pdf-file-input');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      PDFMode.handleFileUpload({ target: { files: [file] } });
    }
  });
});
