import { GoogleGenAI, Type } from '@google/genai';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Parser from 'rss-parser';
import {
  extractFullArticle,
  isSameEvent,
  selectTopImpactStories,
} from './agents/fetcher';
import { judgeArticle } from './agents/judge';
import { summarizeArticle } from './agents/summarizer';
import { PIPELINE_CONFIG } from './config';
import {
  getAllExistingArticleUrls,
  initFirebaseAdmin,
  loadActivePolicy,
  saveDraftArticles,
} from './lib/firebase';
import { sleep, withGeminiRetry } from './lib/retry';
import { buildInstructionsSnapshot, LOCKED_CORE_RULES } from './policy';
import type {
  ArticleDocument,
  FetchedArticle,
  PipelineTraceStep,
  RawRssItem,
} from './types';

const AGENT_DIR = resolve(__dirname, '../../agent');

for (const envPath of [resolve(AGENT_DIR, '.env'), 'agent/.env', '.env']) {
  try {
    if (existsSync(envPath)) {
      process.loadEnvFile?.(envPath);
      break;
    }
  } catch {
    // Ignore if loadEnvFile fails
  }
}

interface BackfillOptions {
  startDate: string;
  endDate: string;
  targetCount: number;
  delayMs: number;
  outputFile: string;
  pushOnly: boolean;
  upsert: boolean;
  rewriteWhyItMatters: boolean;
  startIndex: number;
}

interface GuardianItem {
  webTitle?: string;
  webUrl?: string;
  webPublicationDate?: string;
  fields?: {
    bodyText?: string;
    trailText?: string;
    thumbnail?: string;
  };
}

interface GuardianResponse {
  response?: {
    status?: string;
    results?: GuardianItem[];
  };
}

interface CandidateWithPrefetch extends RawRssItem {
  prefetchedFullText?: string;
}

const rssParser = new Parser({
  timeout: PIPELINE_CONFIG.fetchTimeoutMs,
  headers: {
    'User-Agent': 'SnappyLitNewsBot/1.0 (+https://snappylit.com)',
  },
});

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const getArg = (prefix: string): string | undefined =>
    args.find((a) => a.startsWith(prefix))?.slice(prefix.length);

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  return {
    startDate: getArg('--start=') || '2026-07-01',
    endDate: getArg('--end=') || yesterday,
    targetCount: Number(getArg('--target=') || 100),
    delayMs: Number(getArg('--delay-ms=') || process.env.BACKFILL_DELAY_MS || 12_000),
    outputFile: resolve(
      getArg('--file=') || resolve(AGENT_DIR, 'backfill-articles.json')
    ),
    pushOnly: args.includes('--push-only'),
    upsert: args.includes('--upsert'),
    rewriteWhyItMatters: args.includes('--rewrite-why-it-matters'),
    startIndex: Number(getArg('--start-index=') || 0),
  };
}

function buildWeeklyWindows(
  startDate: string,
  endDate: string
): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (cursor <= end) {
    const next = new Date(cursor.getTime() + 6 * 86_400_000);
    const windowEnd = next < end ? next : end;
    windows.push({
      from: cursor.toISOString().split('T')[0],
      to: windowEnd.toISOString().split('T')[0],
    });
    cursor = new Date(windowEnd.getTime() + 86_400_000);
  }
  return windows;
}

function toIsoDate(rawDate: string | undefined, fallbackDate: string): string {
  if (!rawDate) return fallbackDate;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return fallbackDate;
  return parsed.toISOString().split('T')[0];
}

function loadCheckpoint(filePath: string): ArticleDocument[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ArticleDocument[]) : [];
  } catch (err) {
    console.warn(`Could not read checkpoint ${filePath}, starting fresh:`, err);
    return [];
  }
}

function saveCheckpoint(filePath: string, articles: ArticleDocument[]): void {
  writeFileSync(filePath, JSON.stringify(articles, null, 2), 'utf8');
}

async function fetchGoogleNewsWindow(
  from: string,
  to: string
): Promise<CandidateWithPrefetch[]> {
  // Google News `before:` is exclusive, so add 1 day to `to`
  const beforeDate = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .split('T')[0];

  const queries = [
    `world news after:${from} before:${beforeDate}`,
    `site:reuters.com OR site:apnews.com after:${from} before:${beforeDate}`,
  ];

  const items: CandidateWithPrefetch[] = [];
  for (const q of queries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const feed = await rssParser.parseURL(url);
      for (const entry of (feed.items || []).slice(0, 15)) {
        const link = entry.link?.trim();
        const title = entry.title?.trim();
        if (!link || !title) continue;
        items.push({
          title,
          link,
          snippet: (entry.contentSnippet || entry.content || '').trim(),
          source: 'Google News',
          imageUrl: typeof entry.enclosure?.url === 'string' ? entry.enclosure.url : null,
          pubDate: entry.pubDate,
          source_count: 1,
          source_names: ['Google News'],
          alternate_urls: [],
        });
      }
    } catch (err) {
      console.warn(`Google News RSS failed for ${from}..${to}:`, err);
    }
    await sleep(1_500);
  }
  return items;
}

async function fetchGuardianWindow(
  from: string,
  to: string,
  apiKey: string
): Promise<CandidateWithPrefetch[]> {
  const url = new URL('https://content.guardianapis.com/search');
  url.searchParams.set('section', 'world');
  url.searchParams.set('from-date', from);
  url.searchParams.set('to-date', to);
  url.searchParams.set('page-size', '20');
  url.searchParams.set('order-by', 'relevance');
  url.searchParams.set('show-fields', 'bodyText,trailText,thumbnail');
  url.searchParams.set('api-key', apiKey);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(PIPELINE_CONFIG.fetchTimeoutMs),
    });
    if (!res.ok) {
      console.warn(`Guardian API HTTP ${res.status} for ${from}..${to}`);
      return [];
    }
    const data = (await res.json()) as GuardianResponse;
    const results = data.response?.results || [];
    const items: CandidateWithPrefetch[] = [];

    for (const r of results) {
      const link = r.webUrl?.trim();
      const title = r.webTitle?.trim();
      if (!link || !title) continue;

      const bodyText = (r.fields?.bodyText || '').trim();
      const trailText = (r.fields?.trailText || '').replace(/<[^>]+>/g, '').trim();
      items.push({
        title,
        link,
        snippet: trailText || bodyText.slice(0, 300),
        source: 'The Guardian',
        imageUrl: r.fields?.thumbnail || null,
        pubDate: r.webPublicationDate,
        source_count: 1,
        source_names: ['The Guardian'],
        alternate_urls: [],
        prefetchedFullText:
          bodyText.length >= 250
            ? bodyText.slice(0, PIPELINE_CONFIG.maxSourceChars)
            : undefined,
      });
    }
    return items;
  } catch (err) {
    console.warn(`Guardian API failed for ${from}..${to}:`, err);
    return [];
  }
}

function mergeAndDedupeCandidates(
  googleItems: CandidateWithPrefetch[],
  guardianItems: CandidateWithPrefetch[],
  existingUrls: Set<string>
): CandidateWithPrefetch[] {
  const merged: CandidateWithPrefetch[] = [];

  for (const item of [...guardianItems, ...googleItems]) {
    if (
      existingUrls.has(item.link) ||
      item.alternate_urls.some((u) => existingUrls.has(u))
    ) {
      continue;
    }

    const existing = merged.find((c) => isSameEvent(c, item));
    if (!existing) {
      merged.push(item);
      continue;
    }

    if (!existing.source_names.includes(item.source)) {
      existing.source_names.push(item.source);
      existing.source_count = existing.source_names.length;
    }
    if (item.link !== existing.link && !existing.alternate_urls.includes(item.link)) {
      existing.alternate_urls.push(item.link);
    }
    if (!existing.imageUrl && item.imageUrl) {
      existing.imageUrl = item.imageUrl;
    }
    if (!existing.prefetchedFullText && item.prefetchedFullText) {
      existing.prefetchedFullText = item.prefetchedFullText;
    }
    if (item.snippet.length > existing.snippet.length) {
      existing.snippet = item.snippet;
    }
  }

  return merged;
}

async function runPushOnly(options: BackfillOptions) {
  const articles = loadCheckpoint(options.outputFile);
  if (articles.length === 0) {
    console.log(`No articles found in ${options.outputFile}. Nothing to push.`);
    return;
  }

  const db = initFirebaseAdmin();
  const existingUrls = options.upsert
    ? new Set<string>()
    : await getAllExistingArticleUrls(db);
  const toSave = options.upsert
    ? articles
    : articles.filter((a) => !existingUrls.has(a.original_url));

  console.log(
    `Loaded ${articles.length} articles from ${options.outputFile} (${options.upsert ? 'upserting all' : `${articles.length - toSave.length} already in Firestore`}).`
  );

  if (toSave.length === 0) {
    console.log('All checkpoint articles already exist in Firestore.');
    return;
  }

  const saved = await saveDraftArticles(db, toSave);
  console.log(`Pushed ${saved} articles to Firestore without calling Gemini.`);
}

async function runRewriteWhyItMatters(options: BackfillOptions) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required.');
  }

  const articles = loadCheckpoint(options.outputFile);
  if (articles.length === 0) {
    console.log(`No articles found in ${options.outputFile}. Nothing to rewrite.`);
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const db = initFirebaseAdmin();
  const activePolicy = await loadActivePolicy(db);
  const readingLevel = activePolicy.settings.reading_level;

  console.log(
    `Rewriting "Why it matters" (ai_explanation) for ${articles.length} articles starting at index ${options.startIndex} (delay ${options.delayMs}ms)...`
  );

  let updated = 0;
  for (let i = options.startIndex; i < articles.length; i++) {
    const article = articles[i];
    console.log(`[${i + 1}/${articles.length}] ${article.ai_headline}`);

    try {
      const response = await withGeminiRetry(
        `Rewrite WhyItMatters (${i + 1}/${articles.length})`,
        () =>
          ai.models.generateContent({
            model: PIPELINE_CONFIG.geminiModel,
            contents: [
              `You are a thoughtful educator explaining world news at a ${readingLevel} reading level so someone with zero background context can understand why a story matters.`,
              'Write ONLY the "Why it matters" explanation (2 to 3 short sentences) in plain, calm, neutral, G-rated language.',
              '- Explain what background led to this, who or what it affects in everyday life, and why it matters globally.',
              '- Never tell the reader what to feel, never use loaded language, and never include graphic details.',
              '- Stick strictly to facts supported by the headline, summary, and source text below.',
              '',
              ...LOCKED_CORE_RULES.slice(0, -1),
              '',
              `Headline: ${article.ai_headline}`,
              `Summary: ${article.ai_summary}`,
              article.source_text
                ? `Source Text:\n${article.source_text.slice(0, PIPELINE_CONFIG.maxSourceChars)}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
            config: {
              abortSignal: AbortSignal.timeout(PIPELINE_CONFIG.llmTimeoutMs),
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  ai_explanation: { type: Type.STRING },
                },
                required: ['ai_explanation'],
              },
            },
          })
      );

      const parsed = JSON.parse(response.text || '{}') as {
        ai_explanation?: string;
      };
      const nextExplanation = parsed.ai_explanation?.trim();
      if (!nextExplanation) {
        console.warn(`  -> Empty response for ${article.id}, keeping existing.`);
      } else {
        article.ai_explanation = nextExplanation;
        saveCheckpoint(options.outputFile, articles);
        await db
          .collection('articles')
          .doc(article.id)
          .set({ ai_explanation: nextExplanation }, { merge: true });
        updated += 1;
        console.log(`  -> Updated (${nextExplanation.slice(0, 70)}...)`);
      }
    } catch (err) {
      console.error(`  -> Failed for ${article.id}:`, err);
    }

    if (i < articles.length - 1) {
      await sleep(options.delayMs);
    }
  }

  console.log(
    `\nRewrite complete: updated ${updated}/${articles.length - options.startIndex} articles in ${options.outputFile} and Firestore.`
  );
}

async function runBackfill() {
  const options = parseArgs();

  if (options.pushOnly) {
    await runPushOnly(options);
    return;
  }

  if (options.rewriteWhyItMatters) {
    await runRewriteWhyItMatters(options);
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required.');
  }

  const guardianKey = process.env.GUARDIAN_API_KEY || 'test';
  if (guardianKey === 'test') {
    console.log(
      'GUARDIAN_API_KEY not set; using Guardian "test" key (rate-limited, slower).'
    );
  }

  const db = initFirebaseAdmin();
  const ai = new GoogleGenAI({ apiKey });
  const activePolicy = await loadActivePolicy(db);
  const instructionsSnapshot = buildInstructionsSnapshot(activePolicy);

  const savedArticles = loadCheckpoint(options.outputFile);
  const existingUrls = await getAllExistingArticleUrls(db);
  for (const a of savedArticles) {
    existingUrls.add(a.original_url);
    for (const alt of a.alternate_urls || []) existingUrls.add(alt);
  }

  console.log(
    `Backfill ${options.startDate} -> ${options.endDate} | Target: ${options.targetCount} | Already saved: ${savedArticles.length} | Delay: ${options.delayMs}ms`
  );

  if (savedArticles.length >= options.targetCount) {
    console.log('Target already reached in checkpoint. Use --push-only to upload.');
    return;
  }

  const windows = buildWeeklyWindows(options.startDate, options.endDate);
  const remainingNeeded = options.targetCount - savedArticles.length;
  const perWindowQuota = Math.max(1, Math.ceil(remainingNeeded / windows.length));

  for (const [wIdx, win] of windows.entries()) {
    if (savedArticles.length >= options.targetCount) break;

    console.log(
      `\n[Week ${wIdx + 1}/${windows.length}] Fetching ${win.from} .. ${win.to}...`
    );

    const [googleItems, guardianItems] = await Promise.all([
      fetchGoogleNewsWindow(win.from, win.to),
      fetchGuardianWindow(win.from, win.to, guardianKey),
    ]);

    const candidates = mergeAndDedupeCandidates(
      googleItems,
      guardianItems,
      existingUrls
    );
    console.log(
      `Found ${googleItems.length} Google + ${guardianItems.length} Guardian -> ${candidates.length} deduped new candidates.`
    );

    if (candidates.length === 0) {
      await sleep(3_000);
      continue;
    }

    const prefetchByUrl = new Map<string, string>();
    for (const c of candidates) {
      if (c.prefetchedFullText) prefetchByUrl.set(c.link, c.prefetchedFullText);
    }

    const selectStart = Date.now();
    const selected = await selectTopImpactStories(
      ai,
      candidates,
      activePolicy.settings
    );
    const selectDurationMs = Date.now() - selectStart;

    const toProcess = selected.slice(
      0,
      Math.min(perWindowQuota, options.targetCount - savedArticles.length)
    );

    for (const story of toProcess) {
      if (savedArticles.length >= options.targetCount) break;
      if (existingUrls.has(story.link)) continue;

      const extractStart = Date.now();
      const prefetched = prefetchByUrl.get(story.link);
      const fetchedArticle: FetchedArticle = prefetched
        ? { ...story, fullText: prefetched, usedFallbackSnippet: false }
        : await extractFullArticle(story);
      const extractDurationMs = Date.now() - extractStart;

      if (existingUrls.has(fetchedArticle.link)) continue;

      console.log(
        `[${savedArticles.length + 1}/${options.targetCount}] (${toIsoDate(fetchedArticle.pubDate, win.from)}) ${fetchedArticle.title}`
      );

      const summarizeStart = Date.now();
      const summary = await summarizeArticle(ai, fetchedArticle, {
        policy: activePolicy,
      });
      const summarizeDurationMs = Date.now() - summarizeStart;

      if (!summary) {
        await sleep(options.delayMs);
        continue;
      }

      const judgeStart = Date.now();
      const judgment = await judgeArticle(ai, fetchedArticle, summary);
      const judgeDurationMs = Date.now() - judgeStart;

      const nowIso = new Date().toISOString();
      const articleDate = toIsoDate(fetchedArticle.pubDate, win.from);
      const autoPublish = judgment.pass;

      const pipelineTrace: PipelineTraceStep[] = [
        {
          step: 'fetch',
          agent: 'Agent 1 · Backfill Fetcher',
          at: nowIso,
          status: 'ok',
          summary: `Backfilled from ${fetchedArticle.source_names.join(', ')} (${articleDate})`,
          details: {
            source_count: fetchedArticle.source_count,
            primary_source: fetchedArticle.source,
          },
        },
        {
          step: 'select',
          agent: 'Agent 1 · Story Selector',
          at: nowIso,
          duration_ms: selectDurationMs,
          status: fetchedArticle.sensitive ? 'warning' : 'ok',
          summary: fetchedArticle.reason,
          details: {
            topic: fetchedArticle.topic,
            region: fetchedArticle.region,
            sensitive: fetchedArticle.sensitive,
          },
        },
        {
          step: 'extract',
          agent: 'Agent 1 · Text Extractor',
          at: nowIso,
          duration_ms: extractDurationMs,
          status: fetchedArticle.usedFallbackSnippet ? 'fallback' : 'ok',
          summary: prefetched
            ? `Used Guardian API bodyText (${fetchedArticle.fullText.length} chars).`
            : fetchedArticle.usedFallbackSnippet
              ? `Full-text scrape failed; fell back to RSS snippet (${fetchedArticle.fullText.length} chars).`
              : `Extracted ${fetchedArticle.fullText.length} chars from publisher page.`,
          details: {
            chars: fetchedArticle.fullText.length,
            used_fallback_snippet: fetchedArticle.usedFallbackSnippet,
          },
        },
        {
          step: 'summarize',
          agent: 'Agent 2 · Summarizer',
          at: nowIso,
          duration_ms: summarizeDurationMs,
          status: 'ok',
          summary: `Generated headline & summary under policy ${activePolicy.active_version} (${activePolicy.settings.reading_level}).`,
        },
        {
          step: 'judge',
          agent: 'Agent 3 · Judge',
          at: nowIso,
          duration_ms: judgeDurationMs,
          status: judgment.pass ? 'ok' : 'warning',
          summary: judgment.pass
            ? `Passed audit (Acc ${judgment.scores.accuracy}, Neu ${judgment.scores.neutrality}, Saf ${judgment.scores.safety}, Read ${judgment.scores.readability}). Auto-published.`
            : `Flagged for human review (${judgment.flags.join(', ') || 'score below threshold'}). Saved as draft.`,
        },
      ];

      const doc: ArticleDocument = {
        id: randomUUID(),
        date: articleDate,
        original_url: fetchedArticle.link,
        image_url: fetchedArticle.imageUrl,
        ai_headline: summary.ai_headline,
        ai_summary: summary.ai_summary,
        ai_explanation: summary.ai_explanation,
        source_text: fetchedArticle.fullText,
        confidence_score: judgment.confidence_score,
        confidence_reasoning: judgment.reasoning,
        judge_pass: judgment.pass,
        scores: judgment.scores,
        flags: judgment.flags,
        claims: judgment.claims,
        source_count: fetchedArticle.source_count,
        source_names: fetchedArticle.source_names,
        alternate_urls: fetchedArticle.alternate_urls,
        topic: fetchedArticle.topic,
        region: fetchedArticle.region,
        sensitive: fetchedArticle.sensitive,
        selection_reason: fetchedArticle.reason,
        used_fallback_snippet: fetchedArticle.usedFallbackSnippet,
        status: autoPublish ? 'published' : 'draft',
        approved_by: autoPublish ? 'backfill-agent' : null,
        approved_at: autoPublish ? nowIso : null,
        decision_history: autoPublish ? [{ action: 'approved', at: nowIso }] : [],
        prompt_version: activePolicy.active_version,
        instructions_snapshot: instructionsSnapshot,
        pipeline_trace: pipelineTrace,
      };

      await saveDraftArticles(db, [doc]);
      savedArticles.push(doc);
      existingUrls.add(doc.original_url);
      for (const alt of doc.alternate_urls) existingUrls.add(alt);
      saveCheckpoint(options.outputFile, savedArticles);

      console.log(
        `  -> Saved (${doc.status}) | score=${doc.confidence_score} | total=${savedArticles.length}/${options.targetCount}`
      );

      await sleep(options.delayMs);
    }

    await sleep(3_000);
  }

  const publishedCount = savedArticles.filter((a) => a.status === 'published').length;
  console.log(
    `\nBackfill finished: ${savedArticles.length} total articles (${publishedCount} published, ${savedArticles.length - publishedCount} draft). Checkpoint: ${options.outputFile}`
  );
}

runBackfill().catch((err) => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});
