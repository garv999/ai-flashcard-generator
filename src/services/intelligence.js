// AI Learning Intelligence — a deeper analytical layer on top of the platform.
//
// Where the coach (coach.js) gives deck-level, in-the-moment guidance, this
// engine mines ALL of the learner's signals — spaced-repetition state (srs),
// quiz performance (deck.quiz), study analytics (stats), mastery, and AI chat
// interactions (chats) — to surface CONCEPT-level intelligence:
//   • weak concepts            (specific cards you struggle with)
//   • frequently forgotten     (cards that keep lapsing / lowest recall)
//   • predicted learning gaps  (cards/areas about to be forgotten)
//   • revision priorities      (what to revise first, ranked)
//   • flashcard suggestions    (where adding cards would help most)
//   • AI-interaction analysis  (what you keep asking about)
//   • personalized insights    (natural-language synthesis of the above)
//
// Pure and derived from live state, so the dashboard adapts automatically.
// Reuses analytics.js / srs.js rather than recomputing. Dependency-free.

import { cardMaturity, deckProgress, dayKey } from './analytics.js'

const DAY = 24 * 60 * 60 * 1000
const DEFAULT_EASE = 2.5
const MIN_EASE = 1.3
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

// Concept label from a card's question ("What is mitosis?" → "Mitosis").
function concept(question, max = 52) {
  const s = String(question || '')
    .replace(/^\s*(what|which|who|where|when|why|how)\b.*?\b(is|are|was|were|do|does|did|can)\b/i, '')
    .replace(/^\s*(define|describe|explain|list|name|give)\b/i, '')
    .replace(/\?+\s*$/, '')
    .replace(/^\s*(the|a|an)\s+/i, '')
    .trim()
  const out = (s || question || '').replace(/\s+/g, ' ').trim()
  return out.length > max ? out.slice(0, max - 1).trim() + '…' : out
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'and', 'or', 'for', 'on', 'what', 'why', 'how', 'are',
  'was', 'were', 'that', 'this', 'it', 'as', 'be', 'with', 'about', 'explain', 'give', 'me', 'can',
  'you', 'please', 'from', 'deck', 'does', 'do', 'my', 'i', 'im', 'tell', 'show', 'more', 'some',
  'which', 'who', 'when', 'where', 'these', 'those', 'they', 'them', 'his', 'her', 'their',
])
const tokenize = (s) =>
  (s || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) || []

// ---------- per-card analysis ----------

// Analyze one studied card's fragility. Returns null for brand-new cards (no
// recall history to reason about yet).
function analyzeCard(deck, card, index, now) {
  const s = card?.srs
  if (!s) return null
  const ease = typeof s.ease === 'number' ? s.ease : DEFAULT_EASE
  const reps = s.reps || 0
  const interval = s.interval || 0
  const maturity = cardMaturity(card) // learning | young | mature
  const dueMs = s.due ? new Date(s.due).getTime() : now
  const lastMs = s.last ? new Date(s.last).getTime() : null
  const overdueDays = Math.max(0, (now - dueMs) / DAY)
  const dueInDays = (dueMs - now) / DAY
  const lapsed = reps === 0 && !!lastMs // was rated "Again" (schedule reset)

  // Weakness 0..~1.2: low ease dominates; lapses, immaturity and overdue add.
  const easeWeak = clamp((DEFAULT_EASE - ease) / (DEFAULT_EASE - MIN_EASE), 0, 1)
  const maturityWeak = maturity === 'learning' ? 0.15 : maturity === 'young' ? 0.07 : 0
  const overdueWeak = Math.min(0.25, overdueDays * 0.02)
  const score = 0.45 * easeWeak + (lapsed ? 0.3 : 0) + maturityWeak + overdueWeak

  const reasons = []
  if (ease <= 2.0) reasons.push('Low recall strength')
  if (lapsed) reasons.push('Recently forgotten')
  if (maturity === 'learning') reasons.push('Still learning')
  if (overdueDays >= 1) reasons.push(`Overdue ${Math.round(overdueDays)}d`)
  if (!reasons.length) reasons.push('Needs reinforcement')

  return {
    deckId: deck.id,
    deckTopic: deck.topic,
    cardIndex: index,
    question: card.question,
    concept: concept(card.question),
    ease: Math.round(ease * 100) / 100,
    maturity,
    reps,
    interval,
    overdueDays,
    dueInDays,
    lapsed,
    score,
    reasons,
  }
}

// ---------- windowed retention (trend) ----------

function windowRetention(stats, fromAgo, toAgo, now) {
  let r = 0
  let recalled = 0
  for (let d = toAgo; d < fromAgo; d++) {
    const b = stats?.days?.[dayKey(now - d * DAY)]
    if (!b) continue
    r += b.r || 0
    recalled += (b.h || 0) + (b.g || 0) + (b.e || 0)
  }
  return r ? recalled / r : null
}

function retentionTrend(stats, now) {
  const current = windowRetention(stats, 7, 0, now)
  const previous = windowRetention(stats, 14, 7, now)
  let direction = 'no-data'
  if (current != null && previous != null) {
    const d = current - previous
    direction = d > 0.05 ? 'improving' : d < -0.05 ? 'declining' : 'steady'
  } else if (current != null) {
    direction = 'steady'
  }
  return {
    current,
    previous,
    delta: current != null && previous != null ? current - previous : null,
    direction,
  }
}

// ---------- AI-interaction analysis ----------

function analyzeInteractions(chats, byId) {
  const perDeck = []
  const termCounts = new Map()
  let totalQuestions = 0
  for (const [deckId, entry] of Object.entries(chats || {})) {
    const msgs = entry?.messages || []
    const questions = msgs.filter((m) => m?.role === 'user' && m.text)
    if (!questions.length) continue
    totalQuestions += questions.length
    perDeck.push({ deckId, topic: byId.get(deckId)?.topic || 'a deck', count: questions.length })
    for (const q of questions) {
      for (const w of new Set(tokenize(q.text))) termCounts.set(w, (termCounts.get(w) || 0) + 1)
    }
  }
  perDeck.sort((a, b) => b.count - a.count)
  const topTerms = [...termCounts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term, count]) => ({ term, count }))
  return { totalQuestions, perDeck, topTerms, mostDiscussed: perDeck[0] || null }
}

// ---------- the report ----------

export function buildIntelligence({ sets = [], stats, chats = {}, now = Date.now() }) {
  const byId = new Map(sets.map((d) => [d.id, d]))

  // Per-card fragility across all decks.
  const analyzed = []
  let totalCards = 0
  let studied = 0
  let mastered = 0
  for (const deck of sets) {
    for (let i = 0; i < (deck.cards || []).length; i++) {
      totalCards++
      const card = deck.cards[i]
      if (cardMaturity(card) === 'mature') mastered++
      const a = analyzeCard(deck, card, i, now)
      if (a) {
        studied++
        analyzed.push(a)
      }
    }
  }
  const masteryPct = totalCards ? Math.round((mastered / totalCards) * 100) : 0
  const hasData = studied > 0

  // Weak concepts — the most fragile studied cards.
  const weakConcepts = analyzed
    .filter((c) => c.score >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  // Frequently forgotten — cards that have lapsed or have the lowest recall.
  const forgottenTopics = analyzed
    .filter((c) => c.lapsed || c.ease <= 2.15)
    .sort((a, b) => (b.lapsed - a.lapsed) || a.ease - b.ease)
    .slice(0, 6)

  // Predicted learning gaps — fragile cards due soon (about to be forgotten),
  // plus a declining-retention signal.
  const atRiskCards = analyzed
    .filter((c) => c.dueInDays <= 3 && (c.ease < 2.2 || c.maturity === 'learning' || c.lapsed))
    .sort((a, b) => b.score - a.score)
  const trend = retentionTrend(stats, now)
  const learningGaps = []
  // Group at-risk cards by deck for a compact gap list.
  const riskByDeck = new Map()
  for (const c of atRiskCards) {
    const g = riskByDeck.get(c.deckId) || { deckId: c.deckId, deckTopic: c.deckTopic, count: 0, sample: c.concept }
    g.count++
    riskByDeck.set(c.deckId, g)
  }
  for (const g of [...riskByDeck.values()].sort((a, b) => b.count - a.count)) {
    learningGaps.push({
      type: 'at-risk',
      deckId: g.deckId,
      title: `${g.count} concept${g.count === 1 ? '' : 's'} at risk in “${g.deckTopic}”`,
      detail: `These are due soon and still fragile (e.g. “${g.sample}”). Review them before they lapse.`,
    })
  }
  if (trend.direction === 'declining') {
    learningGaps.unshift({
      type: 'trend',
      deckId: null,
      title: 'Your recall is slipping',
      detail: `Retention fell to ${Math.round(trend.current * 100)}% this week (from ${Math.round(
        trend.previous * 100,
      )}%). Shorter, more frequent reviews will reverse it.`,
    })
  }

  // Revision priorities — deck-level ranking of what to revise first.
  const revisionPriorities = sets
    .map((deck) => {
      const cards = analyzed.filter((c) => c.deckId === deck.id)
      const overdue = cards.filter((c) => c.overdueDays >= 1).length
      const fragile = cards.filter((c) => c.ease < 2.1 || c.lapsed).length
      const prog = deckProgress(deck)
      const quizBest = deck.quiz?.best?.pct ?? null
      const avgEase = cards.length ? cards.reduce((s, c) => s + c.ease, 0) / cards.length : DEFAULT_EASE
      let priority = overdue * 2 + fragile * 1.5
      if (quizBest != null && quizBest < 60) priority += 15
      if (prog.masteryPct < 40 && prog.started > 0) priority += 8
      const reasons = []
      if (overdue) reasons.push(`${overdue} overdue`)
      if (fragile) reasons.push(`${fragile} fragile`)
      if (quizBest != null && quizBest < 60) reasons.push(`quiz ${quizBest}%`)
      return {
        deckId: deck.id,
        deckTopic: deck.topic,
        priority,
        overdue,
        fragile,
        masteryPct: prog.masteryPct,
        avgEase: Math.round(avgEase * 100) / 100,
        reason: reasons.join(' · ') || 'Keep it fresh',
      }
    })
    .filter((d) => d.priority > 0)
    .sort((a, b) => b.priority - a.priority)

  // AI-interaction analysis.
  const aiInteraction = analyzeInteractions(chats, byId)

  // Flashcard suggestions — where adding cards would help most.
  const cardSuggestions = []
  const suggested = new Set()
  const pushSuggestion = (topic, reason, deckId) => {
    const key = topic.toLowerCase()
    if (suggested.has(key)) return
    suggested.add(key)
    cardSuggestions.push({ topic, reason, deckId })
  }
  // Thin, low-mastery decks.
  for (const deck of sets) {
    const prog = deckProgress(deck)
    if ((deck.cards?.length || 0) < 15 && prog.started > 0 && prog.masteryPct < 45) {
      pushSuggestion(
        deck.topic,
        `Only ${deck.cards.length} cards and ${prog.masteryPct}% mastered — more cards would deepen it.`,
        deck.id,
      )
    }
  }
  // Heavily-questioned decks (engagement signal from AI chats).
  for (const d of aiInteraction.perDeck.slice(0, 3)) {
    if (d.count >= 3) {
      pushSuggestion(d.topic, `You've asked ${d.count} questions here — extra cards would reinforce it.`, d.deckId)
    }
  }
  // The single weakest concept — a focused practice set.
  if (weakConcepts[0]) {
    pushSuggestion(
      weakConcepts[0].concept,
      `Your weakest concept (in “${weakConcepts[0].deckTopic}”) — a focused set would help.`,
      weakConcepts[0].deckId,
    )
  }
  const trimmedSuggestions = cardSuggestions.slice(0, 4)

  // Strongest deck (for a positive insight).
  const deckMastery = sets
    .map((d) => ({ id: d.id, topic: d.topic, ...deckProgress(d) }))
    .filter((d) => d.started > 0)
    .sort((a, b) => b.masteryPct - a.masteryPct)
  const strongest = deckMastery[0] || null

  // ---------- personalized insights (natural language) ----------
  const insights = []
  if (weakConcepts.length) {
    insights.push(
      `Your weakest concept right now is “${weakConcepts[0].concept}” in “${weakConcepts[0].deckTopic}” — ${weakConcepts[0].reasons[0].toLowerCase()}.`,
    )
  }
  if (forgottenTopics.some((c) => c.lapsed)) {
    const lapses = forgottenTopics.filter((c) => c.lapsed).length
    insights.push(
      `You've recently forgotten ${lapses} card${lapses === 1 ? '' : 's'} — these keep resetting, so give them extra passes.`,
    )
  }
  if (trend.direction === 'improving') {
    insights.push(
      `Your recall is improving — ${Math.round(trend.current * 100)}% this week, up from ${Math.round(
        trend.previous * 100,
      )}%. Keep the momentum.`,
    )
  } else if (trend.direction === 'declining') {
    insights.push(
      `Your recall dipped to ${Math.round(trend.current * 100)}% this week — prioritize the at-risk cards below to recover.`,
    )
  }
  if (learningGaps.some((g) => g.type === 'at-risk')) {
    const atRiskTotal = atRiskCards.length
    insights.push(
      `${atRiskTotal} concept${atRiskTotal === 1 ? ' is' : 's are'} predicted to lapse soon — a short review session now prevents the forgetting.`,
    )
  }
  if (aiInteraction.mostDiscussed && aiInteraction.mostDiscussed.count >= 2) {
    insights.push(
      `You ask the most about “${aiInteraction.mostDiscussed.topic}” (${aiInteraction.mostDiscussed.count} questions) — a sign it deserves more practice.`,
    )
  }
  if (strongest && strongest.masteryPct >= 50) {
    insights.push(`Your strongest area is “${strongest.topic}” at ${strongest.masteryPct}% mastery — nicely done.`)
  }
  if (!insights.length) {
    insights.push(
      hasData
        ? 'Keep reviewing to build a clearer picture — your weak spots and trends will sharpen with more data.'
        : 'Study a few cards and your personalized learning insights will appear here.',
    )
  }

  return {
    generatedAt: new Date(now).toISOString(),
    hasData,
    summary: {
      totalCards,
      studied,
      mastered,
      masteryPct,
      weakCount: weakConcepts.length,
      atRisk: atRiskCards.length,
      forgotten: forgottenTopics.length,
      retentionTrend: trend,
      strongest,
    },
    weakConcepts,
    forgottenTopics,
    learningGaps: learningGaps.slice(0, 6),
    revisionPriorities,
    cardSuggestions: trimmedSuggestions,
    aiInteraction,
    insights,
  }
}
