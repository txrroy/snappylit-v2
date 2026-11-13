import { Platform } from 'react-native';

export const APP_CONFIG = {
  /** Main consumer header title displayed in the UI */
  title: "What's up today?",
  /** Banner shown when today's edition is not yet published and yesterday's is shown */
  preparingBanner: "Today's edition is being prepared.",
  /** Admin email addresses (full access including Tier 2 free-text policy instructions) */
  adminEmails: ['txrroy@gmail.com'] as readonly string[],
  /** Editor email addresses (access to queue, Tier 1 settings, analytics, and sources) */
  editorEmails: [] as readonly string[],
} as const;

export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.location.port === '8081') {
      return 'http://localhost:3000';
    }
    return '';
  }

  return 'http://localhost:3000';
}
