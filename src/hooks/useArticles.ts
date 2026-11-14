import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Article } from '@/types/article';

const OLDER_BATCH_SIZE = 10;

interface UseArticlesResult {
  articles: Article[];
  olderArticles: Article[];
  loading: boolean;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  error: string | null;
  isShowingFallback: boolean;
  loadOlderArticles: () => Promise<void>;
  loadMoreOlderArticles: () => Promise<void>;
}

/**
 * Fetches published articles for the consumer feed.
 * Falls back to the most recent published date if today's edition is not yet published.
 */
export function usePublishedArticles(): UseArticlesResult {
  const [articles, setArticles] = useState<Article[]>([]);
  const [olderArticles, setOlderArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderLoaded, setOlderLoaded] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const lastOlderDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isShowingFallback, setIsShowingFallback] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchArticles() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const articlesRef = collection(db, 'articles');
        const todayQuery = query(
          articlesRef,
          where('status', '==', 'published'),
          where('date', '==', today)
        );
        const todaySnapshot = await getDocs(todayQuery);

        if (!isMounted) return;

        if (!todaySnapshot.empty) {
          const items = todaySnapshot.docs.map((doc) => ({
            ...(doc.data() as Omit<Article, 'id'>),
            id: doc.id,
          }));
          setArticles(items);
          setIsShowingFallback(false);
          return;
        }

        // Fallback: fetch most recent published articles
        const fallbackQuery = query(
          articlesRef,
          where('status', '==', 'published'),
          orderBy('date', 'desc')
        );
        const fallbackSnapshot = await getDocs(fallbackQuery);

        if (!isMounted) return;

        if (fallbackSnapshot.empty) {
          setArticles([]);
          setIsShowingFallback(false);
        } else {
          const allPublished = fallbackSnapshot.docs.map((doc) => ({
            ...(doc.data() as Omit<Article, 'id'>),
            id: doc.id,
          }));
          const latestDate = allPublished[0].date;
          setArticles(allPublished.filter((a) => a.date === latestDate));
          setIsShowingFallback(true);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load articles');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchArticles();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadOlderArticles = useCallback(async () => {
    if (olderLoaded || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const articlesRef = collection(db, 'articles');
      const olderQuery = query(
        articlesRef,
        where('status', '==', 'published'),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(olderQuery);
      const currentDate = articles[0]?.date;
      const allPublished = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<Article, 'id'>),
        id: d.id,
      }));
      const filtered = currentDate
        ? allPublished.filter((a) => a.date !== currentDate)
        : allPublished;
      setOlderArticles(filtered);
      setOlderLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load older articles');
    } finally {
      setLoadingOlder(false);
    }
  }, [articles, loadingOlder, olderLoaded]);

  const loadMoreOlderArticles = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder) return;
    setLoadingOlder(true);
    try {
      const articlesRef = collection(db, 'articles');
      const currentDate =
        articles[0]?.date ?? new Date().toISOString().split('T')[0];

      const constraints = [
        where('status', '==', 'published'),
        where('date', '<', currentDate),
        orderBy('date', 'desc'),
        ...(lastOlderDocRef.current ? [startAfter(lastOlderDocRef.current)] : []),
        limit(OLDER_BATCH_SIZE + 1),
      ];

      const snapshot = await getDocs(query(articlesRef, ...constraints));
      const docs = snapshot.docs;
      const hasMore = docs.length > OLDER_BATCH_SIZE;
      const pageDocs = hasMore ? docs.slice(0, OLDER_BATCH_SIZE) : docs;

      if (pageDocs.length > 0) {
        lastOlderDocRef.current = pageDocs[pageDocs.length - 1];
      }

      const newItems = pageDocs.map((d) => ({
        ...(d.data() as Omit<Article, 'id'>),
        id: d.id,
      }));

      setOlderArticles((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...newItems.filter((a) => !seen.has(a.id))];
      });
      setHasMoreOlder(hasMore);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load older articles'
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [articles, hasMoreOlder, loadingOlder]);

  return {
    articles,
    olderArticles,
    loading,
    loadingOlder,
    hasMoreOlder,
    error,
    isShowingFallback,
    loadOlderArticles,
    loadMoreOlderArticles,
  };
}

interface UseDraftArticlesResult {
  drafts: Article[];
  loading: boolean;
  error: string | null;
  saveChanges: (id: string, headline: string, summary: string) => Promise<void>;
  approveArticle: (
    id: string,
    headline: string,
    summary: string,
    adminUid: string
  ) => Promise<void>;
  rejectArticle: (id: string) => Promise<void>;
}

/**
 * Subscribes to all articles with status === 'draft' for the Admin Dashboard,
 * sorted by lowest accuracy score first so human reviewers see risky drafts first.
 */
export function useDraftArticles(enabled = true): UseDraftArticlesResult {
  const [drafts, setDrafts] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const articlesRef = collection(db, 'articles');
    const draftsQuery = query(articlesRef, where('status', '==', 'draft'));

    const unsubscribe = onSnapshot(
      draftsQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((d) => ({
            ...(d.data() as Omit<Article, 'id'>),
            id: d.id,
          }))
          .sort((a, b) => {
            const accA = a.scores?.accuracy ?? a.confidence_score;
            const accB = b.scores?.accuracy ?? b.confidence_score;
            return accA - accB;
          });

        setDrafts(items);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load draft articles');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [enabled]);

  const saveChanges = useCallback(
    async (id: string, headline: string, summary: string) => {
      const now = new Date().toISOString();
      const ref = doc(db, 'articles', id);
      await updateDoc(ref, {
        ai_headline: headline.trim(),
        ai_summary: summary.trim(),
        edited_at: now,
        decision_history: arrayUnion({ action: 'edited', at: now }),
      });
    },
    []
  );

  const approveArticle = useCallback(
    async (id: string, headline: string, summary: string, adminUid: string) => {
      const now = new Date().toISOString();
      const ref = doc(db, 'articles', id);
      await updateDoc(ref, {
        ai_headline: headline.trim(),
        ai_summary: summary.trim(),
        status: 'published',
        approved_by: adminUid,
        approved_at: now,
        decision_history: arrayUnion({ action: 'approved', at: now }),
      });
    },
    []
  );

  const rejectArticle = useCallback(async (id: string, reason?: string) => {
    const now = new Date().toISOString();
    const ref = doc(db, 'articles', id);
    await updateDoc(ref, {
      status: 'rejected',
      rejected_at: now,
      ...(reason ? { rejection_reason: reason } : {}),
      decision_history: arrayUnion({ action: 'rejected', at: now }),
    });
  }, []);

  return {
    drafts,
    loading,
    error,
    saveChanges,
    approveArticle,
    rejectArticle,
  };
}

interface UseAdminArticlesResult {
  articles: Article[];
  loading: boolean;
  error: string | null;
  saveChanges: (id: string, headline: string, summary: string) => Promise<void>;
  approveArticle: (
    id: string,
    headline: string,
    summary: string,
    adminUid: string
  ) => Promise<void>;
  batchApproveArticles: (ids: string[], adminUid: string) => Promise<void>;
  batchRejectArticles: (ids: string[]) => Promise<void>;
  rejectArticle: (id: string, reason?: string) => Promise<void>;
  revertToDraft: (id: string) => Promise<void>;
  unpublishArticle: (id: string) => Promise<void>;
  confirmKidsTopic: (id: string, confirmed: boolean) => Promise<void>;
  confirmSourceChecked: (id: string, checked: boolean) => Promise<void>;
}

/**
 * Subscribes to all articles (draft, published, rejected) for the Admin Dashboard,
 * sorted by date descending and then lowest accuracy score first.
 */
export function useAdminArticles(enabled = true): UseAdminArticlesResult {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const articlesRef = collection(db, 'articles');
    const allQuery = query(articlesRef, orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(
      allQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((d) => ({
            ...(d.data() as Omit<Article, 'id'>),
            id: d.id,
          }))
          .sort((a, b) => {
            if (a.date !== b.date) {
              return b.date.localeCompare(a.date);
            }
            const accA = a.scores?.accuracy ?? a.confidence_score;
            const accB = b.scores?.accuracy ?? b.confidence_score;
            return accA - accB;
          });

        setArticles(items);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load articles');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [enabled]);

  const saveChanges = useCallback(
    async (id: string, headline: string, summary: string) => {
      const now = new Date().toISOString();
      const ref = doc(db, 'articles', id);
      await updateDoc(ref, {
        ai_headline: headline.trim(),
        ai_summary: summary.trim(),
        edited_at: now,
        decision_history: arrayUnion({ action: 'edited', at: now }),
      });
    },
    []
  );

  const approveArticle = useCallback(
    async (id: string, headline: string, summary: string, adminUid: string) => {
      const now = new Date().toISOString();
      const ref = doc(db, 'articles', id);
      await updateDoc(ref, {
        ai_headline: headline.trim(),
        ai_summary: summary.trim(),
        status: 'published',
        approved_by: adminUid,
        approved_at: now,
        decision_history: arrayUnion({ action: 'approved', at: now }),
      });
    },
    []
  );

  const rejectArticle = useCallback(async (id: string, reason?: string) => {
    const now = new Date().toISOString();
    const ref = doc(db, 'articles', id);
    await updateDoc(ref, {
      status: 'rejected',
      rejected_at: now,
      ...(reason ? { rejection_reason: reason } : {}),
      decision_history: arrayUnion({ action: 'rejected', at: now }),
    });
  }, []);

  const revertToDraft = useCallback(async (id: string) => {
    const ref = doc(db, 'articles', id);
    await updateDoc(ref, {
      status: 'draft',
      approved_by: null,
      approved_at: null,
      rejected_at: null,
      rejection_reason: null,
    });
  }, []);

  const unpublishArticle = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    const ref = doc(db, 'articles', id);
    await updateDoc(ref, {
      status: 'draft',
      approved_by: null,
      approved_at: null,
      decision_history: arrayUnion({ action: 'unpublished', at: now }),
    });
  }, []);

  const confirmKidsTopic = useCallback(async (id: string, confirmed: boolean) => {
    const ref = doc(db, 'articles', id);
    await updateDoc(ref, {
      kids_topic_confirmed: confirmed,
    });
  }, []);

  const confirmSourceChecked = useCallback(async (id: string, checked: boolean) => {
    const ref = doc(db, 'articles', id);
    await updateDoc(ref, {
      source_checked: checked,
    });
  }, []);

  const batchApproveArticles = useCallback(
    async (ids: string[], adminUid: string) => {
      const now = new Date().toISOString();
      await Promise.all(
        ids.map((id) =>
          updateDoc(doc(db, 'articles', id), {
            status: 'published',
            approved_by: adminUid,
            approved_at: now,
            decision_history: arrayUnion({ action: 'approved', at: now }),
          })
        )
      );
    },
    []
  );

  const batchRejectArticles = useCallback(async (ids: string[]) => {
    const now = new Date().toISOString();
    await Promise.all(
      ids.map((id) =>
        updateDoc(doc(db, 'articles', id), {
          status: 'rejected',
          rejected_at: now,
          decision_history: arrayUnion({ action: 'rejected', at: now }),
        })
      )
    );
  }, []);

  return {
    articles,
    loading,
    error,
    saveChanges,
    approveArticle,
    batchApproveArticles,
    batchRejectArticles,
    rejectArticle,
    revertToDraft,
    unpublishArticle,
    confirmKidsTopic,
    confirmSourceChecked,
  };
}

