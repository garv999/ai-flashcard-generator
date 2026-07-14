# AI Flashcard Generator

An AI-powered study platform that turns any topic (or an uploaded PDF) into a
study-ready deck of flashcards, then helps you actually learn the material with
spaced repetition, quizzes, a personalized study plan, an AI study coach, and a
learning-intelligence dashboard. It works instantly in the browser with no
account required, and optionally syncs to the cloud when you sign in.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-ffca28?logo=firebase&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

### Generate

- **Real-time AI generation:** enter a topic and receive a full deck on demand, with a skeleton loading state and clear error handling.
- **Generate from a PDF:** drop in a PDF (up to 20 MB), pick a page range, and turn its contents into flashcards. Text is extracted in the browser with `pdf.js`.
- **Works out of the box (Demo mode):** a built-in, offline mock generator means the app runs instantly with no API key.
- **Real AI when you want it:** switch to OpenAI (`gpt-4o-mini`) or Anthropic Claude (`claude-sonnet-5`) in Settings. Provider keys live server-side behind a proxy and never reach the browser.

### Study

- **Browse mode:** flip through cards with a 3D animation and a deck progress bar.
- **Review mode (spaced repetition):** an Anki-style SM-2 scheduler (`Again / Hard / Good / Easy`) shows the right cards at the right time and tracks due counts.
- **Quiz mode:** auto-generated multiple-choice questions with instant feedback, a scored results screen, and retry-incorrect / restart options. Best score and last attempt persist per deck.
- **Personalized study plan:** set a target date, daily study time, and confidence level to get an adaptive day-by-day roadmap (new cards + reviews per day, milestones, projected finish) that updates as you study.

### AI Study Coach

- **Chat assistant per deck / PDF:** ask questions, get explanations, simplify topics, generate examples, compare concepts, or build mnemonics.
- **Retrieval-Augmented Generation (RAG):** uploaded PDFs are chunked, embedded, and stored so the assistant answers from the **whole document**, not just the generated cards. Conversation history supports natural follow-ups.
- **Progress-aware coaching:** the coach analyzes your spaced-repetition schedule, quiz results, analytics, and study plan to recommend what to study next, surface weak areas, estimate today's workload, and track exam/interview readiness.
- **Visual learning:** when a concept is clearer shown visually, the assistant renders Mermaid **flowcharts, trees, timelines**, and **comparison tables**; simple questions stay as text.

### Learning Intelligence

- **Dedicated insights dashboard:** mines spaced-repetition data, quiz performance, analytics, and AI interactions to detect **weak concepts**, identify **frequently forgotten** cards, **predict learning gaps**, rank **revision priorities**, **recommend additional flashcards**, and generate **personalized insights**, with one-click actions to review or generate.
- **Study analytics:** streaks, retention, per-deck mastery, card-maturity breakdown, and a GitHub-style activity heatmap.

### Accounts & persistence

- **Demo mode:** decks, progress, quizzes, plans, chats, and retrieval indexes are all saved in the browser's `localStorage`.
- **Sign in to sync:** Google or email/password auth (Firebase). Signed-in data lives in Firestore and syncs across devices in real time; local Demo data migrates on first sign-in.

### Experience

- **Cinematic 3D hero:** a WebGL iPhone (React Three Fiber) that rotates on scroll, with a graphite/titanium design system.
- **Premium, responsive dark UI:** token-based design, custom SVG iconography, smooth scrolling, and polished micro-interactions from desktop down to mobile.

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Then open the URL Vite prints (default: http://localhost:5173). The app opens in
**Demo mode** and works immediately, with no key and no account required.

### Using a Real AI Provider (Optional)

Provider keys live **server-side** and are never exposed to the browser. Every
OpenAI/Anthropic call (generation, the study coach, and PDF embeddings) is
proxied through a small serverless function (`api/ai.js`) that injects the key
from an environment variable.

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`.
   Do **not** add a `VITE_` prefix, so the keys stay out of the client bundle.
2. Run `npm run dev` (Vite mounts the proxy locally) or deploy to a host that runs
   `api/` as serverless functions (e.g. Vercel), setting the same env vars there.
3. In the app, open Settings and choose OpenAI or Claude. Providers without a
   server-side key show as "Not configured on server".

> **Security note:** The browser only ever talks to the app's own `/api/ai`
> endpoint. The key is injected server-side and is never present in the client
> bundle, `localStorage`, or any outbound browser request. Never commit a real
> key; `.env` is gitignored.

### Enabling Cloud Sync (Optional)

Sign-in and cross-device sync use Firebase. Copy `.env.example` to `.env` and fill
in your Firebase project values (`VITE_FIREBASE_*`), then deploy the Firestore
security rules in `firestore.rules`. Without these, the app still runs fully in
Demo mode.

---

## How It Works

1. Enter a topic or upload a PDF; the app requests question-and-answer pairs and parses the JSON response (PDFs are chunked to stay within token limits).
2. The deck is rendered and saved: to `localStorage` in Demo mode, or to Firestore when signed in.
3. Study with Browse, Review (SRS), or Quiz; set a study plan; and open the coach to ask questions grounded in the deck or the full PDF.
4. As you study, the analytics and Learning Intelligence dashboards recompute automatically from your live progress.

---

## Accessibility

- **Keyboard navigation:** arrow keys move between cards; number/letter keys answer quizzes; Enter/Space advance.
- **Visible focus rings** on every interactive element via `:focus-visible`.
- **ARIA semantics:** labelled controls, `progressbar` elements, `role="alert"` errors, and `aria-live` regions.
- **Accessible dialogs:** modals and the coach drawer use `role="dialog"`/`aria-modal`, move focus on open, and close on Escape.
- **Reduced motion:** animations are minimised when `prefers-reduced-motion` is set.

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
    │   ├── chat.js  decks.js    # Conversation + deck persistence
    │   └── firebase.js          # Firebase Auth + Firestore init
    ├── hooks/                   # Auth + scroll/animation hooks
    └── utils/                   # storage + auth-error helpers
```

---

## Tech Stack

- **React 18** (Hooks): component-driven, real-time UI
- **Vite 5:** fast dev server and build tooling
- **Serverless proxy** (`api/ai.js`): keeps provider keys server-side, out of the browser
- **Firebase:** Google/email auth and Firestore cloud sync
- **OpenAI / Anthropic APIs:** optional real generation, coaching, and embeddings
- **RAG:** dependency-free chunking, embeddings (OpenAI `text-embedding-3-small` or a local hashing embedder), and cosine-similarity retrieval, stored quantized for efficiency
- **pdf.js:** in-browser PDF text extraction
- **Mermaid** (lazy-loaded): flowchart / tree / timeline diagram rendering
- **React Three Fiber + Drei:** the WebGL 3D hero
- **GSAP + Lenis:** scroll-driven animation and smooth scrolling
- **Plain CSS:** a token-based design system with no UI framework
- **Inline SVG icons:** dependency-free, no icon library

---

## Future Improvements

- **Edit and reorder cards** after generation.
- **Export and import** decks (JSON, CSV, Anki).
- **Streaming responses** so cards appear progressively as they generate.
- **Shared/collaborative decks** across users.

---

## License

Released under the [MIT License](LICENSE).
