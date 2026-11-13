import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { APP_CONFIG } from '@/config/appConfig';

export type EditorRole = 'admin' | 'editor' | null;

export function useAdminAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const normalizedEmail = user?.email?.toLowerCase() ?? '';
  const isAdmin = Boolean(
    normalizedEmail && APP_CONFIG.adminEmails.includes(normalizedEmail)
  );
  const isEditor = Boolean(
    normalizedEmail && APP_CONFIG.editorEmails.includes(normalizedEmail)
  );
  const isAuthorized = isAdmin || isEditor;
  const role: EditorRole = isAdmin ? 'admin' : isEditor ? 'editor' : null;

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign in failed');
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Account creation failed');
    }
  }, []);

  const logOut = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const getIdToken = useCallback(async (): Promise<string> => {
    if (!auth.currentUser) {
      throw new Error('Not signed in');
    }
    return auth.currentUser.getIdToken();
  }, []);

  return {
    user,
    loading,
    isAuthorized,
    isAdmin,
    role,
    authError,
    signIn,
    signUp,
    logOut,
    getIdToken,
  };
}
