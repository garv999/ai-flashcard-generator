// Exam attempt persistence. Mirrors the Quiz record so it rides the existing
// deck persistence (localStorage in Demo, Firestore signed-in) with no new
// storage system:
//   deck.exam = { best: Attempt, last: Attempt }
//   Attempt   = { pct, correct, total, at, focusWeak, length, source, weakAccuracy }
//
// Exams are kept SEPARATE from SRS and the ML/evaluation training logs by design
// — an exam never reschedules a card or writes a review/eval event. It only
// records its own attempt here.

// Fold a finished attempt into a deck's exam record (best + last). Pure.
export function foldExamResult(prev, attempt) {
  const best = prev?.best && prev.best.pct >= attempt.pct ? prev.best : attempt
  return { best, last: attempt }
}

// True when `attempt` beats the previously stored best.
export function isNewBestExam(prev, attempt) {
  return !prev?.best || attempt.pct > prev.best.pct
}

// Read a deck's exam history (or null).
export function examStats(deck) {
  return deck?.exam || null
}
