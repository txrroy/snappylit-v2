export interface RssSource {
  name: string;
  enabled: boolean;
  url: string;
}

export const RSS_SOURCES: RssSource[] = [
  // Wire services
  {
    name: 'AP',
    enabled: true,
    url: 'https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Reuters',
    enabled: true,
    url: 'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en',
  },
  // Global broadcasters
  {
    name: 'BBC World',
    enabled: true,
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  },
  {
    name: 'DW World',
    enabled: true,
    url: 'https://rss.dw.com/rdf/rss-en-world',
  },
  {
    name: 'France 24',
    enabled: true,
    url: 'https://www.france24.com/en/rss',
  },
  {
    name: 'Al Jazeera',
    enabled: true,
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
  },
  // National outlets with world desks
  {
    name: 'NPR World',
    enabled: true,
    url: 'https://feeds.npr.org/1004/rss.xml',
  },
  {
    name: 'The Guardian World',
    enabled: true,
    url: 'https://www.theguardian.com/world/rss',
  },
  // Regional
  {
    name: 'The Hindu International',
    enabled: true,
    url: 'https://www.thehindu.com/news/international/feeder/default.rss',
  },
  {
    name: 'ABC Australia World',
    enabled: true,
    url: 'https://www.abc.net.au/news/feed/104217382/rss.xml',
  },
  {
    name: 'AllAfrica',
    enabled: true,
    url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
  },
  // Humanitarian
  {
    name: 'UN News',
    enabled: true,
    url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml',
  },
  // Aggregator
  {
    name: 'Google News World',
    enabled: true,
    url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
  },
];

export const PIPELINE_CONFIG = {
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  readingLevel: 'grade 6',
  maxItemsPerFeed: 25,
  targetArticles: 20,
  maxPerTopic: 4,
  maxPerRegion: 5,
  maxMarketStories: 1,
  fetchTimeoutMs: 10_000,
  llmTimeoutMs: 30_000,
  maxSourceChars: 12_000,
} as const;

