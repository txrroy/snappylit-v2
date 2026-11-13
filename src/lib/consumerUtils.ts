import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { Article } from '@/types/article';

/**
 * Opens an article source URL in an in-app browser sheet on native platforms,
 * or via the default browser/tab on web.
 */
export async function openArticleUrl(url: string): Promise<void> {
  if (!url) return;
  if (Platform.OS === 'web') {
    await Linking.openURL(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    controlsColor: '#0D9488',
    toolbarColor: '#FAF9F6',
    enableBarCollapsing: true,
    showTitle: true,
  });
}

/**
 * Formats a YYYY-MM-DD date string into a readable editorial date without
 * timezone-induced off-by-one-day shifts.
 */
export function formatEditionDate(
  dateStr: string,
  style: 'full' | 'short' = 'full'
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (style === 'short') {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Returns a concise source label from `source_names` or the URL hostname.
 */
export function getSourceLabel(article: Article): string | null {
  if (article.source_names && article.source_names.length > 0) {
    return article.source_names[0];
  }
  try {
    const hostname = new URL(article.original_url).hostname.replace(/^www\./, '');
    return hostname || null;
  } catch {
    return null;
  }
}

