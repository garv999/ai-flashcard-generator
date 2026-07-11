// AI Study Coach — the analysis brain behind the assistant.
//
// Synthesizes everything the app already knows about a learner — spaced-
// repetition schedule (srs.js), quiz performance (deck.quiz), analytics
// (streaks / retention via analytics.js), mastery (deckProgress), and study
// plans (studyPlan.js) — into a single, prioritized BRIEFING with concrete
// recommendations: what to study next, where they're weak, today's workload,
// which review sessions to run, and how exam/interview prep is tracking.
//
// Pure and derived: the briefing is recomputed from live state every time it's
// shown, so it adapts automatically as the learner studies. Dependency-free, so
// it behaves identically in Demo mode and when signed in. The text helpers at
// the bottom let the chat assistant coach in natural language (offline mock +
// grounding snapshot for the LLM providers).

import { deckDueCount, nextDueAt, formatDueIn } from './srs.js'
import { deckProgress, currentStreak, retention, reviewsOn, dayKey } from './analytics.js'
import { buildPlan } from './studyPlan.js'

const SEC_PER_REVIEW = 20
const SEC_PER_NEW = 40
const WEAK_QUIZ_PCT = 60 // quiz best below this is a weak area
const LOW_RECALL = 0.8 // retention below this needs attention

const estMinutes = (reviews, news = 0) =>
  Math.max(0, Math.round((reviews * SEC_PER_REVIEW + news * SEC_PER_NEW) / 60))

// Per-deck snapshot the coach reasons over.
function deckInsight(deck, now) {
  const prog = deckProgress(deck) // { new, learning, young, mature, total, started, masteryPct }
  const plan = deck.plan ? buildPlan(deck, deck.plan, now) : null
  return {
    id: deck.id,
    topic: deck.topic,
    source: deck.source || 'topic',
    total: prog.total,
    newCount: prog.new,
    started: prog.started,
    mastered: prog.mature,
    masteryPct: prog.masteryPct,
    due: deckDueCount(deck, now),
    plan,
    quizBest: deck.quiz?.best?.pct ?? null,
    quizLast: deck.quiz?.last ?? null,
    nextDueMs: nextDueAt(deck, now),
  }
}

// ---------- the briefing ----------

// Build the full coach briefing across ALL decks + global stats.
export function buildCoachBriefing({ sets = [], stats, activeId = null, now = Date.now() }) {
  const insights = sets.map((d) => deckInsight(d, now))
  const totalCards = insights.reduce((s, x) => s + x.total, 0)
  const totalDue = insights.reduce((s, x) => s + x.due, 0)
  const plannedNew = insights.reduce((s, x) => s + (x.plan?.today?.newCards || 0), 0)
  const streak = currentStreak(stats, now)
  const recall = retention(stats) // 0..1 or null
  const reviewedToday = reviewsOn(stats, dayKey(now))
  const workloadMin = estMinutes(totalDue, plannedNew)

  // Earliest upcoming due time across all decks (for the "caught up" case).
  const futureDue = insights.map((d) => d.nextDueMs).filter((t) => t && t > now)
  const nextDueMs = futureDue.length ? Math.min(...futureDue) : null

  const recs = []

  for (const d of insights) {
    // Exam / interview prep — decks with a study plan approaching its target.
    if (d.plan && !d.plan.past) {
      const dl = d.plan.daysLeft
      const behind = d.plan.status === 'behind'
      if (dl <= 14 || behind) {
        const t = d.plan.today
        recs.push({
          id: `exam-${d.id}`,
          kind: 'exam',
          deckId: d.id,
          mode: 'plan',
          priority: 100 - Math.min(dl, 30) * 2 + (behind ? 25 : 0),
          title: `Prep for “${d.topic}”`,
          detail:
            dl === 0
              ? `Target is today — final review of ${t.reviews} card${t.reviews === 1 ? '' : 's'}.`
              : `${dl} day${dl === 1 ? '' : 's'} to your target${behind ? ' · behind schedule' : ''}. Today: ${t.newCards} new + ${t.reviews} reviews (~${t.minutes} min).`,
          cta: 'Open plan',
        })
      }
    }

    // Review sessions — cards due now on a deck already in progress. (A
    // brand-new deck is covered by the "Start" recommendation instead, to avoid
    // recommending the same session twice.)
    if (d.due > 0 && d.started > 0) {
      recs.push({
        id: `review-${d.id}`,
        kind: 'review',
        deckId: d.id,
        mode: 'review',
        priority: 40 + Math.min(d.due, 40),
        title: `Review “${d.topic}”`,
        detail: `${d.due} card${d.due === 1 ? '' : 's'} due now (~${estMinutes(d.due)} min).`,
        cta: 'Review',
      })
    }

    // Weak area — low quiz score.
    if (d.quizBest != null && d.quizBest < WEAK_QUIZ_PCT) {
      recs.push({
        id: `quiz-${d.id}`,
        kind: 'weak-quiz',
        deckId: d.id,
        mode: 'quiz',
        priority: 62 - d.quizBest / 5,
        title: `Weak spot: “${d.topic}” quiz`,
        detail: `Best score ${d.quizBest}% — retake to shore it up.`,
        cta: 'Take quiz',
      })
    }

    // Untouched deck — nothing started yet.
    if (d.started === 0 && d.total > 0) {
      recs.push({
        id: `start-${d.id}`,
        kind: 'new-deck',
        deckId: d.id,
        mode: 'review',
        priority: 34,
        title: `Start “${d.topic}”`,
        detail: `${d.total} new card${d.total === 1 ? '' : 's'} waiting — begin your first session.`,
        cta: 'Start',
      })
    }
  }

  // Broken streak with work outstanding — nudge to study today.
  if (!streak && (totalDue > 0 || plannedNew > 0)) {
    recs.push({
      id: 'streak',
      kind: 'streak',
      deckId: activeId,
      mode: 'review',
      priority: 47,
      title: 'Restart your streak',
      detail: `Study today to get back on track — ${totalDue} card${totalDue === 1 ? '' : 's'} due.`,
      cta: 'Study now',
    })
  }

  // Low overall recall — quality signal.
  if (recall != null && recall < LOW_RECALL && totalDue > 0) {
    recs.push({
      id: 'recall',
      kind: 'weak-retention',
      deckId: activeId,
      mode: 'review',
      priority: 50,
      title: 'Lift your recall',
      detail: `Your retention is ${Math.round(recall * 100)}%. Short, frequent reviews will raise it.`,
      cta: 'Review',
    })
  }

  // Fallbacks so there's always a clear next step.
  if (!sets.length) {
    recs.push({
      id: 'empty',
      kind: 'empty',
      deckId: null,
      mode: null,
      priority: 1,
      title: 'Create your first deck',
      detail: 'Generate flashcards from a topic or PDF and I’ll build your study plan.',
      cta: null,
    })
  } else if (!recs.length) {
    recs.push({
      id: 'caught-up',
      kind: 'caught-up',
      deckId: activeId,
      mode: 'browse',
      priority: 1,
      title: 'You’re all caught up',
      detail: nextDueMs
        ? `No reviews due right now. Next review in ${formatDueIn(nextDueMs, now)}.`
        : 'No reviews due right now — great work.',
      cta: null,
    })
  }

  recs.sort((a, b) => b.priority - a.priority)

  // A weak area is a deck failing on evidence: a low quiz score, or one that's
  // been substantially studied yet mastery still isn't sticking. A barely-
  // started deck is "new", not "weak", so it's excluded.
  const weakAreas = insights
    .filter(
      (d) =>
        (d.quizBest != null && d.quizBest < WEAK_QUIZ_PCT) ||
        (d.started >= d.total * 0.5 && d.masteryPct < 34 && d.due > 0),
    )
    .map((d) => ({
      id: d.id,
      topic: d.topic,
      reason:
        d.quizBest != null && d.quizBest < WEAK_QUIZ_PCT
          ? `Quiz best ${d.quizBest}%`
          : `${d.masteryPct}% mastered, ${d.due} due`,
    }))

  const exams = insights
    .filter((d) => d.plan && !d.plan.past)
    .map((d) => ({
      id: d.id,
      topic: d.topic,
      daysLeft: d.plan.daysLeft,
      status: d.plan.status,
      targetMs: d.plan.targetMs,
      todayMin: d.plan.today.minutes,
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)

  return {
    hasDecks: sets.length > 0,
    generatedAt: new Date(now).toISOString(),
    totals: { decks: sets.length, cards: totalCards, due: totalDue, plannedNew, reviewedToday },
    workloadMin,
    streak,
    recall,
    nextDueMs,
    recommendations: recs,
    topRecommendation: recs[0] || null,
    weakAreas,
    exams,
    insights,
    activeId,
  }
}

// ---------- natural-language helpers (for the chat assistant) ----------

// A compact snapshot injected into the LLM system prompt so any provider can
// coach with awareness of the learner's real progress.
export function coachContextText(b) {
  if (!b?.hasDecks) return 'The learner has no decks yet — encourage them to create one.'
  const lines = [
    `Decks: ${b.totals.decks}. Total cards: ${b.totals.cards}. Due for review now: ${b.totals.due}.`,
    `Estimated workload today: ~${b.workloadMin} min. Reviewed so far today: ${b.totals.reviewedToday}.`,
    `Study streak: ${b.streak} day${b.streak === 1 ? '' : 's'}.${b.recall != null ? ` Overall recall: ${Math.round(b.recall * 100)}%.` : ''}`,
  ]
  if (b.exams.length)
    lines.push(
      `Upcoming targets: ${b.exams.map((e) => `${e.topic} in ${e.daysLeft}d (${e.status})`).join('; ')}.`,
    )
  if (b.weakAreas.length)
    lines.push(`Weak areas: ${b.weakAreas.map((w) => `${w.topic} (${w.reason})`).join('; ')}.`)
  if (b.recommendations.length)
    lines.push(
      `Prioritized recommendations: ${b.recommendations
        .slice(0, 4)
        .map((r, i) => `${i + 1}) ${r.title} — ${r.detail}`)
        .join(' ')}`,
    )
  return lines.join('\n')
}

// Does this question call for coaching (vs. a document/deck content question)?
// Keywords are word-boundaried so a content word like "example" doesn't trip the
// "exam" intent, and "already" doesn't trip "ready".
const COACH_INTENT = new RegExp(
  [
    '\\b(what|which|where)\\b.{0,40}\\b(study|review|next|focus|start|work on|weak|struggl)',
    '\\bweak\\b',
    '\\bworkload\\b',
    '\\bhow (long|much|many)\\b.{0,30}\\b(study|review|today|day)',
    '\\bexams?\\b',
    '\\binterview',
    '\\bready\\b',
    '\\bprepar',
    '\\bon track\\b',
    '\\bbehind\\b',
    '\\bcatch up\\b',
    '\\bschedule\\b',
    '\\bplan my\\b',
    '\\bmy (progress|plan|streak|stats|day)\\b',
    '\\bshould i (study|review|do)\\b',
    "what'?s next",
    '\\bprioriti',
  ].join('|'),
  'i',
)

export function isCoachingQuestion(text) {
  return COACH_INTENT.test(String(text || ''))
}

const recLine = (r) => `• ${r.title} — ${r.detail}`

// Offline coach reply, grounded entirely in the briefing. Deterministic, so
// Demo mode gives real, data-driven coaching with no API key.
export function coachReply(question, b) {
  const q = String(question || '').toLowerCase()
  if (!b?.hasDecks) {
    return `You don't have any decks yet. Generate a set of flashcards from a topic or upload a PDF, and I'll analyze your progress and build a personalized study plan.`
  }
  const top = b.recommendations.slice(0, 3)

  // Weak areas.
  if (/\bweak\b|struggl|bad at|worst|improve/.test(q)) {
    if (!b.weakAreas.length) {
      return `Nothing looks weak right now — your quiz scores and mastery are holding up. Keep your reviews current to stay there.`
    }
    return (
      `Your weakest areas right now:\n\n` +
      b.weakAreas.map((w) => `• ${w.topic} — ${w.reason}`).join('\n') +
      `\n\nI'd focus a session there next. Want me to point you to one?`
    )
  }

  // Workload / time today.
  if (/workload|how (long|much|many)|time|today|minutes/.test(q)) {
    return (
      `Today's workload: about ${b.workloadMin} min — ${b.totals.due} card${b.totals.due === 1 ? '' : 's'} due for review` +
      (b.totals.plannedNew ? ` plus ${b.totals.plannedNew} new card${b.totals.plannedNew === 1 ? '' : 's'} from your plan` : '') +
      `. You've done ${b.totals.reviewedToday} so far.` +
      (top.length ? `\n\nStart with:\n${top.map(recLine).join('\n')}` : '')
    )
  }

  // Exam / interview readiness.
  if (/\bexams?\b|\binterview|\bready\b|\bprepar|\bon track\b|\bbehind\b|\btarget\b/.test(q)) {
    if (!b.exams.length) {
      return `You don't have a target date set yet. Open the Plan tab on a deck to set your exam or interview date, and I'll track whether you're on pace and tell you the daily workload to stay on track.`
    }
    return (
      `Here's how your prep is tracking:\n\n` +
      b.exams
        .map(
          (e) =>
            `• ${e.topic}: ${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'} to go — ${e.status}${e.todayMin ? ` (about ${e.todayMin} min today)` : ''}.`,
        )
        .join('\n') +
      `\n\n${b.exams.some((e) => e.status === 'behind') ? 'You’re behind on at least one — I’d prioritize it today.' : 'Keep the daily reviews up and you’ll be ready.'}`
    )
  }

  // What to study next / default coaching.
  if (!top.length) {
    return `You're all caught up — no reviews are due right now. ${b.nextDueMs ? `Your next review comes up in ${b.workloadMin ? '' : ''}a little while.` : 'Great work!'}`
  }
  return (
    `Based on your progress, here's what I'd do next:\n\n` +
    top.map(recLine).join('\n') +
    `\n\nToday's total is about ${b.workloadMin} min (${b.totals.due} due).` +
    ` You're on a ${b.streak}-day streak — ${b.streak > 0 ? 'keep it alive' : 'study today to start a new one'}.`
  )
}
