import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'node:crypto';
import {
  extractFullArticle,
  fetchRssCandidates,
  selectTopImpactStories,
} from './agents/fetcher';
import { judgeArticle } from './agents/judge';
import { summarizeArticle } from './agents/summarizer';
import {
  getExistingArticleUrls,
  initFirebaseAdmin,
  loadActivePolicy,
  loadRssSources,
  saveDraftArticles,
} from './lib/firebase';
import { sleep } from './lib/retry';
import { buildInstructionsSnapshot } from './policy';
import type { ArticleDocument, PipelineTraceStep } from './types';

// Load agent/.env if present (local dev); existing env vars (e.g. Hostinger) take precedence
try {
  process.loadEnvFile?.('agent/.env');
} catch {
  // Ignore if agent/.env does not exist
}

async function runPipeline() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required.');
  }

  const db = initFirebaseAdmin();
  const ai = new GoogleGenAI({ apiKey });
  const today = new Date().toISOString().split('T')[0];

  const [activePolicy, sources] = await Promise.all([
    loadActivePolicy(db),
    loadRssSources(db),
  ]);
  const instructionsSnapshot = buildInstructionsSnapshot(activePolicy);

  console.log(
    `[${today}] Starting SnappyLit agent pipeline (policy ${activePolicy.active_version}, ${sources.filter((s) => s.enabled).length} enabled sources)...`
  );

  // Agent 1: Fetch all enabled RSS feeds, dedupe events, select top 20 by global impact, and scrape full text
  const fetchStart = Date.now();
  const existingUrls = await getExistingArticleUrls(db, today);
  const allCandidates = await fetchRssCandidates(sources);
  const candidates = allCandidates.filter(
    (item) =>
      !existingUrls.has(item.link) &&
      !(item.alternate_urls ?? []).some((u) => existingUrls.has(u))
  );
  const fetchDurationMs = Date.now() - fetchStart;
  console.log(
    `Fetched ${allCandidates.length} deduped RSS event candidates (${allCandidates.length - candidates.length} already in Firestore for ${today}).`
  );

  if (candidates.length === 0) {
    console.warn('No new RSS candidates to process. Exiting.');
    return;
  }

  const selectStart = Date.now();
  console.log('Calling Agent 1 (Fetcher filter) via Gemini...');
  const topStories = await selectTopImpactStories(
    ai,
    candidates,
    activePolicy.settings
  );
  const selectDurationMs = Date.now() - selectStart;
  console.log(`Selected ${topStories.length} top stories for full-text extraction.`);

  const extractStart = Date.now();
  const rawFetchedArticles = await Promise.all(
    topStories.map((item) => extractFullArticle(item))
  );
  const extractDurationMs = Date.now() - extractStart;
  const fetchedArticles = rawFetchedArticles.filter(
    (article) => !existingUrls.has(article.link)
  );
  const fallbackCount = fetchedArticles.filter((a) => a.usedFallbackSnippet).length;
  console.log(
    `Extracted text for ${fetchedArticles.length} new articles (${fallbackCount} fell back to RSS snippet).`
  );

  // Agent 2 & Agent 3: Summarize and Judge each article independently
  const drafts: ArticleDocument[] = [];

  for (const [index, article] of fetchedArticles.entries()) {
    console.log(`[${index + 1}/${fetchedArticles.length}] Summarizing & judging: ${article.title}`);
    const summarizeStart = Date.now();
    const summary = await summarizeArticle(ai, article, {
      policy: activePolicy,
    });
    const summarizeDurationMs = Date.now() - summarizeStart;
    if (!summary) {
      if (index < fetchedArticles.length - 1) {
        await sleep(8_000);
      }
      continue;
    }

    const judgeStart = Date.now();
    const judgment = await judgeArticle(ai, article, summary);
    const judgeDurationMs = Date.now() - judgeStart;

    const nowIso = new Date().toISOString();
    const pipelineTrace: PipelineTraceStep[] = [
      {
        step: 'fetch',
        agent: 'Agent 1 · RSS Fetcher',
        at: nowIso,
        duration_ms: fetchDurationMs,
        status: 'ok',
        summary: `Grouped from ${article.source_count} outlet(s): ${article.source_names.join(', ')}`,
        details: {
          source_count: article.source_count,
          primary_source: article.source,
        },
      },
      {
        step: 'select',
        agent: 'Agent 1 · Story Selector',
        at: nowIso,
        duration_ms: selectDurationMs,
        status: article.sensitive ? 'warning' : 'ok',
        summary: article.reason,
        details: {
          topic: article.topic,
          region: article.region,
          sensitive: article.sensitive,
        },
      },
      {
        step: 'extract',
        agent: 'Agent 1 · Text Extractor',
        at: nowIso,
        duration_ms: extractDurationMs,
        status: article.usedFallbackSnippet ? 'fallback' : 'ok',
        summary: article.usedFallbackSnippet
          ? `Full-text scrape failed; fell back to RSS snippet (${article.fullText.length} chars).`
          : `Extracted ${article.fullText.length} chars from publisher page.`,
        details: {
          chars: article.fullText.length,
          used_fallback_snippet: article.usedFallbackSnippet,
        },
      },
      {
        step: 'summarize',
        agent: 'Agent 2 · Summarizer',
        at: nowIso,
        duration_ms: summarizeDurationMs,
        status: 'ok',
        summary: `Generated headline & summary under policy ${activePolicy.active_version} (${activePolicy.settings.reading_level}).`,
        details: {
          prompt_version: activePolicy.active_version,
          reading_level: activePolicy.settings.reading_level,
          summary_words: summary.ai_summary.split(/\s+/).filter(Boolean).length,
        },
      },
      {
        step: 'judge',
        agent: 'Agent 3 · Judge',
        at: nowIso,
        duration_ms: judgeDurationMs,
        status: judgment.pass ? 'ok' : 'warning',
        summary: judgment.pass
          ? `Passed audit (Acc ${judgment.scores.accuracy}, Neu ${judgment.scores.neutrality}, Saf ${judgment.scores.safety}, Read ${judgment.scores.readability}).`
          : `Flagged for human review (${judgment.flags.join(', ') || 'score below threshold'}).`,
        details: {
          accuracy: judgment.scores.accuracy,
          neutrality: judgment.scores.neutrality,
          safety: judgment.scores.safety,
          readability: judgment.scores.readability,
          pass: judgment.pass,
        },
      },
    ];

    drafts.push({
      id: randomUUID(),
      date: today,
      original_url: article.link,
      image_url: article.imageUrl,
      ai_headline: summary.ai_headline,
      ai_summary: summary.ai_summary,
      ai_explanation: summary.ai_explanation,
      source_text: article.fullText,
      confidence_score: judgment.confidence_score,
      confidence_reasoning: judgment.reasoning,
      judge_pass: judgment.pass,
      scores: judgment.scores,
      flags: judgment.flags,
      claims: judgment.claims,
      source_count: article.source_count,
      source_names: article.source_names,
      alternate_urls: article.alternate_urls,
      topic: article.topic,
      region: article.region,
      sensitive: article.sensitive,
      selection_reason: article.reason,
      used_fallback_snippet: article.usedFallbackSnippet,
      status: 'draft',
      approved_by: null,
      prompt_version: activePolicy.active_version,
      instructions_snapshot: instructionsSnapshot,
      pipeline_trace: pipelineTrace,
    });

    if (index < fetchedArticles.length - 1) {
      await sleep(8_000);
    }
  }

  const savedCount = await saveDraftArticles(db, drafts);
  console.log(`Pipeline complete. Saved ${savedCount} draft articles for ${today}.`);
}

runPipeline().catch((err) => {
  console.error('Fatal agent pipeline error:', err);
  process.exit(1);
});
