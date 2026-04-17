# Athena — Master What You Learn

> *Learning is repeated recall — not repeated exposure.*

Athena is an AI-powered mastery learning PWA. It tests you, not your ability to read notes. Built around active recall, adaptive difficulty, and diagnostic feedback.

---

## Modes

### 📄 Knowledge Mode
Upload a PDF or paste your notes. Athena extracts the key concepts and generates an adaptive quiz session.

- You choose how many questions
- Difficulty adjusts automatically based on your performance
- After each answer: immediate, honest feedback
- Session report: strong areas, weak areas, what to revisit

### 💻 Coding Mode
Tell Athena what you've been learning. She maps the full curriculum as a checklist — you mark what you've covered. Then she assigns you a real application project.

- HTML-only → semantic structure projects
- CSS-only → styling challenges with starter HTML
- JavaScript → functionality projects with starter shell
- Live code editor with split preview
- Code graded 0–10 with strengths, weaknesses, and reference solution

---

## Stack

- Vanilla HTML / CSS / JS (zero dependencies beyond PDF.js)
- Google Gemini API (`gemini-2.0-flash` with fallback)
- PDF.js (client-side, no server)
- Vercel for hosting
- PWA: manifest + service worker

## Setup

1. Clone / deploy to Vercel
2. Visit the app
3. Enter your [Gemini API key](https://aistudio.google.com) (stored in session only, never sent anywhere else)
4. Choose your mode

---

## Philosophy

Athena never explains unless asked. She probes. She tests. She tells you where you're weak — not to discourage, but because that's how mastery is built. The tool is designed to make passive consumption uncomfortable and active recall rewarding.

---

*Built by Impeesa · Deployed on Vercel*
