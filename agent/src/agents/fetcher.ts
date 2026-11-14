import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { GoogleGenAI, Type } from '@google/genai';
import { PIPELINE_CONFIG, RSS_SOURCES, type RssSource } from '../config';
import { withGeminiRetry } from '../lib/retry';
import type { FetchedArticle, PolicySettings, RawRssItem, SelectedStory } from '../types';

const rssParser = new Parser({
  timeout: PIPELINE_CONFIG.fetchTimeoutMs,
  headers: {
    'User-Agent': 'SnappyLitNewsBot/1.0 (+https://snappylit.com)',
  },
});

const STOP_WORDS = new Set([
  'about', 'after', 'amid', 'around', 'before', 'between', 'could', 'during',
  'first', 'from', 'have', 'into', 'more', 'most', 'news', 'over', 'says',
  'said', 'than', 'that', 'their', 'there', 'these', 'they', 'this', 'under',
  'what', 'when', 'where', 'which', 'while', 'with', 'world', 'would',
]);

function normalizeTokens(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  return new Set(words);
}

export function isSameEvent(a: RawRssItem, b: RawRssItem): boolean {
  if (a.link === b.link) return true;
  const titleA = a.title.toLowerCase().trim();
  const titleB = b.title.toLowerCase().trim();
  if (titleA === titleB) return true;

  const tokensA = normalizeTokens(a.title);
  const tokensB = normalizeTokens(b.title);
  if (tokensA.size < 3 || tokensB.size < 3) return false;

  let shared = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) shared += 1;
  }

  const union = tokensA.size + tokensB.size - shared;
  const jaccard = union > 0 ? shared / union : 0;
  return shared >= 3 && jaccard >= 0.45;
}

function isGoogleNewsUrl(url: string): boolean {
  return url.startsWith('https://news.google.com/');
}

/**
 * Fetches items from all enabled RSS feeds and deduplicates events while
 * tracking outlet count, source names, and alternate URLs.
 */
export async function fetchRssCandidates(
  sources: RssSource[] = RSS_SOURCES
): Promise<RawRssItem[]> {
  const enabledSources = sources.filter((s) => s.enabled);

  const results = await Promise.allSettled(
    enabledSources.map(async (source) => {
      const feed = await rssParser.parseURL(source.url);
      return (feed.items || [])
        .slice(0, PIPELINE_CONFIG.maxItemsPerFeed)
        .map((item): RawRssItem | null => {
          const link = item.link?.trim();
          const title = item.title?.trim();
          if (!link || !title) return null;

          const enclosureUrl =
            typeof item.enclosure?.url === 'string' ? item.enclosure.url : null;

          return {
            title,
            link,
            snippet: (item.contentSnippet || item.content || '').trim(),
            source: source.name,
            imageUrl: enclosureUrl,
            pubDate: item.pubDate,
            source_count: 1,
            source_names: [source.name],
            alternate_urls: [],
          };
        });
    })
  );

  const candidates: RawRssItem[] = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') {
      console.warn('RSS feed fetch failed:', result.reason);
      continue;
    }

    for (const item of result.value) {
      if (!item) continue;

      const existing = candidates.find((c) => isSameEvent(c, item));
      if (!existing) {
        candidates.push(item);
        continue;
      }

      if (!existing.source_names.includes(item.source)) {
        existing.source_names.push(item.source);
        existing.source_count = existing.source_names.length;
      }

      // Prefer a direct publisher link as primary URL over a Google News link
      if (isGoogleNewsUrl(existing.link) && !isGoogleNewsUrl(item.link)) {
        if (!existing.alternate_urls.includes(existing.link)) {
          existing.alternate_urls.push(existing.link);
        }
        existing.link = item.link;
        existing.source = item.source;
      } else if (
        item.link !== existing.link &&
        !existing.alternate_urls.includes(item.link)
      ) {
        existing.alternate_urls.push(item.link);
      }

      if (!existing.imageUrl && item.imageUrl) {
        existing.imageUrl = item.imageUrl;
      }
      if (item.snippet.length > existing.snippet.length) {
        existing.snippet = item.snippet;
      }
    }
  }

  return candidates;
}

/**
 * Uses Gemini to rank deduped candidates by global impact (including source_count)
 * and select up to 20 stories while enforcing safety and topic/region diversity caps.
 */
export async function selectTopImpactStories(
  ai: GoogleGenAI,
  candidates: RawRssItem[],
  policySettings?: PolicySettings
): Promise<SelectedStory[]> {
  const maxPerTopic = policySettings?.max_per_topic ?? PIPELINE_CONFIG.maxPerTopic;
  const maxPerRegion = policySettings?.max_per_region ?? PIPELINE_CONFIG.maxPerRegion;
  const maxMarketStories = policySettings?.max_market_stories ?? PIPELINE_CONFIG.maxMarketStories;
  const sortedCandidates = [...candidates].sort(
    (a, b) => b.source_count - a.source_count
  );

  const indexedList = sortedCandidates
    .map(
      (item, idx) =>
        `[${idx}] (outlets=${item.source_count}: ${item.source_names.join(', ')}) ${item.title} — ${item.snippet.slice(0, 160)}`
    )
    .join('\n');

  try {
    const response = await withGeminiRetry('Agent 1 (Fetcher filter)', () =>
      ai.models.generateContent({
        model: PIPELINE_CONFIG.geminiModel,
        contents: [
          'You are an objective news editor selecting stories for a global daily briefing for all ages (including Grade 6 readers).',
          `From the deduped list below, rank by global impact and multi-outlet coverage (outlets count), and select up to ${PIPELINE_CONFIG.targetArticles} stories.`,
          'Strict selection rules:',
          '- EXCLUDE any story whose main subject is sexual violence, suicide, or graphic crime.',
          '- Discard celebrity gossip, sports scores, clickbait, and trivial lifestyle pieces.',
          `- Allow at most ${maxMarketStories} market or stock-market update story (tag its topic as "Markets").`,
          '- Avoid duplicate coverage of the exact same event.',
          `- Cap each topic (e.g., Politics, Economy, Markets, Climate, Conflict, Science, Health, Society) at ${maxPerTopic} stories.`,
          `- Cap each region (e.g., Asia, Europe, Middle East, Africa, Americas, Global) at ${maxPerRegion} stories.`,
          '- For each selected story, return: index (integer), topic (short label), region (short label), sensitive (boolean: true if it involves war, disaster, death, or violence), and reason (1 concise sentence explaining why this story matters).',
          '',
          indexedList,
        ].join('\n'),
        config: {
          abortSignal: AbortSignal.timeout(PIPELINE_CONFIG.llmTimeoutMs),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              picks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: { type: Type.INTEGER },
                    topic: { type: Type.STRING },
                    region: { type: Type.STRING },
                    sensitive: { type: Type.BOOLEAN },
                    reason: { type: Type.STRING },
                  },
                  required: ['index', 'topic', 'region', 'sensitive', 'reason'],
                },
              },
            },
            required: ['picks'],
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || '{}') as {
      picks?: Array<{
        index: number;
        topic: string;
        region: string;
        sensitive: boolean;
        reason?: string;
      }>;
    };

    const seenIndices = new Set<number>();
    const topicCounts = new Map<string, number>();
    const regionCounts = new Map<string, number>();
    let marketCount = 0;
    const selected: SelectedStory[] = [];

    for (const pick of parsed.picks || []) {
      if (
        !Number.isInteger(pick.index) ||
        pick.index < 0 ||
        pick.index >= sortedCandidates.length ||
        seenIndices.has(pick.index)
      ) {
        continue;
      }

      const topic = (pick.topic || 'World').trim();
      const region = (pick.region || 'Global').trim();
      const topicKey = topic.toLowerCase();
      const regionKey = region.toLowerCase();
      const isMarket = topicKey === 'markets' || topicKey === 'market';

      if (isMarket && marketCount >= maxMarketStories) {
        continue;
      }
      if ((topicCounts.get(topicKey) ?? 0) >= maxPerTopic) {
        continue;
      }
      if ((regionCounts.get(regionKey) ?? 0) >= maxPerRegion) {
        continue;
      }

      seenIndices.add(pick.index);
      if (isMarket) marketCount += 1;
      topicCounts.set(topicKey, (topicCounts.get(topicKey) ?? 0) + 1);
      regionCounts.set(regionKey, (regionCounts.get(regionKey) ?? 0) + 1);

      selected.push({
        ...sortedCandidates[pick.index],
        topic,
        region,
        sensitive: Boolean(pick.sensitive),
        reason: (pick.reason || 'High global impact.').trim(),
      });

      if (selected.length >= PIPELINE_CONFIG.targetArticles) {
        break;
      }
    }

    if (selected.length > 0) {
      return selected;
    }
  } catch (err) {
    console.error('Agent 1 (Fetcher filter) LLM call failed, using fallback slice:', err);
  }

  return sortedCandidates.slice(0, PIPELINE_CONFIG.targetArticles).map((item) => ({
    ...item,
    topic: 'World',
    region: 'Global',
    sensitive: false,
    reason: 'Selected by outlet count fallback.',
  }));
}

async function resolveGoogleNewsUrl(googleNewsUrl: string): Promise<string> {
  try {
    const res = await fetch(googleNewsUrl, {
      signal: AbortSignal.timeout(PIPELINE_CONFIG.fetchTimeoutMs),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return googleNewsUrl;

    const html = await res.text();
    const sigMatch = html.match(/data-n-a-sg="([^"]+)"/);
    const tsMatch = html.match(/data-n-a-ts="([^"]+)"/);
    if (!sigMatch || !tsMatch) return googleNewsUrl;

    const articleId = googleNewsUrl.split('/').pop()?.split('?')[0];
    if (!articleId) return googleNewsUrl;

    const batchReqData = [
      'Fbv4je',
      JSON.stringify([
        'garturlreq',
        [
          ['en', 'US', ['FINANCE_TOP_INDICES', 'WEB_TEST_1_0_0'], null, null, 1, 1, 'US:en', null, 540, null, null, null, null, null, 0, null, null, [parseInt(tsMatch[1], 10), 738001000]],
          'en',
          'US',
          1,
          [2, 3, 4, 8],
          1,
          0,
          '658136446',
          0,
          0,
          null,
          0,
        ],
        articleId,
        sigMatch[1],
      ]),
    ];

    const bodyParams = new URLSearchParams({
      'f.req': JSON.stringify([[batchReqData]]),
    });

    const batchRes = await fetch(
      'https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je',
      {
        method: 'POST',
        signal: AbortSignal.timeout(PIPELINE_CONFIG.fetchTimeoutMs),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
        body: bodyParams.toString(),
      }
    );

    const text = await batchRes.text();
    for (const line of text.split('\n')) {
      if (!line.includes('Fbv4je')) continue;
      const outer = JSON.parse(line) as unknown;
      if (!Array.isArray(outer) || !Array.isArray(outer[0])) continue;
      const rawInner = outer[0][2];
      if (typeof rawInner !== 'string') continue;
      const inner = JSON.parse(rawInner) as unknown;
      if (
        Array.isArray(inner) &&
        typeof inner[1] === 'string' &&
        inner[1].startsWith('http')
      ) {
        return inner[1];
      }
    }
  } catch (err) {
    console.warn(`Google News URL decode failed for ${googleNewsUrl}:`, err);
  }
  return googleNewsUrl;
}

async function scrapeSingleUrl(
  rawUrl: string,
  fallbackImage: string | null
): Promise<{ url: string; text: string; imageUrl: string | null } | null> {
  const targetUrl = isGoogleNewsUrl(rawUrl)
    ? await resolveGoogleNewsUrl(rawUrl)
    : rawUrl;

  if (isGoogleNewsUrl(targetUrl)) {
    return null;
  }

  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(PIPELINE_CONFIG.fetchTimeoutMs),
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      fallbackImage;

    $('script, style, nav, header, footer, aside, noscript, iframe').remove();

    const container =
      $('article').length > 0
        ? $('article')
        : $('main').length > 0
          ? $('main')
          : $('body');

    const paragraphs = container
      .find('p')
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((text) => text.length > 40);

    const extractedText = paragraphs
      .join('\n\n')
      .slice(0, PIPELINE_CONFIG.maxSourceChars);

    if (extractedText.length >= 200) {
      return {
        url: res.url || targetUrl,
        text: extractedText,
        imageUrl: ogImage || null,
      };
    }
  } catch (err) {
    console.warn(`Scrape failed for ${targetUrl}:`, err);
  }

  return null;
}

/**
 * Extracts full article body from the primary URL, falling back through each
 * alternate_url before falling back to the RSS snippet.
 */
export async function extractFullArticle(
  item: SelectedStory
): Promise<FetchedArticle> {
  const urlsToTry = [item.link, ...item.alternate_urls];

  for (const candidateUrl of urlsToTry) {
    const scraped = await scrapeSingleUrl(candidateUrl, item.imageUrl);
    if (scraped) {
      return {
        ...item,
        link: scraped.url,
        imageUrl: scraped.imageUrl,
        fullText: scraped.text,
        usedFallbackSnippet: false,
      };
    }
  }

  return {
    ...item,
    fullText: item.snippet || item.title,
    usedFallbackSnippet: true,
  };
}
