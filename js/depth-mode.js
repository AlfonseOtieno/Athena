// ============================================================
// depth-mode.js — Athena Depth Mode
//
// This is NOT a recall mode. It does not test what you learned.
// It helps you decide what is worth learning in the first place.
//
// Four evaluation axes (each 0–5):
//   A. Claim vs Delivery   — did it deliver what it promised?
//   B. Depth (relative)    — deep enough for its format/length?
//   C. Credibility signals — evidence, consistency, originality?
//   D. Usefulness to you   — worth your time at your current stage?
//
// Verdict: Study Deeply / Skim / Ignore
// Output:  Reason + Better alternatives
// ============================================================

const DepthMode = (() => {

  let state = {
    content: '',
    topic: '',
    sourceType: 'article',
    format: '',       // e.g. "10-minute video", "long-form article"
    priorLevel: '',   // beginner / some-knowledge / familiar
  };

  const SOURCE_HINTS = {
    article:  'Paste the full article text. For paywalled content, use reader view and copy. Include the headline and any subheadings.',
    video:    'Paste the video transcript or your notes from it. YouTube: click ⋮ under the video → Open transcript, then copy. Include the video title.',
    podcast:  'Paste the episode transcript or your notes. Include the episode title and guest name if relevant.',
    book:     'Paste the chapter or excerpt. Include the book title, author, and chapter name.',
    notes:    'Paste your own notes or summary from something you consumed. Label what the original source was at the top.',
  };

  const FORMAT_OPTIONS = [
    { value: 'short-video',   label: '10-min video' },
    { value: 'long-video',    label: '30–60 min video' },
    { value: 'short-article', label: 'Short article' },
    { value: 'long-article',  label: 'Long-form article / essay' },
    { value: 'podcast',       label: 'Podcast episode' },
    { value: 'book-chapter',  label: 'Book chapter' },
    { value: 'book',          label: 'Full book' },
    { value: 'other',         label: 'Other' },
  ];

  // ─── Step control ─────────────────────────────────────────
  function showStep(step) {
    document.querySelectorAll('.depth-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`depth-step-${step}`).classList.add('active');
  }

  // ─── Source type ──────────────────────────────────────────
  function selectSourceType(type) {
    state.sourceType = type;
    document.querySelectorAll('.source-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.type === type)
    );
    const hint = document.getElementById('depth-source-hint');
    if (hint) hint.textContent = SOURCE_HINTS[type] || '';
  }

  // ─── Analysis ─────────────────────────────────────────────
  async function startSession() {
    const content = document.getElementById('depth-content').value.trim();
    const topic   = document.getElementById('depth-topic').value.trim();
    const format  = document.getElementById('depth-format').value;
    const level   = document.getElementById('depth-level').value;

    if (content.length < 80) {
      showError('Please paste more content — at least a paragraph for a meaningful analysis.');
      return;
    }

    state.content    = content;
    state.topic      = topic;
    state.format     = format;
    state.priorLevel = level;

    showLoading('Athena is reading the content...');

    try {
      const result = await analyseContent();
      hideLoading();
      renderResult(result);
      showStep('result');
    } catch (err) {
      hideLoading();
      showError('Analysis error: ' + err.message);
    }
  }

  async function analyseContent() {
    const formatLabel = FORMAT_OPTIONS.find(f => f.value === state.format)?.label || state.format || 'unspecified format';
    const topicLine = state.topic ? `The user says this content is about: "${state.topic}".` : '';
    const levelLine = state.priorLevel
      ? `The user's prior knowledge of this topic: ${state.priorLevel}.`
      : '';

    const prompt = `You are Athena's Depth Engine. Your job is to evaluate whether a piece of content is worth someone's time and attention. This is NOT about testing the reader — it is about evaluating the SOURCE.

${topicLine}
${levelLine}
Format/length: ${formatLabel}
Source type: ${state.sourceType}

CONTENT:
---
${state.content.slice(0, 7000)}
---

Evaluate on FOUR axes. Each scored 0–5. Be precise and honest.

A. CLAIM_VS_DELIVERY (0–5)
What does this content promise to deliver (explicitly or implicitly by its title/introduction)?
Did it actually deliver that?
- 0: Misleading — promises depth but gives none, or the title/intro is bait
- 2: Partial — delivers some of what was promised, misses key parts
- 4: Mostly aligned — delivers what it says with minor gaps
- 5: Precise — exactly delivers what was promised, no inflation
Note: A video that says "introduction to X" and gives a solid introduction scores 5. The same video claiming "master X" scores 1.

B. DEPTH_FOR_FORMAT (0–5)
Depth is judged relative to what is REASONABLE for this format/length.
A 10-minute intro video can legitimately score 4 if it correctly maps the terrain without distorting it.
A 1-hour documentary scoring 2 is a failure.
- 0: Buzzwords only, no substance, or actively distorts the topic
- 2: Surface overview, no mechanisms explained
- 3: Decent explanation for the format, some first-principles thinking
- 4: Goes beyond surface, explains mechanisms, shows nuance
- 5: Exceptional depth for its format — mechanisms, evidence, nuance, acknowledges limits

C. CREDIBILITY_SIGNALS (0–5)
Evaluate the BEHAVIOUR PATTERNS visible in the content — not the person's credentials:
- Does it reference specific evidence, named studies, real data, or primary sources?
- Is it internally consistent — do the claims hold together?
- Does it present original reasoning or just assembled quotes and borrowed wisdom?
- Does it acknowledge what it does NOT know or cover?
- Does it contradict well-established knowledge without justification?
- Is there "10 hacks" energy — confidence without foundation?
Score:
- 0: Actively contradicts evidence, pure signalling, no foundation
- 2: Asserts without evidence, borrowed wisdom without attribution
- 3: Reasonable but unverified, honest about uncertainty
- 4: Cites specifics, internally consistent, acknowledges limits
- 5: Rigorous — primary sources, original reasoning, intellectual honesty

D. USEFULNESS_FOR_STAGE (0–5)
Given the user's prior knowledge level, is this content useful for WHERE THEY ARE?
"Shallow but useful" (maps terrain for a beginner) is different from "shallow and misleading."
- 0: No value — misleads, wastes time, or is entirely below/above the user's level with no benefit
- 2: Minimal value — some exposure but not worth dedicated attention
- 3: Useful as an introduction or map, even if not deep
- 4: Good value for this stage — will move the user forward meaningfully
- 5: Excellent match — exactly what this person needs at this stage

CONTENT AUTHOR PATTERN (choose one based on behaviour in the content, not assumptions about the person):
- "signaller": overconfident, no depth, no evidence, "hack" energy, promises more than delivered
- "translator": takes existing knowledge and simplifies it accessibly — this is legitimate and valuable
- "researcher_journalist": built this from research, investigation, or primary sources
- "original_thinker": presents a genuinely new idea or framework, not just repackaging
- "mixed": shows qualities of more than one pattern

VERDICT (choose one):
- "study_deeply": this is worth serious, focused attention
- "skim": useful as orientation or map, but seek depth elsewhere after
- "ignore": not worth your time — misleading, empty, or distorts the topic

FINAL_REASONING: 3–4 honest sentences explaining the overall verdict. Be direct. Reference specific things from the content. Name what it does well and what it fails at.

BETTER_ALTERNATIVES: 3 specific recommendations for where to go NEXT or INSTEAD. Be specific — name real types of sources, specific authors, books, or research areas known to cover this topic with depth. If you cannot name specifics, describe exactly what type of source to look for and why.

Respond ONLY with valid JSON (no fences):
{
  "claim_vs_delivery": 3,
  "claim_detected": "One sentence describing what the content claimed/promised",
  "delivery_gap": "One sentence on where it fell short of that claim, or 'Fully delivered' if it did",
  "depth_for_format": 4,
  "depth_note": "One sentence contextualising the depth score against the format",
  "credibility_signals": 2,
  "credibility_note": "One sentence on the key credibility behaviour detected",
  "usefulness_for_stage": 4,
  "usefulness_note": "One sentence on why it is or isn't useful given their stage",
  "author_pattern": "translator",
  "author_pattern_explanation": "One sentence explaining why this pattern was detected",
  "verdict": "skim",
  "final_reasoning": "3–4 sentence honest verdict",
  "better_alternatives": [
    "Specific recommendation 1 with reason",
    "Specific recommendation 2 with reason",
    "Specific recommendation 3 with reason"
  ],
  "what_you_will_get": "One sentence: what value the user CAN take from this content even if it scored low",
  "what_is_missing": "One sentence: the most important thing this content doesn't cover that the topic requires"
}`;

    const raw = await callGemini(prompt, SYSTEM_DEPTH_MODE);
    return parseGeminiJSON(raw);
  }

  // ─── Render result ────────────────────────────────────────
  function renderResult(r) {
    // Verdict banner
    const verdictConfig = {
      study_deeply: { label: 'Study Deeply',    color: 'var(--success)', bg: 'rgba(76,175,130,0.1)'  },
      skim:         { label: 'Skim It',          color: 'var(--gold)',    bg: 'rgba(201,168,76,0.1)'  },
      ignore:       { label: 'Ignore This',      color: 'var(--danger)',  bg: 'rgba(201,96,76,0.1)'   },
    };
    const vc = verdictConfig[r.verdict] || verdictConfig.skim;

    document.getElementById('depth-verdict-banner').style.background = vc.bg;
    document.getElementById('depth-verdict-banner').style.borderColor = vc.color;
    document.getElementById('depth-verdict-label').textContent = vc.label;
    document.getElementById('depth-verdict-label').style.color = vc.color;
    document.getElementById('depth-verdict-reasoning').textContent = r.final_reasoning || '';

    // Author pattern badge
    const patternLabels = {
      signaller:          'Signaller',
      translator:         'Translator',
      researcher_journalist: 'Researcher / Journalist',
      original_thinker:   'Original Thinker',
      mixed:              'Mixed',
    };
    const patternEl = document.getElementById('depth-author-pattern');
    patternEl.textContent = patternLabels[r.author_pattern] || r.author_pattern;
    patternEl.className = `author-type-badge author-${r.author_pattern}`;
    document.getElementById('depth-author-explanation').textContent = r.author_pattern_explanation || '';

    // Four axes
    const axes = [
      {
        id: 'axis-claim',
        label: 'Claim vs Delivery',
        score: r.claim_vs_delivery,
        note: r.delivery_gap === 'Fully delivered' ? '✓ ' + r.delivery_gap : r.delivery_gap,
        claim: r.claim_detected,
      },
      {
        id: 'axis-depth',
        label: 'Depth for Format',
        score: r.depth_for_format,
        note: r.depth_note,
      },
      {
        id: 'axis-cred',
        label: 'Credibility Signals',
        score: r.credibility_signals,
        note: r.credibility_note,
      },
      {
        id: 'axis-useful',
        label: 'Useful at Your Stage',
        score: r.usefulness_for_stage,
        note: r.usefulness_note,
      },
    ];

    axes.forEach(a => {
      const el = document.getElementById(a.id);
      if (!el) return;
      const pct = (a.score / 5) * 100;
      const color = a.score >= 4 ? 'var(--success)' : a.score >= 2.5 ? 'var(--gold)' : 'var(--danger)';
      el.querySelector('.axis-score').textContent = `${a.score}/5`;
      el.querySelector('.axis-score').style.color = color;
      const fill = el.querySelector('.axis-fill');
      fill.style.background = color;
      setTimeout(() => { fill.style.width = pct + '%'; }, 120);
      el.querySelector('.axis-note').textContent = a.note || '';
      const claimEl = el.querySelector('.axis-claim');
      if (claimEl) claimEl.textContent = a.claim ? `Claimed: "${a.claim}"` : '';
    });

    // What you get / what's missing
    document.getElementById('depth-what-you-get').textContent = r.what_you_will_get || '';
    document.getElementById('depth-what-missing').textContent = r.what_is_missing || '';

    // Better alternatives
    const altList = document.getElementById('depth-alternatives-list');
    altList.innerHTML = (r.better_alternatives || [])
      .map((alt, i) => `<li><span class="alt-num">${i+1}</span><span>${alt}</span></li>`)
      .join('');
  }

  function reset() {
    state = { content: '', topic: '', sourceType: 'article', format: '', priorLevel: '' };
    document.getElementById('depth-content').value = '';
    document.getElementById('depth-topic').value = '';
    if (document.getElementById('depth-format')) document.getElementById('depth-format').value = 'short-video';
    if (document.getElementById('depth-level')) document.getElementById('depth-level').value = 'beginner';
    document.querySelectorAll('.source-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.getElementById('depth-source-hint').textContent = SOURCE_HINTS.article;
    showStep('input');
  }

  return { selectSourceType, startSession, reset };
})();

// Global bindings
function selectSourceType(t) { DepthMode.selectSourceType(t); }
function startDepthSession()  { DepthMode.startSession(); }
