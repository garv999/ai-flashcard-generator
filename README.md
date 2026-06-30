# AI Flashcard Generator

A real-time web application that turns any topic into a study-ready deck of question-and-answer flashcards in seconds. Enter a subject, and an AI model instantly generates a set of cards you can flip through to study. Every deck is saved in the browser, so users can return anytime — no account and no backend required.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- **Real-time AI generation** — enter a topic and receive a full deck on demand, with a skeleton loading state and clear error handling.
- **Works out of the box (Demo mode)** — a built-in mock generator means the app runs instantly with no API key.
- **Bring your own key** — switch to OpenAI (`gpt-4o-mini`) or Anthropic Claude (`claude-sonnet-5`) in Settings to generate real AI cards.
- **Interactive 3D flip cards** — click a card to flip it with a smooth animation and reveal the answer.
- **Local persistence** — all sets are stored in the browser's `localStorage`, so study material survives refreshes.
- **Deck management** — browse, select, switch between, and delete saved sets.
- **Adjustable deck size** — choose between 3 and 20 cards per set.
- **Input validation** — enforces a minimum topic length for higher-quality prompts.
- **Premium, responsive dark UI** — a token-based design system with the Inter typeface, gradient accents, custom SVG iconography, a deck progress bar, and polished micro-interactions, from desktop down to mobile.

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Then open the URL Vite prints (default: http://localhost:5173).

The app opens in Demo mode and works immediately — no key required.

### Using a Real AI Provider (Optional)

1. Click the provider chip in the top-right (it reads "Demo mode").
2. Choose OpenAI or Claude.
3. Paste your API key. It is stored only in the browser's `localStorage` and sent directly to the provider.

> **Security note:** Calling AI APIs directly from the browser exposes the key to anyone using that browser session. For a production deployment, route requests through a small backend that holds the key server-side (see Future Improvements). Never commit an API key to a public repository.

---

## How It Works

1. Enter a topic (minimum 10 characters) — for example, "The French Revolution" or "React useEffect hook".
2. The app sends a prompt requesting N question-and-answer pairs and parses the JSON response.
3. The generated set is rendered as an interactive deck and saved to `localStorage`.
4. Select any saved set and click cards to flip between question and answer.

---

## Accessibility

The interface is built to be usable with a keyboard and assistive technologies:

- **Keyboard navigation** — Left/Right arrow keys move between cards; Enter or Space flips the focused card.
- **Visible focus rings** on every interactive element via `:focus-visible`.
- **ARIA semantics** — labelled controls, a `progressbar` for deck progress, `role="alert"` errors, and `aria-live` regions for validation and loading.
- **Accessible dialog** — the Settings modal uses `role="dialog"`/`aria-modal`, moves focus on open, and closes on Escape.
- **Reduced motion** — animations are minimised when `prefers-reduced-motion` is set.

---

## Project Structure

```
ai-flashcard-generator/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx                 # App entry point
    ├── App.jsx                  # State and orchestration
    ├── index.css                # Design system (tokens, dark theme, animations)
    ├── components/
    │   ├── Header.jsx
    │   ├── TopicForm.jsx        # Topic input and validation
    │   ├── Sidebar.jsx          # Saved-set list
    │   ├── StudyView.jsx        # Deck navigation and progress
    │   ├── Flashcard.jsx        # 3D flip card
    │   ├── SettingsModal.jsx    # Provider, API key, deck size
    │   └── Icons.jsx            # Reusable SVG icon components
    ├── services/
    │   └── aiService.js         # Demo / OpenAI / Anthropic generators
    └── utils/
        └── storage.js           # localStorage helpers
```

---

## Tech Stack

- **React 18** (Hooks) — component-driven, real-time UI
- **Vite 5** — fast development server and build tooling
- **OpenAI / Anthropic APIs** — optional real flashcard generation
- **localStorage** — client-side persistence
- **Plain CSS** — a token-based design system with custom properties, a CSS 3D flip animation, and no UI framework
- **Inline SVG icons** — dependency-free, no icon library

---

## Future Improvements

- **Backend proxy** so API keys are never exposed to the browser.
- **User accounts and cloud sync** (Firebase / Supabase) to share decks across devices.
- **Spaced-repetition system (SRS)** — Anki-style SM-2 scheduling for better retention.
- **Edit and reorder cards** after generation.
- **Export and import** decks (JSON, CSV, Anki).
- **Multiple question types** — multiple-choice, true/false, fill-in-the-blank.
- **Progress tracking and statistics** — streaks, accuracy, per-deck mastery.
- **Streaming responses** so cards appear progressively as they generate.

---

## License

Released under the [MIT License](LICENSE).
