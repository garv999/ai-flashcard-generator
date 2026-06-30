# 🧠 AI Flashcard Generator

A real-time web app that turns **any topic** into a study-ready deck of question-and-answer flashcards in seconds. Type a subject, and an AI model instantly generates a set of cards you can flip through to study. Every deck is saved in your browser, so you can come back anytime — no account, no backend required.

![Tech](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- **Real-time AI generation** — enter a topic and get a full deck of cards on demand, with live loading and error states.
- **Works out of the box (Demo mode)** — a built-in mock generator means the app runs instantly with **no API key**.
- **Bring your own key** — switch to **OpenAI** (`gpt-4o-mini`) or **Anthropic Claude** (`claude-sonnet-5`) in Settings to generate real AI cards.
- **Interactive 3D flip cards** — click a card to flip it and reveal the answer.
- **Local persistence** — all sets are stored in the browser's `localStorage`, so your study material survives refreshes.
- **Deck management** — browse, select, switch between, and delete saved sets.
- **Adjustable deck size** — choose 3–20 cards per set.
- **Input validation** — enforces a minimum topic length for higher-quality prompts.
- **Responsive dark UI** — clean, modern design that works on desktop and mobile.

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Then open the URL Vite prints (default **http://localhost:5173**).

The app opens in **Demo mode** and works immediately — no key needed.

### Using a real AI provider (optional)

1. Click the provider chip in the top-right (it says **Demo mode**).
2. Choose **OpenAI** or **Claude**.
3. Paste your API key. It is stored only in your browser's `localStorage` and sent directly to the provider.

> ⚠️ **Security note:** Calling AI APIs directly from the browser exposes your key to anyone using that browser session. For a real production deployment, route requests through a small backend that holds the key server-side (see *Future Improvements*). Never commit an API key to a public repository.

---

## 🛠️ How It Works

1. **Enter a topic** (minimum 10 characters) — e.g. *"The French Revolution"*, *"React useEffect hook"*.
2. The app sends a prompt asking the AI for N question/answer pairs and parses the JSON response.
3. The generated set is rendered as an interactive deck and saved to `localStorage`.
4. Select any saved set and click cards to flip between question and answer.

---

## 📂 Project Structure

```
ai-flashcard-generator/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx                 # App entry point
    ├── App.jsx                  # State + orchestration
    ├── index.css                # Styling (dark theme, flip animation)
    ├── components/
    │   ├── Header.jsx
    │   ├── TopicForm.jsx        # Topic input + validation
    │   ├── Sidebar.jsx          # Saved-set list
    │   ├── StudyView.jsx        # Deck navigation
    │   ├── Flashcard.jsx        # 3D flip card
    │   └── SettingsModal.jsx    # Provider + API key + deck size
    ├── services/
    │   └── aiService.js         # Demo / OpenAI / Anthropic generators
    └── utils/
        └── storage.js           # localStorage helpers
```

---

## 🧰 Tech Stack

- **React 18** (Hooks) — component-driven, real-time UI
- **Vite 5** — fast dev server and build tooling
- **OpenAI / Anthropic APIs** — optional real flashcard generation
- **localStorage** — client-side persistence
- **Plain CSS** — custom dark theme with a CSS 3D flip animation

---

## 🔮 Future Improvements

- **Backend proxy** so API keys are never exposed to the browser.
- **User accounts & cloud sync** (Firebase / Supabase) to share decks across devices.
- **Spaced-repetition system (SRS)** — Anki-style SM-2 scheduling for better retention.
- **Edit & reorder cards** after generation.
- **Export / import** decks (JSON, CSV, Anki).
- **Multiple question types** — multiple-choice, true/false, fill-in-the-blank.
- **Progress tracking & stats** — streaks, accuracy, per-deck mastery.
- **Streaming responses** so cards appear progressively as they generate.

---

## 📜 License

MIT — free to use, modify, and learn from.
