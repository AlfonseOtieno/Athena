// ============================================================
// coding-mode.js — Athena Coding Mode
// Curriculum mapping → project generation → code evaluation
// ============================================================

const CodingMode = (() => {
  let state = {
    topic: '',
    checklist: [],
    checkedTopics: [],
    project: null,
    activeTab: 'html',
  };

  // ─── Step control ────────────────────────────────────────────
  function showStep(step) {
    document.querySelectorAll('.coding-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`coding-step-${step}`).classList.add('active');
  }

  // ─── Curriculum checklist ────────────────────────────────────
  async function generateChecklist() {
    const topic = document.getElementById('topic-input').value.trim();
    if (!topic) { showError('Please enter a topic first.'); return; }

    state.topic = topic;
    const btn = document.getElementById('checklist-btn-text');
    btn.textContent = 'Mapping curriculum...';

    showLoading('Building curriculum map...');

    try {
      const prompt = `You are Athena, a coding curriculum expert. Generate a complete curriculum checklist for: "${topic}"

Break it into logical groups/sections with subtopics. Cover everything a learner would need to know.
Be thorough but realistic for a self-study path.

Respond ONLY with JSON (no fences):
{
  "groups": [
    {
      "name": "Group Name",
      "items": ["subtopic 1", "subtopic 2", "subtopic 3"]
    }
  ]
}

Include 3-6 groups, 3-8 items per group.`;

      const raw = await callGemini(prompt, SYSTEM_CODING_MODE);
      const data = parseGeminiJSON(raw);
      state.checklist = data.groups;

      hideLoading();
      renderChecklist();
      showStep('checklist');
    } catch (err) {
      hideLoading();
      btn.textContent = 'Map the Curriculum';
      showError('Could not generate checklist: ' + err.message);
    }
  }

  function renderChecklist() {
    const container = document.getElementById('checklist-container');
    container.innerHTML = '';

    state.checklist.forEach((group, gi) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'checklist-group';

      const title = document.createElement('div');
      title.className = 'checklist-group-title';
      title.textContent = group.name;
      groupEl.appendChild(title);

      const items = document.createElement('div');
      items.className = 'checklist-items';

      group.items.forEach((item, ii) => {
        const id = `chk-${gi}-${ii}`;
        const row = document.createElement('label');
        row.className = 'checklist-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = id;
        cb.dataset.group = group.name;
        cb.dataset.item = item;

        const lbl = document.createElement('span');
        lbl.textContent = item;

        row.appendChild(cb);
        row.appendChild(lbl);
        items.appendChild(row);
      });

      groupEl.appendChild(items);
      container.appendChild(groupEl);
    });
  }

  // ─── Project generation ───────────────────────────────────────
  async function generateProject() {
    const checkboxes = document.querySelectorAll('#checklist-container input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
      showError('Please check at least one topic you have learned.');
      return;
    }

    state.checkedTopics = Array.from(checkboxes).map(cb => cb.dataset.item);

    const btn = document.getElementById('project-btn-text');
    btn.textContent = 'Generating project...';
    showLoading('Athena is designing your project...');

    try {
      const prompt = buildProjectPrompt(state.topic, state.checkedTopics);
      const raw = await callGemini(prompt, SYSTEM_CODING_MODE);
      state.project = parseGeminiJSON(raw);

      hideLoading();
      renderProject();
      showStep('editor');
    } catch (err) {
      hideLoading();
      btn.textContent = 'Generate My Project';
      showError('Could not generate project: ' + err.message);
    }
  }

  function buildProjectPrompt(topic, topics) {
    const topicLower = topic.toLowerCase();
    const isHTML = topicLower.includes('html');
    const isCSS = topicLower.includes('css') || topicLower.includes('flexbox') || topicLower.includes('grid') || topicLower.includes('styling');
    const isJS = topicLower.includes('javascript') || topicLower.includes('js') || topicLower.includes('dom');
    const isCSSOnly = isCSS && !isHTML && !isJS;
    const isJSOnly = isJS && !isHTML;

    let projectType = 'full application';
    let editorHint = 'HTML, CSS, and JavaScript';

    if (isHTML && !isCSS && !isJS) {
      projectType = 'HTML structure only (no styling required, focus on semantic markup)';
      editorHint = 'HTML only';
    } else if (isCSSOnly) {
      projectType = 'CSS styling challenge (HTML structure will be provided, student writes CSS only)';
      editorHint = 'CSS only';
    } else if (isJSOnly) {
      projectType = 'JavaScript functionality (basic HTML structure provided, student writes JS)';
      editorHint = 'JavaScript';
    }

    return `Design a project assignment for a student learning ${topic}.
Topics they have covered: ${topics.join(', ')}.
Project type: ${projectType}
Editor scope: ${editorHint}

The project should:
- Be a REAL application (not syntax drills or "hello world")
- Only use concepts the student has actually studied
- Be achievable in 1-3 hours
- Test conceptual understanding, not just copying syntax
${isCSSOnly ? '- Provide complete HTML starter code they must style' : ''}
${isJSOnly ? '- Provide a simple HTML/CSS shell they must add JS to' : ''}

Respond ONLY with JSON (no fences):
{
  "title": "Project title",
  "description": "2-3 sentence description of what they're building and why",
  "requirements": ["Requirement 1", "Requirement 2", "Requirement 3", "Requirement 4", "Requirement 5"],
  "editorScope": ["html"] or ["css"] or ["js"] or ["html","css"] or ["html","css","js"],
  "starterCode": {
    "html": "HTML starter code string (provide full starter if CSS/JS project, empty string if HTML project)",
    "css": "CSS starter code string (empty unless providing a reset or base styles)",
    "js": ""
  },
  "evaluationRubric": ["Criterion 1", "Criterion 2", "Criterion 3"],
  "conceptsToTest": ${JSON.stringify(topics.slice(0, 8))}
}`;
  }

  function renderProject() {
    const p = state.project;

    document.getElementById('project-description').innerHTML =
      `<strong style="font-family:var(--font-display);font-size:1rem;color:var(--marble)">${p.title}</strong><br/><br/>${p.description}`;

    const reqs = p.requirements.map(r => `<li style="margin-bottom:0.4rem;color:var(--text-faint);font-size:0.88rem">• ${r}</li>`).join('');
    document.getElementById('project-requirements').innerHTML =
      `<strong>Requirements</strong><ul style="list-style:none;margin-top:0.5rem">${reqs}</ul>`;

    // Set up editor tabs
    const scope = p.editorScope || ['html'];
    document.getElementById('css-tab').style.display = scope.includes('css') ? 'block' : 'none';
    document.getElementById('js-tab').style.display = scope.includes('js') ? 'block' : 'none';

    // Load starter code
    if (p.starterCode) {
      document.getElementById('editor-html').value = p.starterCode.html || '';
      document.getElementById('editor-css').value = p.starterCode.css || '';
      document.getElementById('editor-js').value = p.starterCode.js || '';
    }

    // Default to first tab in scope
    switchTab(scope[0]);
    updatePreview();
  }

  // ─── Editor ───────────────────────────────────────────────────
  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    ['html', 'css', 'js'].forEach(t => {
      const el = document.getElementById(`editor-${t}`);
      el.style.display = t === tab ? 'block' : 'none';
    });
    updatePreview();
  }

  function updatePreview() {
    const html = document.getElementById('editor-html').value;
    const css = document.getElementById('editor-css').value;
    const js = document.getElementById('editor-js').value;

    const combined = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>${css}</style>
</head>
<body>
${html}
<script>
try {
  ${js}
} catch(e) {
  document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;bottom:0;left:0;right:0;background:#c94c4c;color:white;padding:8px;font-size:12px;font-family:monospace">JS Error: '+e.message+'</div>');
}
<\/script>
</body>
</html>`;

    const frame = document.getElementById('preview-frame');
    frame.srcdoc = combined;
  }

  // ─── Code evaluation ──────────────────────────────────────────
  async function evaluateCode() {
    const html = document.getElementById('editor-html').value.trim();
    const css = document.getElementById('editor-css').value.trim();
    const js = document.getElementById('editor-js').value.trim();

    if (!html && !css && !js) {
      showError('Please write some code before evaluating.');
      return;
    }

    document.getElementById('eval-btn-text').textContent = 'Evaluating...';
    showLoading('Athena is reviewing your code...');

    try {
      const prompt = buildEvalPrompt(html, css, js);
      const raw = await callGemini(prompt, SYSTEM_EVALUATOR);
      const evaluation = parseGeminiJSON(raw);

      hideLoading();
      renderEvaluation(evaluation);
      showStep('eval');
    } catch (err) {
      hideLoading();
      document.getElementById('eval-btn-text').textContent = 'Evaluate My Code';
      showError('Evaluation error: ' + err.message);
    }
  }

  function buildEvalPrompt(html, css, js) {
    const p = state.project;
    return `You are Athena, evaluating a student's code submission.

PROJECT: ${p?.title || state.topic}
DESCRIPTION: ${p?.description || ''}
REQUIREMENTS: ${(p?.requirements || []).join(', ')}
CONCEPTS EXPECTED: ${(p?.conceptsToTest || state.checkedTopics).join(', ')}
EVALUATION RUBRIC: ${(p?.evaluationRubric || []).join(', ')}

STUDENT'S CODE:
HTML:
${html || '(none)'}

CSS:
${css || '(none)'}

JavaScript:
${js || '(none)'}

Evaluate rigorously. Give an honest grade — don't inflate.
Score based on: concept coverage, code quality, requirement fulfillment, structure.

Respond ONLY with JSON (no fences):
{
  "grade": 7.5,
  "strengths": "Paragraph describing what the student did well, specific to their code",
  "weaknesses": "Paragraph describing specific weaknesses and errors found",
  "missingConcepts": "Paragraph describing which required concepts are absent or misused",
  "improvedCode": "A clean, improved version of the full code showing best practices (HTML with embedded CSS/JS if needed)"
}`;
  }

  function renderEvaluation(ev) {
    document.getElementById('eval-grade').textContent = ev.grade ?? '—';

    const grade = parseFloat(ev.grade) || 0;
    const gradeEl = document.getElementById('eval-grade');
    if (grade >= 8) gradeEl.style.color = 'var(--success)';
    else if (grade >= 5) gradeEl.style.color = 'var(--gold)';
    else gradeEl.style.color = 'var(--danger)';

    document.querySelector('#eval-strengths .eval-content').textContent = ev.strengths || '—';
    document.querySelector('#eval-weaknesses .eval-content').textContent = ev.weaknesses || '—';
    document.querySelector('#eval-missing .eval-content').textContent = ev.missingConcepts || '—';
    document.querySelector('#eval-improved .eval-content').textContent = ev.improvedCode || '(not provided)';
  }

  function backToEditor() {
    document.getElementById('eval-btn-text').textContent = 'Evaluate My Code';
    showStep('editor');
  }

  // ─── Expose ───────────────────────────────────────────────────
  return {
    generateChecklist,
    generateProject,
    switchTab,
    updatePreview,
    evaluateCode,
    backToEditor,
  };
})();

// Global bindings
function generateChecklist() { CodingMode.generateChecklist(); }
function generateProject() { CodingMode.generateProject(); }
function switchTab(t) { CodingMode.switchTab(t); }
function updatePreview() { CodingMode.updatePreview(); }
function evaluateCode() { CodingMode.evaluateCode(); }
function backToEditor() { CodingMode.backToEditor(); }
