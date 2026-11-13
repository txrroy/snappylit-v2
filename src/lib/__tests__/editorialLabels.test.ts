import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTodayCounts,
  getKidsTopicCheck,
  getLowestSubScore,
  getQueueReviewReason,
  getQueueStatus,
  isArticleBlocked,
  sortReviewQueue,
// @ts-expect-error Node 24 native TS runner requires .ts extension
} from '../editorialLabels.ts';
import type { Article } from '../../types/article';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'art-1',
    date: '2026-11-13',
    topic: 'Science',
    original_url: 'https://example.com/1',
    image_url: null,
    ai_headline: 'New Telescope Captures Distant Galaxy',
    ai_summary: 'Astronomers used a space telescope to take a clear picture of a faraway galaxy.',
    status: 'draft',
    approved_by: null,
    confidence_score: 96,
    confidence_reasoning: 'Clear and grounded in source.',
    scores: {
      accuracy: 98,
      neutrality: 97,
      safety: 99,
      readability: 90,
    },
    judge_pass: true,
    flags: [],
    sensitive: false,
    ...overrides,
  };
}

test('computeTodayCounts enforces published + needsReview + rejected === total', () => {
  const today = '2026-11-13';
  const articles: Article[] = [
    makeArticle({ id: '1', status: 'published' }),
    makeArticle({ id: '2', status: 'published' }),
    makeArticle({ id: '3', status: 'draft', flags: ['TOO_COMPLEX'] }),
    makeArticle({ id: '4', status: 'draft', flags: [] }),
    makeArticle({ id: '5', status: 'rejected', rejection_reason: 'Off-topic' }),
    // Different date should be excluded
    makeArticle({ id: '6', date: '2026-11-12', status: 'published' }),
  ];

  const counts = computeTodayCounts(articles, today);
  assert.equal(counts.published, 2);
  assert.equal(counts.needsReview, 2);
  assert.equal(counts.rejected, 1);
  assert.equal(counts.total, 5);
  assert.equal(counts.published + counts.needsReview + counts.rejected, counts.total);
  assert.equal(counts.blocked, 1);
  assert.equal(counts.signOff, 1);
});

test('getLowestSubScore returns the lowest named sub-score instead of defaulting to accuracy', () => {
  const article = makeArticle({
    confidence_score: 90,
    scores: { accuracy: 100, neutrality: 98, safety: 95, readability: 62 },
  });
  const lowest = getLowestSubScore(article);
  assert.deepEqual(lowest, { label: 'Readability', value: 62 });
});

test('getKidsTopicCheck blocks sensitive topics until confirmed by an editor', () => {
  const unconfirmed = makeArticle({
    ai_headline: 'Seven People Killed and Many Injured in Train Collision',
    ai_summary: 'Rescue crews responded to a crash.',
  });
  const check1 = getKidsTopicCheck(unconfirmed);
  assert.equal(check1.rawTriggered, true);
  assert.equal(check1.triggered, true);
  assert.equal(check1.matchedTerm, 'Killed');
  assert.equal(isArticleBlocked(unconfirmed), true);
  assert.equal(getQueueStatus(unconfirmed), 'Blocked');
  assert.match(getQueueReviewReason(unconfirmed), /Sensitive topic for children/);

  const confirmed = makeArticle({
    ai_headline: 'Seven People Killed and Many Injured in Train Collision',
    ai_summary: 'Rescue crews responded to a crash.',
    kids_topic_confirmed: true,
  });
  const check2 = getKidsTopicCheck(confirmed);
  assert.equal(check2.rawTriggered, true);
  assert.equal(check2.triggered, false);
  assert.equal(isArticleBlocked(confirmed), false);
  assert.equal(getQueueStatus(confirmed), 'Needs sign-off');
});

test('getQueueStatus uses only Blocked and Needs sign-off', () => {
  const blockedByFlag = makeArticle({ flags: ['SNIPPET_ONLY'] });
  const blockedByScore = makeArticle({
    scores: { accuracy: 100, neutrality: 100, safety: 68, readability: 95 },
  });
  const signOff = makeArticle({
    flags: [],
    scores: { accuracy: 95, neutrality: 95, safety: 95, readability: 92 },
  });

  assert.equal(getQueueStatus(blockedByFlag), 'Blocked');
  assert.equal(getQueueStatus(blockedByScore), 'Blocked');
  assert.equal(getQueueStatus(signOff), 'Needs sign-off');
});

test('sortReviewQueue orders Blocked first, then lowest sub-score, then oldest age', () => {
  const signOffLow = makeArticle({
    id: 'signoff-low',
    scores: { accuracy: 82, neutrality: 90, safety: 90, readability: 90 },
    pipeline_trace: [{ step: 'judge', agent: 'judge', status: 'ok', summary: 'Audited', at: '2026-11-13T08:00:00Z' }],
  });
  const blockedNewer = makeArticle({
    id: 'blocked-newer',
    flags: ['TOO_COMPLEX'],
    scores: { accuracy: 100, neutrality: 100, safety: 100, readability: 85 },
    pipeline_trace: [{ step: 'judge', agent: 'judge', status: 'ok', summary: 'Audited', at: '2026-11-13T09:00:00Z' }],
  });
  const blockedOlder = makeArticle({
    id: 'blocked-older',
    flags: ['TOO_COMPLEX'],
    scores: { accuracy: 100, neutrality: 100, safety: 100, readability: 85 },
    pipeline_trace: [{ step: 'judge', agent: 'judge', status: 'ok', summary: 'Audited', at: '2026-11-13T07:00:00Z' }],
  });
  const blockedLowest = makeArticle({
    id: 'blocked-lowest',
    flags: ['SNIPPET_ONLY'],
    scores: { accuracy: 65, neutrality: 90, safety: 95, readability: 90 },
    pipeline_trace: [{ step: 'judge', agent: 'judge', status: 'ok', summary: 'Audited', at: '2026-11-13T10:00:00Z' }],
  });

  const sorted = sortReviewQueue([signOffLow, blockedNewer, blockedOlder, blockedLowest]);
  assert.deepEqual(
    sorted.map((a) => a.id),
    ['blocked-lowest', 'blocked-older', 'blocked-newer', 'signoff-low'],
  );
});
