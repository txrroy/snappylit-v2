import type { Article, ArticleFlag } from '@/types/article';

export const FLAG_PLAIN_REASONS: Record<ArticleFlag, string> = {
  SNIPPET_ONLY: 'Only a snippet was available, so facts could not be checked.',
  LOADED_LANGUAGE: 'Contains loaded or emotional phrasing that needs neutral wording.',
  ONE_SIDED: 'Presents only one side of a dispute without balance.',
  GRAPHIC_DETAIL: 'Includes graphic detail that violates G-rated guidelines.',
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
  /** True when the Judge flagged actual summary wording (GRAPHIC_DETAIL or safety < 85) and not yet confirmed. */
  triggered: boolean;
  /** True when the story was marked sensitive or Judge flagged safety/graphic wording. */
  rawTriggered: boolean;
  /** The reason or topic label, if any. */
  matchedTerm: string | null;
}

/**
 * Fix 2: Three states everywhere. Drop "Blocked". Nothing is blocked, because the editor can still publish.
 */
export type EditorialState =
  | 'Ready to approve'
  | 'Needs a check'
  | 'Could not verify';

export type QueueStatus = EditorialState;

export interface TodayCounts {
  total: number;
  published: number;
  needsReview: number;
  rejected: number;
  readyToApprove: number;
  needsACheck: number;
  couldNotVerify: number;
  blocked: number;
  signOff: number;
}

/**
 * Fix 13: Report scores honestly. Show "Not verified" for snippet-only stories.
 */
export function isSnippetOnlyUnverified(article: Article): boolean {
  return (
    Boolean(article.used_fallback_snippet) ||
    Boolean((article.flags ?? []).includes('SNIPPET_ONLY'))
  );
}

/**
 * Fix 4: Expire pending stories after 48 hours.
 */
export function isPendingExpired(article: Article, referenceDateStr?: string): boolean {
  if (article.status !== 'draft') return false;
  const refMs = referenceDateStr
    ? Date.parse(`${referenceDateStr}T23:59:59Z`)
    : Date.now();
  const articleTs = getArticleTimestamp(article);
  const articleMs = articleTs
    ? Date.parse(articleTs)
    : Date.parse(`${article.date}T12:00:00Z`);
  if (Number.isNaN(articleMs) || Number.isNaN(refMs)) return false;
  const ageHours = (refMs - articleMs) / (1000 * 60 * 60);
  return ageHours > 48;
}

/**
 * Returns the lowest Judge sub-score (accuracy, neutrality, safety, readability),
 * or falls back to overall confidence_score if sub-scores are unavailable.
 */
export function getLowestSubScore(article: Article): SubScoreResult {
  const scores = article.scores;
  if (scores) {
    const candidates: { label: SubScoreResult['label']; value: number }[] = [
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
 * Fix 4: Stop matching keywords for "sensitive". Let the Judge flag the summary's actual wording
 * (GRAPHIC_DETAIL or safety score < 85).
 */
export function getKidsTopicCheck(article: Article): KidsTopicCheckResult {
  const flags = article.flags ?? [];
  const hasGraphicFlag = flags.includes('GRAPHIC_DETAIL');
  const safetyScore = article.scores?.safety ?? 100;
  const judgeFlaggedWording = hasGraphicFlag || safetyScore < 85;

  const matchedTerm = hasGraphicFlag
    ? 'graphic detail in summary'
    : safetyScore < 85
      ? `safety score ${safetyScore}/100`
      : article.sensitive
        ? `${article.topic || 'sensitive'} topic (calm wording passed)`
        : null;

  return {
    triggered: judgeFlaggedWording && !article.kids_topic_confirmed,
    rawTriggered: judgeFlaggedWording || Boolean(article.sensitive),
    matchedTerm,
  };
}

/**
 * Fix 2: Use three states everywhere: "Ready to approve", "Needs a check", "Could not verify".
 * - "Could not verify": snippet-only stories or stories with unsupported claims.
 * - "Needs a check": stories with Judge flags (TOO_COMPLEX, ONE_SIDED, LOADED_LANGUAGE, GRAPHIC_DETAIL)
 *   or low Judge sub-scores (< 85) or Judge pass === false.
 * - "Ready to approve": passed full-text verification with no flags (note: calm sensitive-topic stories
 *   whose summary wording passed Judge safety are Ready to approve!).
 */
export function getEditorialState(article: Article): EditorialState {
  const flags = article.flags ?? [];
  const hasUnsupportedClaim = (article.claims ?? []).some(
    (c) => c.evidence.trim().toLowerCase() === 'unsupported'
  );

  if (
    article.used_fallback_snippet ||
    flags.includes('SNIPPET_ONLY') ||
    hasUnsupportedClaim
  ) {
    return 'Could not verify';
  }

  const nonSnippetFlags = flags.filter((f) => f !== 'SNIPPET_ONLY');
  const lowest = getLowestSubScore(article);

  if (
    nonSnippetFlags.length > 0 ||
    lowest.value < 85 ||
    article.judge_pass === false
  ) {
    return 'Needs a check';
  }

  return 'Ready to approve';
}

export function getEditorialStateTone(
  state: EditorialState
): 'success' | 'warning' | 'danger' {
  if (state === 'Ready to approve') return 'success';
  if (state === 'Needs a check') return 'warning';
  return 'danger';
}

export function isArticleBlocked(article: Article): boolean {
  return getEditorialState(article) !== 'Ready to approve';
}

export function getQueueStatus(article: Article): EditorialState {
  return getEditorialState(article);
}

/**
 * Fix 3: Show one plain reason per row.
 */
export function getQueueReviewReason(article: Article): string {
  const flags = article.flags ?? [];
  const hasUnsupportedClaim = (article.claims ?? []).some(
    (c) => c.evidence.trim().toLowerCase() === 'unsupported'
  );

  if (article.used_fallback_snippet || flags.includes('SNIPPET_ONLY')) {
    const otherFlags = flags.filter((f) => f !== 'SNIPPET_ONLY');
    if (otherFlags.length > 0) {
      return `Only a snippet was available, so facts could not be checked · ${getFlagShortLabel(otherFlags[0])}`;
    }
    return 'Only a snippet was available, so facts could not be checked.';
  }

  if (hasUnsupportedClaim) {
    return 'Contains a claim that could not be matched to a quote in the source text.';
  }

  if (flags.length > 0) {
    const primary = getFlagPlainReason(flags[0]);
    const extraCount = flags.length - 1;
    return extraCount > 0 ? `${primary} (+${extraCount} more)` : primary;
  }

  const lowest = getLowestSubScore(article);
  if (lowest.value < 85) {
    return `${lowest.label} score is ${lowest.value}/100 — needs a quick check before publishing.`;
  }

  if (article.judge_pass === false) {
    return 'Judge flagged this draft for a quick check before publishing.';
  }

  const outletCount = article.source_count ?? 1;
  return outletCount > 1
    ? `Verified against full article (${outletCount} outlets). Ready to approve.`
    : 'Verified against full source article. Ready to approve.';
}

/**
 * Fix 9: Put a "Why this needs you" card at the top of the detail view.
 * The agent states the problem and its request in one sentence.
 */
export function getWhyThisNeedsYouMessage(article: Article): {
  needed: boolean;
  state: EditorialState;
  headline: string;
  sentence: string;
} {
  const state = getEditorialState(article);
  const flags = article.flags ?? [];
  const hasUnsupportedClaim = (article.claims ?? []).some(
    (c) => c.evidence.trim().toLowerCase() === 'unsupported'
  );

  if (state === 'Ready to approve') {
    return {
      needed: false,
      state,
      headline: 'Ready to approve',
      sentence:
        'I verified every claim against the full article and confirmed Grade-6 G-rated wording.',
    };
  }

  if (article.used_fallback_snippet || flags.includes('SNIPPET_ONLY')) {
    return {
      needed: true,
      state: 'Could not verify',
      headline: 'Why this needs you · Could not verify',
      sentence:
        'I could not open the full article, so I wrote this from a short RSS snippet. Please check it against the source before publishing.',
    };
  }

  if (hasUnsupportedClaim) {
    return {
      needed: true,
      state: 'Could not verify',
      headline: 'Why this needs you · Could not verify',
      sentence:
        'One sentence in my draft could not be matched to a direct quote in the source text. Please check the highlighted sentence against the source.',
    };
  }

  if (flags.includes('TOO_COMPLEX')) {
    return {
      needed: true,
      state: 'Needs a check',
      headline: 'Why this needs you · Needs a check',
      sentence:
        'My summary uses terms above a Grade 6 reading level. Click "Simplify" below or edit the wording before publishing.',
    };
  }

  if (flags.includes('ONE_SIDED')) {
    return {
      needed: true,
      state: 'Needs a check',
      headline: 'Why this needs you · Needs a check',
      sentence:
        'This story covers a dispute, and my draft only states one side’s view. Click "Add the other side" or check the balance.',
    };
  }

  if (flags.includes('LOADED_LANGUAGE')) {
    return {
      needed: true,
      state: 'Needs a check',
      headline: 'Why this needs you · Needs a check',
      sentence:
        'The Judge spotted loaded phrasing in my draft. Click "Neutralize wording" or edit the phrasing directly.',
    };
  }

  if (flags.includes('GRAPHIC_DETAIL')) {
    return {
      needed: true,
      state: 'Needs a check',
      headline: 'Why this needs you · Needs a check',
      sentence:
        'The Judge flagged graphic detail in the summary wording that may not be G-rated. Please soften the wording before publishing.',
    };
  }

  return {
    needed: true,
    state: 'Needs a check',
    headline: 'Why this needs you · Needs a check',
    sentence:
      article.confidence_reasoning ||
      'I had lower confidence on one rubric dimension. Please review the draft against the source text on the right.',
  };
}

/**
 * Single source of truth for today's article counts.
 */
export function computeTodayCounts(articles: Article[], today: string): TodayCounts {
  const todayArticles = articles.filter((a) => a.date === today);
  const published = todayArticles.filter((a) => a.status === 'published').length;
  const drafts = todayArticles.filter((a) => a.status === 'draft');
  const rejected = todayArticles.filter((a) => a.status === 'rejected').length;
  const needsReview = drafts.length;

  let readyToApprove = 0;
  let needsACheck = 0;
  let couldNotVerify = 0;

  for (const d of drafts) {
    const st = getEditorialState(d);
    if (st === 'Ready to approve') readyToApprove += 1;
    else if (st === 'Needs a check') needsACheck += 1;
    else couldNotVerify += 1;
  }

  const blocked = needsACheck + couldNotVerify;
  const signOff = readyToApprove;
  const total = published + needsReview + rejected;

  return {
    total,
    published,
    needsReview,
    rejected,
    readyToApprove,
    needsACheck,
    couldNotVerify,
    blocked,
    signOff,
  };
}

/**
 * Sorts items by state first ("Could not verify" -> "Needs a check" -> "Ready to approve"),
 * then lowest sub-score ascending, then oldest age first.
 */
export function sortReviewQueue(items: Article[]): Article[] {
  const rank = (a: Article) => {
    const st = getEditorialState(a);
    if (st === 'Could not verify') return 0;
    if (st === 'Needs a check') return 1;
    return 2;
  };
  return [...items].sort((a, b) => {
    const rA = rank(a);
    const rB = rank(b);
    if (rA !== rB) return rA - rB;

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
