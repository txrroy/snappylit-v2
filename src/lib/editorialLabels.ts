import type { Article, ArticleFlag } from '@/types/article';

export const FLAG_PLAIN_REASONS: Record<ArticleFlag, string> = {
  SNIPPET_ONLY: 'Only a snippet was available, so facts could not be checked.',
  LOADED_LANGUAGE: 'Contains loaded or emotional phrasing that may need neutral wording.',
  ONE_SIDED: 'Presents only one perspective without attribution or balance.',
  GRAPHIC_DETAIL: 'Includes graphic detail that may violate G-rated guidelines.',
  TOO_COMPLEX: 'Reading level is above Grade 6 and needs simpler wording.',
};

export const FLAG_SHORT_LABELS: Record<ArticleFlag, string> = {
  SNIPPET_ONLY: 'Snippet only',
  LOADED_LANGUAGE: 'Loaded language',
  ONE_SIDED: 'One-sided',
  GRAPHIC_DETAIL: 'Graphic detail',
  TOO_COMPLEX: 'Too complex',
};

export function getFlagPlainReason(flag: ArticleFlag): string {
  return FLAG_PLAIN_REASONS[flag] ?? 'Flagged for editorial review.';
}

export function getFlagShortLabel(flag: ArticleFlag): string {
  return FLAG_SHORT_LABELS[flag] ?? flag;
}

export interface SubScoreResult {
  label: 'Accuracy' | 'Neutrality' | 'Safety' | 'Readability' | 'Confidence';
  value: number;
}

export interface KidsTopicCheckResult {
  /** True when the check is active and not yet confirmed by an editor. */
  triggered: boolean;
  /** True when the story matched a sensitive keyword or sensitive flag, regardless of confirmation. */
  rawTriggered: boolean;
  /** The matched keyword or topic label, if any. */
  matchedTerm: string | null;
}

export type QueueStatus = 'Blocked' | 'Needs sign-off';

export interface TodayCounts {
  total: number;
  published: number;
  needsReview: number;
  rejected: number;
  blocked: number;
  signOff: number;
}

const KIDS_SENSITIVE_TERMS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(murder|murders|murdered)\b/i, label: 'murder' },
  { pattern: /\b(kill|killed|killing|killings)\b/i, label: 'killing/death' },
  { pattern: /\b(death|deaths|dead|fatal|fatalities)\b/i, label: 'death' },
  { pattern: /\b(suicide|suicidal|self-harm)\b/i, label: 'self-harm' },
  { pattern: /\b(shooting|shootings|gunfire|massacre)\b/i, label: 'gun violence' },
  { pattern: /\b(violence|violent|assault|abuse|abused)\b/i, label: 'violence/abuse' },
  { pattern: /\b(terror|terrorist|terrorism|bombing|explosion)\b/i, label: 'terrorism/war' },
  { pattern: /\b(war|warfare|airstrike|airstrikes|casualties)\b/i, label: 'war' },
  { pattern: /\b(kidnap|kidnapped|abducted|trafficking)\b/i, label: 'abduction' },
  { pattern: /\b(cult|prison|sentenced)\b/i, label: 'crime/prison' },
  { pattern: /\b(hunger crisis|famine|starvation)\b/i, label: 'hunger crisis' },
];

/**
 * Returns the lowest Judge sub-score (accuracy, neutrality, safety, readability),
 * or falls back to overall confidence_score if sub-scores are unavailable.
 */
export function getLowestSubScore(article: Article): SubScoreResult {
  const scores = article.scores;
  if (scores) {
    const candidates: Array<{ label: SubScoreResult['label']; value: number }> = [
      { label: 'Accuracy', value: scores.accuracy },
      { label: 'Neutrality', value: scores.neutrality },
      { label: 'Safety', value: scores.safety },
      { label: 'Readability', value: scores.readability },
    ];
    const entries = candidates.filter(
      (e) => typeof e.value === 'number' && !Number.isNaN(e.value)
    );

    if (entries.length > 0) {
      return entries.reduce((min, cur) => (cur.value < min.value ? cur : min), entries[0]);
    }
  }
  return {
    label: 'Confidence',
    value: typeof article.confidence_score === 'number' ? article.confidence_score : 0,
  };
}

/**
 * Checks whether a story involves sensitive topics for children (death, violence, crime, etc.).
 * Remains triggered (blocking) until article.kids_topic_confirmed is true.
 */
export function getKidsTopicCheck(article: Article): KidsTopicCheckResult {
  const haystack = [article.ai_headline, article.ai_summary, article.source_text, article.topic]
    .filter(Boolean)
    .join(' ');

  let matchedTerm: string | null = null;
  for (const entry of KIDS_SENSITIVE_TERMS) {
    const match = haystack.match(entry.pattern);
    if (match) {
      matchedTerm = match[0];
      break;
    }
  }

  const rawTriggered = Boolean(matchedTerm) || Boolean(article.sensitive);
  if (rawTriggered && !matchedTerm) {
    matchedTerm = article.topic || 'sensitive topic';
  }

  return {
    triggered: rawTriggered && !article.kids_topic_confirmed,
    rawTriggered,
    matchedTerm,
  };
}

/**
 * Returns true if the story failed an automated check or has an unconfirmed kids' topic flag.
 */
export function isArticleBlocked(article: Article): boolean {
  if ((article.flags?.length ?? 0) > 0) return true;
  if (article.judge_pass === false) return true;
  if (getLowestSubScore(article).value < 70) return true;
  if (getKidsTopicCheck(article).triggered) return true;
  return false;
}

/**
 * Maps a draft article to one of the two simplified queue statuses.
 */
export function getQueueStatus(article: Article): QueueStatus {
  return isArticleBlocked(article) ? 'Blocked' : 'Needs sign-off';
}

/**
 * Always returns a plain-language explanation of why a draft is in the review queue.
 */
export function getQueueReviewReason(article: Article): string {
  const flags = article.flags ?? [];
  const kidsCheck = getKidsTopicCheck(article);
  if (flags.length > 0) {
    const primary = getFlagPlainReason(flags[0]);
    const extraCount = flags.length - 1 + (kidsCheck.triggered ? 1 : 0);
    return extraCount > 0 ? `${primary} (+${extraCount} more flag)` : primary;
  }
  if (kidsCheck.triggered) {
    return `Sensitive topic for children (matched "${kidsCheck.matchedTerm}"); confirm age-appropriate wording.`;
  }
  if (article.judge_pass === false) {
    return 'Judge held this draft for manual verification before publishing.';
  }
  const lowest = getLowestSubScore(article);
  if (lowest.value < 70) {
    return `${lowest.label} score is ${lowest.value}/100 (below 70); edit before publishing.`;
  }
  if (lowest.value < 90) {
    return `${lowest.label} score is ${lowest.value}/100; verify before sign-off.`;
  }
  return 'Passed automated checks; awaiting final editor sign-off before publishing.';
}

/**
 * Single source of truth for today's article counts.
 * Invariant: published + needsReview + rejected === total.
 */
export function computeTodayCounts(articles: Article[], today: string): TodayCounts {
  const todayArticles = articles.filter((a) => a.date === today);
  const published = todayArticles.filter((a) => a.status === 'published').length;
  const drafts = todayArticles.filter((a) => a.status === 'draft');
  const rejected = todayArticles.filter((a) => a.status === 'rejected').length;
  const needsReview = drafts.length;
  const blocked = drafts.filter(isArticleBlocked).length;
  const signOff = needsReview - blocked;
  const total = published + needsReview + rejected;

  return { total, published, needsReview, rejected, blocked, signOff };
}

/**
 * Sorts review queue items by severity first (Blocked before Needs sign-off),
 * then lowest sub-score ascending, then oldest age first.
 */
export function sortReviewQueue(items: Article[]): Article[] {
  return [...items].sort((a, b) => {
    const aBlocked = isArticleBlocked(a) ? 0 : 1;
    const bBlocked = isArticleBlocked(b) ? 0 : 1;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;

    const aScore = getLowestSubScore(a).value;
    const bScore = getLowestSubScore(b).value;
    if (aScore !== bScore) return aScore - bScore;

    const aTs = Date.parse(getArticleTimestamp(a) ?? a.date) || 0;
    const bTs = Date.parse(getArticleTimestamp(b) ?? b.date) || 0;
    return aTs - bTs;
  });
}

/**
 * Returns the latest timestamp ISO string from an article's pipeline trace or lifecycle fields.
 */
export function getArticleTimestamp(article: Article): string | null {
  const trace = article.pipeline_trace;
  if (trace && trace.length > 0) {
    const last = trace[trace.length - 1];
    if (last?.at) return last.at;
  }
  return article.edited_at || article.approved_at || article.rejected_at || null;
}

/**
 * Formats relative age (e.g. "14m ago", "2h ago") or falls back to the edition date.
 */
export function formatRelativeAge(isoOrDate: string | null, fallbackDate: string): string {
  if (!isoOrDate) return fallbackDate;
  const ms = Date.parse(isoOrDate);
  if (Number.isNaN(ms)) return fallbackDate;
  const diffMin = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
