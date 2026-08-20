// Offline (Demo mode) tutor answers.
//
// Deterministic, no API key, no network — so Demo mode is a genuine adaptive
// tutor, not a stub. Every answer is built from the SAME retrieved passages,
// semantic flashcards and learner state the LLM path receives, then shaped by
// mode + adaptation. RECOMMEND reuses coach.js's coachReply so recommendations
// are identical to the existing coach.

import { coachReply } from '../coach.js'

// ---- small text helpers (local, dependency-free) ----
const clean = (t) => (t || '').replace(/\s+/g, ' ').trim()

function sentences(text, n = 2) {
  const s = clean(text)
    .split(/(?<=[.!?])\s+/)
    .slice(0, n)
    .join(' ')
    .trim()
  return s || clean(text).slice(0, 320)
}

// Best passage text from a retrieval result set (or the overview text).
function topPassage(retrieved, n = 2) {
  const r = retrieved?.results?.[0]
  if (r?.chunk?.text) return sentences(r.chunk.text, n)
  if (retrieved?.text) return sentences(retrieved.text, n)
  return ''
}

// A short, adaptation-aware lead-in so Demo answers visibly change with level.
function levelLead(level, topic) {
  switch (level) {
    case 'new':
      return `Let's build this up from scratch, since it's new to you.`
    case 'weak':
      return `Let's take this slowly — it's been a shaky one for you.`
    case 'partial':
      return `You've seen this before, so here's the concise version.`
    case 'strong':
      return `You've got the basics down, so let's go a level deeper.`
    case 'missed':
      return `This one has tripped you up recently — let's clear up the confusion.`
    default:
      return `Here's what your material on “${topic}” says.`
  }
}

// The main entry: compose an offline answer for a resolved mode.
export function demoTutorAnswer({ mode, style, question, deck, retrieved, cards, state, focus, grounding, recommendations }) {
  const topic = deck?.topic || 'this deck'
  const passage = topPassage(retrieved, 3)
  const topCard = cards && cards.length ? cards[0] : null

  // Document-grounded intent but nothing usable was retrieved → say so honestly.
  if (grounding?.insufficient && !topCard) {
    return (
      `The available study material doesn't cover “${clean(question)}” in enough detail for me to answer it reliably from your ${deck?.source === 'pdf' ? 'PDF' : 'deck'}. ` +
      `Try rephrasing, or add material on this to your deck and I'll ground the answer in it.`
    )
  }

  switch (mode) {
    case 'RECOMMEND':
      return demoRecommend(question, recommendations, state)

    case 'HINT':
      return demoHint(topic, passage, topCard)

    case 'PRACTICE':
      return demoPractice(topic, passage, topCard)

    case 'MISCONCEPTION':
      return demoMisconception(topic, state, passage, topCard)

    case 'REVIEW':
      return demoReview(topic, state, question)

    case 'EXPLAIN':
    default:
      return demoExplain({ style, topic, passage, topCard, focus })
  }
}

// RECOMMEND — explain the recommendation engine's ranked output (the engine
// ranks; the tutor narrates). Falls back to the coach briefing if the engine
// returned nothing (e.g. an empty library).
function demoRecommend(question, rec, state) {
  if (!rec?.cards?.length) return coachReply(question, state?.briefing)
  const src = rec.source === 'ML' ? 'your personalized model' : 'your SRS schedule'
  const lines = rec.cards.slice(0, 4).map((c, i) => `${i + 1}. ${c.question} — ${c.reason}`)
  const topics = rec.topics.length
    ? `\n\nBy topic: ${rec.topics.slice(0, 3).map((t) => `${t.topic} (${t.priority} priority, ${Math.round(t.avgForgetting * 100)}% risk)`).join('; ')}.`
    : ''
  return (
    `Here's what to study next, ranked by ${src}:\n\n` +
    lines.join('\n') +
    topics +
    `\n\nStart at the top — that's the highest-value review right now.`
  )
}

// EXPLAIN — quote the material, pitched to the learner's level.
function demoExplain({ style, topic, passage, topCard, focus }) {
  const lead = levelLead(focus?.level, topic)
  const body = passage || (topCard ? `${topCard.question} — ${topCard.answer}` : '')
  if (!body) {
    return `I don't have material on “${topic}” to draw on yet. Generate a few flashcards or upload a PDF and I'll explain it from your own material.`
  }
  if (style === 'summarize') {
    return `${lead}\n\nIn short: ${sentences(body, 2)}`
  }
  if (style === 'example') {
    return `${lead}\n\n${sentences(body, 2)}\n\nPicture it applied to a concrete case — that's the idea in action.`
  }
  if (style === 'compare' && topCard) {
    return `${lead}\n\n• ${sentences(body, 1)}\n• ${topCard ? `${topCard.question} — ${sentences(topCard.answer, 1)}` : ''}\n\nThe key difference is what each one is really about.`
  }
  const tail =
    focus?.level === 'partial'
      ? `\n\nQuick check: can you say this back in your own words?`
      : focus?.level === 'strong'
        ? `\n\nSince you know this, try applying it to a harder case.`
        : `\n\nWant an example or a practice question on this?`
  return `${lead}\n\n${sentences(body, 3)}${tail}`
}

// HINT — nudge without revealing the answer. Never includes the card's answer.
function demoHint(topic, passage, topCard) {
  const src = topCard?.question || passage || topic
  const keyword = clean(src).split(' ').slice(0, 5).join(' ')
  return (
    `Here's a hint (I won't give it away):\n\n` +
    `Think about what “${keyword}…” is really getting at — focus on the core idea rather than the details. ` +
    `What role does it play, and what would change if it weren't there? Give it a try, then ask me to explain if you're stuck.`
  )
}

// PRACTICE — one question grounded in the material, answer withheld.
function demoPractice(topic, passage, topCard) {
  if (topCard) {
    return `Here's a practice question on “${topic}”:\n\n${topCard.question}\n\nTake a shot at it — reply with your answer and I'll check it.`
  }
  const stem = clean(passage).split(' ').slice(0, 8).join(' ')
  return `Here's a practice question from your material:\n\nIn your own words, explain what the material means by “${stem}…”.\n\nAnswer when ready and I'll give you feedback.`
}

// MISCONCEPTION — reference a recently-missed concept and clear it up.
function demoMisconception(topic, state, passage, topCard) {
  const missed = state?.deck?.forgotten?.[0] || state?.deck?.weakConcepts?.[0]
  const concept = missed?.concept || topCard?.question || topic
  const truth = topCard ? sentences(topCard.answer, 2) : sentences(passage, 2)
  return (
    `Let's clear up “${concept}”, since it's tripped you up recently.\n\n` +
    `A common mix-up is to reach for a surface detail instead of the underlying idea. ` +
    (truth ? `What's actually true: ${truth}\n\n` : `\n`) +
    `Try this to lock it in: explain the concept without looking, then check it against your card.`
  )
}

// REVIEW — connect the question to weak / forgotten / due cards for this deck.
function demoReview(topic, state, question) {
  const d = state?.deck
  const weak = (d?.weakConcepts || []).slice(0, 3).map((c) => `• ${c.concept} — ${c.reasons?.[0] || 'needs reinforcement'}`)
  const forgotten = (d?.forgotten || []).slice(0, 3).map((c) => `• ${c.concept} — recently forgotten`)
  const lines = [...forgotten, ...weak]
  if (!lines.length) {
    return `Nothing looks fragile in “${topic}” right now${d?.dueCount ? ` — though you have ${d.dueCount} card(s) due to review.` : " — you're on top of it."}`
  }
  return (
    `Tied to what you asked, here's what to review in “${topic}” first:\n\n` +
    lines.join('\n') +
    `${d?.dueCount ? `\n\nYou also have ${d.dueCount} card(s) due — start there.` : ''}`
  )
}
