import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { RSS_SOURCES, type RssSource } from '../config';
import { DEFAULT_ACTIVE_POLICY, DEFAULT_POLICY_SETTINGS } from '../policy';
import type { ActivePolicyDoc, ArticleDocument } from '../types';

export function initFirebaseAdmin(): Firestore {
  if (getApps().length > 0) {
    return getFirestore();
  }

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountRaw) {
    const serviceAccount = JSON.parse(serviceAccountRaw) as ServiceAccount;
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    // Uses GOOGLE_APPLICATION_CREDENTIALS or FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT
    initializeApp({
      projectId: process.env.GCLOUD_PROJECT || 'snappylit-news',
    });
  }

  return getFirestore();
}

export async function getExistingArticleUrls(
  db: Firestore,
  date: string
): Promise<Set<string>> {
  const snapshot = await db
    .collection('articles')
    .where('date', '==', date)
    .get();

  const urls = new Set<string>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as {
      original_url?: unknown;
      alternate_urls?: unknown;
    };
    if (typeof data.original_url === 'string' && data.original_url) {
      urls.add(data.original_url);
    }
    if (Array.isArray(data.alternate_urls)) {
      for (const alt of data.alternate_urls) {
        if (typeof alt === 'string' && alt) {
          urls.add(alt);
        }
      }
    }
  }
  return urls;
}

export async function saveDraftArticles(
  db: Firestore,
  articles: ArticleDocument[]
): Promise<number> {
  if (articles.length === 0) {
    return 0;
  }

  const batch = db.batch();
  for (const article of articles) {
    const docRef = db.collection('articles').doc(article.id);
    batch.set(docRef, article);
  }

  await batch.commit();
  return articles.length;
}

export async function loadActivePolicy(db: Firestore): Promise<ActivePolicyDoc> {
  try {
    const snap = await db.collection('config').doc('agent_policy').get();
    if (!snap.exists) {
      return DEFAULT_ACTIVE_POLICY;
    }
    const data = snap.data() as Partial<ActivePolicyDoc>;
    return {
      active_version: data.active_version || DEFAULT_ACTIVE_POLICY.active_version,
      settings: {
        ...DEFAULT_POLICY_SETTINGS,
        ...(data.settings || {}),
      },
      admin_instructions: data.admin_instructions || '',
      updated_at: data.updated_at,
      updated_by: data.updated_by,
    };
  } catch (err) {
    console.warn('Failed to load config/agent_policy, using defaults:', err);
    return DEFAULT_ACTIVE_POLICY;
  }
}

export async function loadRssSources(db: Firestore): Promise<RssSource[]> {
  try {
    const snap = await db.collection('config').doc('sources').get();
    if (!snap.exists) {
      return RSS_SOURCES;
    }
    const data = snap.data() as { sources?: RssSource[] };
    if (Array.isArray(data.sources) && data.sources.length > 0) {
      return data.sources;
    }
    return RSS_SOURCES;
  } catch (err) {
    console.warn('Failed to load config/sources, using defaults:', err);
    return RSS_SOURCES;
  }
}

