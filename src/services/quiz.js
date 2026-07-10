// Quiz mode — turn a deck of { question, answer } flashcards into a
// multiple-choice quiz. Dependency-free and pure so it works identically in
// Demo mode and for signed-in users.
//
// Each question reuses a card's question as the prompt and its answer as the
// correct option; up to three plausible distractors are drawn from OTHER cards'
// answers in the same deck (deduped, case-insensitive). Small decks degrade
// gracefully to fewer options.
//
// Persistence: a deck may carry a `quiz` record describing the user's history:
//   quiz = { best: Attempt, last: Attempt }
//     Attempt = { pct, correct, total, at }   (pct 0..100, at = ISO string)
// It rides on the deck object, so it persists through the existing deck
// persistence (localStorage in Demo mode, Firestore when signed in).

const MAX_OPTIONS = 4 // 1 correct + up to 3 distractors
const normalize = (s) => String(s ?? '').trim().toLowerCase()

// Fisher–Yates shuffle (returns a new array; does not mutate the input).
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Build a single MCQ from card `i`, drawing distractors from the whole deck.
// Returns null when there aren't enough distinct answers to form a choice.
function buildQuestion(cards, i) {
  const card = cards[i]
  if (!card || !card.question || !card.answer) return null

  const correct = String(card.answer)
  const seen = new Set([normalize(correct)])
  const distractors = []

  // Candidate distractors: every other card's answer, shuffled, deduped.
  for (const other of shuffle(cards)) {
    if (distractors.length >= MAX_OPTIONS - 1) break
    if (other === card) continue
    const ans = other?.answer
    if (!ans) continue
    const key = normalize(ans)
    if (seen.has(key)) continue
    seen.add(key)
    distractors.push(String(ans))
  }

  if (distractors.length === 0) return null // no way to make a choice

  const options = shuffle([correct, ...distractors])
  return {
    id: `q-${i}`,
    cardIndex: i,
    question: String(card.question),
    answer: correct,
    // The answer doubles as the explanation — it's the fact the card teaches.
    explanation: correct,
    options,
    correctIndex: options.indexOf(correct),
  }
}

// Build a quiz from a deck. Pass `cardIndices` to quiz only a subset (used by
// "retry incorrect"); otherwise every card that can form a question is used.
// The question order is shuffled for variety.
export function buildQuiz(deck, cardIndices = null) {
  const cards = deck?.cards || []
  const pool =
    Array.isArray(cardIndices) && cardIndices.length
      ? cardIndices.filter((i) => cards[i])
      : cards.map((_, i) => i)

  const questions = shuffle(pool)
    .map((i) => buildQuestion(cards, i))
    .filter(Boolean)

  return questions
}

// Can this deck be quizzed at all? (Need at least two distinct answers.)
export function canQuiz(deck) {
  const answers = new Set(
    (deck?.cards || []).map((c) => normalize(c?.answer)).filter(Boolean),
  )
  return answers.size >= 2
}

// Fold a finished attempt into a deck's quiz record, keeping the best score and
// the most recent attempt. Pure — returns a new record.
export function foldQuizResult(prev, attempt) {
  const best = prev?.best && prev.best.pct >= attempt.pct ? prev.best : attempt
  return { best, last: attempt }
}

// True when `attempt` beats the previously stored best (or there was none).
export function isNewBest(prev, attempt) {
  return !prev?.best || attempt.pct > prev.best.pct
}
