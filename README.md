# AI Flashcard Generator

Turn any topic or PDF into a flashcard deck, then learn it with spaced
repetition, quizzes, a study plan, semantic search, and an adaptive AI tutor. An
on-device ML model predicts which cards you are about to forget, and a
recommendation engine ranks what to study next. Runs instantly in the browser
with no account, and syncs to the cloud when you sign in.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-ffca28?logo=firebase&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

**Generate**
- Topic to deck on demand, or from a PDF (up to 20 MB, text extracted in-browser).
- Works offline in Demo mode with no API key; switch to OpenAI or Claude in Settings (keys stay server-side).

**Study**
- Browse, SM-2 spaced repetition (`Again / Hard / Good / Easy`), and auto-generated multiple-choice quizzes.
- Personalized study plan with a "Recommended next" panel.
- Semantic search across your whole library, with keyword fallback.

**Adaptive AI Tutor**
- Per-deck tutor with Explain, Practice, Hint, Review, Misconception, and Recommend modes that adapt to what you already know.
- RAG over uploaded PDFs: answers cite page and section, and say so plainly when the material does not cover a question.
- Renders Mermaid diagrams and tables when a concept is clearer visually.

**Learning Intelligence**
- On-device ML (logistic regression, no ML framework) predicts each card's forgetting probability with reasons, learning from your own reviews. Falls back to an SRS estimate and labels every prediction ML or SRS. No learning data leaves your device.
- Recommendation engine ranks what to study next from ten real signals, with typed reasons, surfaced in Analytics and the study plan.
- Analytics: streaks, retention, mastery, activity heatmap, and weak-concept insights.

**Accounts**
- Demo mode saves everything in `localStorage`; sign in (Google or email) to sync via Firestore.

---

## Getting Started

```bash
npm install
npm run dev
```

Opens in Demo mode (default http://localhost:5173) with no key or account needed.

**Real AI (optional):** copy `.env.example` to `.env`, set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` (no `VITE_` prefix), then pick the provider in Settings. Calls are proxied through `api/ai.js`, so keys never reach the browser.

**Cloud sync (optional):** set the `VITE_FIREBASE_*` values in `.env` and deploy `firestore.rules`. Without them, the app runs fully in Demo mode.

---

## Project Structure

```
ai-flashcard-generator/
├── index.html
├── package.json
├── vite.config.js
├── firestore.rules              # Firestore security rules (per-user data)
├── .env.example                 # Firebase + server-side key template
├── api/
│   └── ai.js                    # Serverless proxy (injects provider keys)
├── public/
│   ├── favicon.svg
│   └── iphone.glb               # 3D hero model
└── src/
    ├── main.jsx                 # App entry point
    ├── App.jsx                  # State and orchestration
    ├── index.css                # Design system (tokens, dark theme, animations)
    ├── components/
    │   ├── Header.jsx  Sidebar.jsx  TopicForm.jsx  PdfUpload.jsx
    │   ├── StudyView.jsx  Flashcard.jsx  ReviewSession.jsx  QuizSession.jsx
    │   ├── StudyPlanPanel.jsx           # Adaptive study plan
    │   ├── ChatAssistant.jsx            # AI study coach (chat + RAG + visuals)
    │   ├── MessageContent.jsx  Mermaid.jsx   # Rich message + diagram rendering
    │   ├── AnalyticsModal.jsx            # Study analytics dashboard
    │   ├── LearningIntelligenceModal.jsx # Learning-intelligence dashboard
    │   ├── AuthModal.jsx  SettingsModal.jsx
    │   ├── CinematicHero.jsx  Iphone3D.jsx  Ambient.jsx  HeroStats.jsx
    │   └── Icons.jsx                     # Reusable SVG icons
    ├── services/
    │   ├── aiService.js         # Demo / OpenAI / Anthropic generation + coach
    │   ├── aiProxy.js           # Client wrapper for the /api/ai proxy
    │   ├── pdfService.js        # In-browser PDF text extraction
    │   ├── srs.js               # SM-2 spaced-repetition scheduling
    │   ├── quiz.js              # Multiple-choice quiz engine
    │   ├── analytics.js         # Streaks, retention, mastery, activity
    │   ├── studyPlan.js         # Adaptive day-by-day plan
    │   ├── coach.js             # Study-coach analysis + recommendations
    │   ├── intelligence.js      # Learning-intelligence engine
    │   ├── diagrams.js          # Offline Mermaid / table generation
    │   ├── chunking.js  embeddings.js  retrieval.js   # RAG pipeline
    │   ├── semanticSearch.js    # Vector search over the deck library
    │   ├── tutor/               # Adaptive AI tutor (intent, state, context, prompt)
    │   │   ├── intent.js  learningState.js  context.js
    │   │   ├── prompt.js  demo.js  index.js
    │   ├── ml/                  # Forgetting-prediction model (client-side ML)
    │   │   ├── features.js      # Feature engineering + SRS fallback
    │   │   ├── logistic.js      # Logistic regression (from scratch)
    │   │   ├── dataset.js       # Review-event log + training data
    │   │   ├── model.js         # Train / cache / version / persist
    │   │   └── index.js         # Predictions + prioritization + analytics
    │   ├── recommend/           # Learning recommendation engine
    │   │   ├── signals.js  score.js  explain.js
    │   │   ├── topics.js  index.js
    │   ├── chat.js  decks.js    # Conversation + deck persistence
    │   └── firebase.js          # Firebase Auth + Firestore init
    ├── hooks/                   # Auth, scroll/animation, semantic-search hooks
    └── utils/                   # storage + auth-error helpers
```

---

## Tech Stack

React 18 and Vite 5 on the front end; Firebase (Google/email auth + Firestore
sync); optional OpenAI/Anthropic generation via a serverless proxy that keeps
keys server-side. RAG and semantic search use a dependency-free embedding and
cosine-retrieval stack; the forgetting model is a from-scratch, client-side
logistic regression; the recommendation engine is a deterministic signal-based
ranker. Also pdf.js, Mermaid, React Three Fiber, GSAP + Lenis, and a plain-CSS
design system with inline SVG icons.

Accessible by default: keyboard navigation, visible focus rings, ARIA semantics,
focus-managed dialogs, and reduced-motion support.

---

## License

Released under the [MIT License](LICENSE).
