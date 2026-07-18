import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { fetchSystemStats, trackInteraction } from '../services/apiClient';

// ─── Context shape ────────────────────────────────────────────────────────────

interface AppContextType {
  // Authentication
  user: any;
  profile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  loading: boolean;

  // Navigation
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;

  // Opportunity detail routing
  selectedOppId: string | null;
  setSelectedOppId: (id: string | null) => void;
  viewOpportunity: (id: string, title?: string) => void;
  clearSelectedOpportunity: () => void;

  // Bookmarks — dedicated slice to avoid full-profile re-renders on toggle
  bookmarkedIds: string[];
  toggleBookmark: (opportunityId: string) => Promise<void>;
  isBookmarked: (opportunityId: string) => boolean;

  // Explore search query — shared across Topbar and Opportunities
  appSearchQuery: string;
  setAppSearchQuery: (query: string) => void;

  // Backend status
  backendReady: boolean;
  lastSyncedTime: string;

  // UI theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  gettingStartedStep: string | null;
  setGettingStartedStep: (step: string | null) => void;
}

// ─── Context creation ─────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Navigation state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Opportunity detail routing
  const [selectedOppId, setSelectedOppId] = useState<string | null>(() => {
    const oppMatch = window.location.pathname.match(/^\/opportunity\/([^/]+)/);
    return oppMatch ? oppMatch[1] : null;
  });

  // Bookmarks — kept as a separate string[] for fine-grained subscriptions.
  // Initialised from profile.bookmarks after auth, then updated independently
  // so bookmark toggles don't re-render every profile consumer.
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);

  // Explore search query
  const [appSearchQuery, setAppSearchQuery] = useState('');

  // Backend status
  const [backendReady, setBackendReady] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState(new Date().toLocaleTimeString());

  // UI theme — persisted to localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('yuvahub-theme');
    if (saved) return saved === 'dark' ? 'dark' : 'light';
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  // ─── Theme sync ──────────────────────────────────────────────────────────────

  const [gettingStartedStep, setGettingStartedStep] = useState<string | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('yuvahub-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // ─── Backend health check ─────────────────────────────────────────────────────

  useEffect(() => {
    const verifyFeedEndpoint = async () => {
      try {
        const response = await fetch("/api/v1/opportunities");
        const text = await response.text();
        try { JSON.parse(text); } catch {}
      } catch (err) {
        console.error('[Verify Feed] Error:', err);
      }
    };
    verifyFeedEndpoint();

    const checkBackend = async () => {
      const stats = await fetchSystemStats();
      if (stats) {
        setBackendReady(true);
        setLastSyncedTime(new Date().toLocaleTimeString());
      } else {
        setBackendReady(false);
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 60000);
    return () => clearInterval(interval);
  }, []);

  // ─── Opportunity URL routing ──────────────────────────────────────────────────

  useEffect(() => {
    const handleLocationChange = () => {
      const oppMatch = window.location.pathname.match(/^\/opportunity\/([^/]+)/);
      setSelectedOppId(oppMatch ? oppMatch[1] : null);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const viewOpportunity = useCallback((id: string, title?: string) => {
    const cleanTitle = title
      ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : 'view';
    window.history.pushState(null, '', `/opportunity/${id}/${cleanTitle}`);
    setSelectedOppId(id);
  }, []);

  const clearSelectedOpportunity = useCallback(() => {
    window.history.pushState(null, '', '/');
    setSelectedOppId(null);
  }, []);

  // ─── Auth + profile sync ──────────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken(true);
          const response = await fetch('/api/v1/auth/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.profile) {
              setProfile(data.profile as UserProfile);
              // Seed the bookmarks slice from the synced profile
              setBookmarkedIds(data.profile.bookmarks ?? []);
            } else {
              throw new Error('No profile returned from sync endpoint');
            }
          } else {
            throw new Error('Backend sync failed with status ' + response.status);
          }
        } catch (error) {
          console.warn('MongoDB auth sync failed, falling back to Firestore:', error);
          try {
            const docRef = doc(db, 'users', currentUser.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              setProfile(data);
              setBookmarkedIds(data.bookmarks ?? []);
            } else {
              const fallback: UserProfile = {
                uid: currentUser.uid,
                name: currentUser.displayName || '',
                email: currentUser.email || '',
                avatarUrl: currentUser.photoURL || '',
              };
              setProfile(fallback);
              setBookmarkedIds([]);
            }
          } catch (fsError) {
            console.error('Firestore fallback sync failed:', fsError);
            setProfile({
              uid: currentUser.uid,
              name: currentUser.displayName || '',
              email: currentUser.email || '',
              avatarUrl: currentUser.photoURL || '',
            });
            setBookmarkedIds([]);
          }
        }
      } else {
        setProfile(null);
        setBookmarkedIds([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ─── Bookmark actions ─────────────────────────────────────────────────────────

  /**
   * Toggles a bookmark for the given opportunity ID.
   * Updates Firestore and local state optimistically so the Bookmarks tab,
   * Opportunities feed, and any OpportunityCard all reflect the change instantly
   * without passing props or re-rendering unrelated components.
   */
  const toggleBookmark = useCallback(async (opportunityId: string) => {
    if (!profile?.uid) return;

    const alreadyBookmarked = bookmarkedIds.includes(opportunityId);

    // Optimistic update — UI reflects immediately
    setBookmarkedIds(prev =>
      alreadyBookmarked
        ? prev.filter(id => id !== opportunityId)
        : [...prev, opportunityId]
    );

    // Keep profile.bookmarks in sync so dependent code (e.g. Bookmarks tab) still works
    setProfile(prev =>
      prev
        ? {
            ...prev,
            bookmarks: alreadyBookmarked
              ? (prev.bookmarks ?? []).filter(id => id !== opportunityId)
              : [...(prev.bookmarks ?? []), opportunityId],
          }
        : prev
    );

    try {
      const userRef = doc(db, 'users', profile.uid);
      if (alreadyBookmarked) {
        await updateDoc(userRef, { bookmarks: arrayRemove(opportunityId) });
      } else {
        await updateDoc(userRef, { bookmarks: arrayUnion(opportunityId) });
      }
      trackInteraction(opportunityId, alreadyBookmarked ? 'view' : 'save');
    } catch (err) {
      console.error('Bookmark toggle failed, rolling back:', err);
      // Roll back on Firestore failure
      setBookmarkedIds(prev =>
        alreadyBookmarked
          ? [...prev, opportunityId]
          : prev.filter(id => id !== opportunityId)
      );
      setProfile(prev =>
        prev
          ? {
              ...prev,
              bookmarks: alreadyBookmarked
                ? [...(prev.bookmarks ?? []), opportunityId]
                : (prev.bookmarks ?? []).filter(id => id !== opportunityId),
            }
          : prev
      );
    }
  }, [profile, bookmarkedIds]);

  /** Convenience selector — avoids creating new arrays in render paths */
  const isBookmarked = useCallback(
    (opportunityId: string) => bookmarkedIds.includes(opportunityId),
    [bookmarkedIds]
  );

  // ─── Context value ────────────────────────────────────────────────────────────

  return (
    <AppContext.Provider value={{
      activeTab,
      setActiveTab,
      isMobileMenuOpen,
      setIsMobileMenuOpen,
      user,
      profile,
      setProfile,
      loading,
      backendReady,
      lastSyncedTime,
      appSearchQuery,
      setAppSearchQuery,
      selectedOppId,
      setSelectedOppId,
      viewOpportunity,
      clearSelectedOpportunity,
      theme,
      toggleTheme,
      gettingStartedStep,
      setGettingStartedStep
    }}>
      {children}
    </AppContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
