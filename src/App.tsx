/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, Component, ReactNode, ErrorInfo } from 'react';
import { 
  Search, MapPin, Bell, ExternalLink, Filter, Info, 
  Briefcase, GraduationCap, X, Check, User, Sparkles, 
  BellOff, Settings, ChevronRight, Sliders, Globe, 
  Calendar, ArrowRight, LayoutGrid, List, AlertTriangle, RefreshCw,
  Bookmark, BookmarkCheck, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchEventsAndSchemes } from './services/geminiService';
import { Event, UserLocation, UserProfile, Notification } from './types';
import { cn } from './lib/utils';
import { auth, signInWithGoogle, logout, db } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import emailjs from '@emailjs/browser';

const INTEREST_OPTIONS = [
  "Technology", "Education", "Healthcare", "Agriculture", "Finance", 
  "Environment", "Social Welfare", "Startup", "Women Empowerment", "Skill Development"
];

interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [events, setEvents] = useState<Event[]>(() => {
    const saved = localStorage.getItem('cached_events');
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'hackathon' | 'scheme' | 'program'>('all');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [nearbyEvents, setNearbyEvents] = useState<Event[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [fetchingSubscribers, setFetchingSubscribers] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem('user_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  
  const isAdmin = user?.email === 'uditt490@gmail.com';
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('user_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [showSettings, setShowSettings] = useState(!profile);
  const [tempProfile, setTempProfile] = useState<UserProfile>(() => profile || {
    location: '',
    age: '',
    interests: [],
    notificationsEnabled: false
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Sync profile from Firestore
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            setProfile(data);
            setTempProfile(data);
            localStorage.setItem('user_profile', JSON.stringify(data));
          }
        } catch (err) {
          console.error("Error syncing profile:", err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Track notified events
  const [notifiedEventIds, setNotifiedEventIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('notified_event_ids');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    // Check for API key on mount
    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not set. Please add it to your environment variables.");
      setApiKeyMissing(true);
    }
    loadInitialData();
    getUserLocation();
  }, [profile]);

  const addToast = useCallback((title: string, message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const loadInitialData = async () => {
    if (!process.env.GEMINI_API_KEY) {
      setLoading(false);
      return;
    }
    
    // Only show loading if we have no cached events
    if (events.length === 0) {
      setLoading(true);
    } else {
      setIsUpdating(true);
    }

    try {
      const data = await fetchEventsAndSchemes(searchQuery, profile || undefined);
      if (data && data.length > 0) {
        // Check for new events to notify
        if (profile?.notificationsEnabled && events.length > 0) {
          const currentIds = new Set(events.map(e => e.id));
          const newEvents = data.filter(e => !currentIds.has(e.id));
          
          if (newEvents.length > 0) {
            addNotification(
              "New Opportunities!",
              `We found ${newEvents.length} new events matching your interests.`,
              "new_event"
            );
          }
        }

        setEvents(data);
        localStorage.setItem('cached_events', JSON.stringify(data));
      }
    } catch (err) {
      console.error("Failed to fetch events:", err);
      if (events.length === 0) {
        addToast("Fetch Error", "Could not load events. Check your API key.", "warning");
      }
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  };

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  };

  const handleSaveProfile = async () => {
    if (!tempProfile.location || !tempProfile.age || tempProfile.interests.length === 0) {
      addToast("Missing Info", "Please fill in all fields and select at least one interest.", "warning");
      return;
    }

    setProfile(tempProfile);
    localStorage.setItem('user_profile', JSON.stringify(tempProfile));
    setShowSettings(false);

    // Save to Firestore if logged in
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          ...tempProfile,
          uid: user.uid,
          email: user.email,
          updatedAt: serverTimestamp()
        });
        addToast("Sync Complete", "Your profile is now synced to the cloud.", "success");
      } catch (err) {
        console.error("Error saving profile:", err);
        addToast("Sync Error", "Could not sync profile to cloud.", "warning");
      }
    } else {
      addToast("Profile Saved", "Saved locally. Log in to sync across devices.", "success");
    }
  };

  const handleNewsletterSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    
    setSubscribing(true);
    try {
      const email = newsletterEmail.toLowerCase();
      await setDoc(doc(db, 'newsletter', email), {
        email: email,
        subscribedAt: serverTimestamp()
      });
      
      // Send Email Notification via EmailJS (Free Tier)
      const serviceId = process.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = process.env.VITE_EMAILJS_TEMPLATE_ID;
      const publicKey = process.env.VITE_EMAILJS_PUBLIC_KEY;

      if (serviceId && templateId && publicKey) {
        try {
          await emailjs.send(
            serviceId,
            templateId,
            {
              to_email: 'uditt490@gmail.com',
              subscriber_email: email,
              timestamp: new Date().toLocaleString()
            },
            publicKey
          );
        } catch (emailErr) {
          console.error("Email notification failed:", emailErr);
        }
      }

      addToast("Subscribed!", "You've been added to our newsletter.", "success");
      setNewsletterEmail('');
    } catch (err) {
      console.error("Newsletter error:", err);
      addToast("Error", "Could not subscribe. Please try again.", "warning");
    } finally {
      setSubscribing(false);
    }
  };

  const fetchSubscribers = async () => {
    if (!isAdmin) return;
    setFetchingSubscribers(true);
    try {
      const q = query(collection(db, 'newsletter'), orderBy('subscribedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => doc.data());
      setSubscribers(list);
    } catch (err) {
      console.error("Error fetching subscribers:", err);
      addToast("Error", "Could not load subscribers.", "warning");
    } finally {
      setFetchingSubscribers(false);
    }
  };

  useEffect(() => {
    if (isAdmin && showAdmin) {
      fetchSubscribers();
    }
  }, [isAdmin, showAdmin]);

  const toggleInterest = (interest: string) => {
    setTempProfile(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const toggleBookmark = async (eventId: string) => {
    if (!profile) {
      setShowSettings(true);
      addToast("Profile Required", "Please set up your profile to bookmark events.", "info");
      return;
    }

    const isBookmarked = profile.bookmarkedEventIds?.includes(eventId);
    const newBookmarks = isBookmarked
      ? (profile.bookmarkedEventIds || []).filter(id => id !== eventId)
      : [...(profile.bookmarkedEventIds || []), eventId];

    const updatedProfile = { ...profile, bookmarkedEventIds: newBookmarks };
    setProfile(updatedProfile);
    setTempProfile(updatedProfile);
    localStorage.setItem('user_profile', JSON.stringify(updatedProfile));

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          ...updatedProfile,
          uid: user.uid,
          email: user.email,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Error syncing bookmark:", err);
      }
    }

    addToast(
      isBookmarked ? "Bookmark Removed" : "Event Bookmarked",
      isBookmarked ? "Removed from your saved list." : "Saved to your bookmarks.",
      "success"
    );
  };

  const addNotification = (title: string, message: string, type: Notification['type'], link?: string) => {
    const newNotif: Notification = {
      id: Math.random().toString(36).substring(2, 9),
      title,
      message,
      timestamp: Date.now(),
      read: false,
      type,
      link
    };
    const updatedNotifs = [newNotif, ...notifications].slice(0, 50);
    setNotifications(updatedNotifs);
    localStorage.setItem('user_notifications', JSON.stringify(updatedNotifs));
    
    if (profile?.notificationsEnabled) {
      addToast(title, message, "info");
    }
  };

  const markNotificationAsRead = (id: string) => {
    const updatedNotifs = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    setNotifications(updatedNotifs);
    localStorage.setItem('user_notifications', JSON.stringify(updatedNotifs));
  };

  const clearNotifications = () => {
    setNotifications([]);
    localStorage.removeItem('user_notifications');
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    if (userLocation && events.length > 0) {
      const nearby = events.filter(event => {
        if (event.coordinates) {
          const distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            event.coordinates.lat,
            event.coordinates.lng
          );
          return distance < 50;
        }
        return false;
      });
      setNearbyEvents(nearby);

      if (profile?.notificationsEnabled) {
        const newNearbyEvents = nearby.filter(event => !notifiedEventIds.has(event.id));
        if (newNearbyEvents.length > 0) {
          newNearbyEvents.forEach(event => {
            addToast(
              "Nearby Opportunity!",
              `${event.title} is happening near you.`,
              "info"
            );
          });
          
          const updatedIds = new Set([...notifiedEventIds, ...newNearbyEvents.map(e => e.id)]);
          setNotifiedEventIds(updatedIds);
          localStorage.setItem('notified_event_ids', JSON.stringify(Array.from(updatedIds)));
        }
      }
    }
  }, [userLocation, events, profile?.notificationsEnabled, notifiedEventIds, addToast]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          event.organization.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          event.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterType === 'all' || event.type === filterType;
      return matchesSearch && matchesFilter;
    });
  }, [events, searchQuery, filterType]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const data = await fetchEventsAndSchemes(searchQuery, profile || undefined);
    setEvents(data);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 max-w-[calc(100vw-3rem)] sm:max-w-md w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={cn(
                "pointer-events-auto p-4 rounded-2xl shadow-2xl border flex items-start gap-4 backdrop-blur-md",
                toast.type === 'success' ? "bg-emerald-50/95 border-emerald-100" : 
                toast.type === 'warning' ? "bg-amber-50/95 border-amber-100" : 
                "bg-white/95 border-slate-200"
              )}
            >
              <div className={cn(
                "p-2 rounded-xl",
                toast.type === 'success' ? "bg-emerald-100 text-emerald-600" : 
                toast.type === 'warning' ? "bg-amber-100 text-amber-600" : 
                "bg-indigo-100 text-indigo-600"
              )}>
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-slate-900 truncate">{toast.title}</h4>
                <p className="text-xs mt-0.5 text-slate-600 line-clamp-2">{toast.message}</p>
              </div>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Notifications Slide-over */}
      <AnimatePresence>
        {showNotifications && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-[110] w-full sm:max-w-md bg-white shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 p-2 rounded-xl">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Notifications</h2>
                </div>
                <div className="flex items-center gap-2">
                  {notifications.length > 0 && (
                    <button 
                      onClick={clearNotifications}
                      className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                      title="Clear all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={() => setShowNotifications(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <div 
                      key={notif.id}
                      onClick={() => markNotificationAsRead(notif.id)}
                      className={cn(
                        "p-4 rounded-2xl border transition-all cursor-pointer",
                        notif.read ? "bg-white border-slate-100 opacity-60" : "bg-indigo-50/50 border-indigo-100 shadow-sm"
                      )}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-sm font-bold text-slate-900">{notif.title}</h4>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed mb-2">{notif.message}</p>
                      {notif.link && (
                        <a 
                          href={notif.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1 hover:underline"
                        >
                          View Details <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BellOff className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-500 font-medium">No notifications yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bookmarks Slide-over */}
      <AnimatePresence>
        {showBookmarks && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBookmarks(false)}
              className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-[110] w-full sm:max-w-md bg-white shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-500 p-2 rounded-xl">
                    <Bookmark className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Saved Events</h2>
                </div>
                <button 
                  onClick={() => setShowBookmarks(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {profile?.bookmarkedEventIds && profile.bookmarkedEventIds.length > 0 ? (
                  events.filter(e => profile.bookmarkedEventIds?.includes(e.id)).map((event) => (
                    <div key={event.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 group hover:border-indigo-300 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{event.title}</h4>
                        <button 
                          onClick={() => toggleBookmark(event.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{event.organization}</p>
                      <a 
                        href={event.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                      >
                        Apply <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bookmark className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-500 font-medium">No saved events yet.</p>
                    <button 
                      onClick={() => setShowBookmarks(false)}
                      className="mt-4 text-indigo-600 font-black text-xs uppercase tracking-widest hover:underline"
                    >
                      Browse Opportunities
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Admin Slide-over Panel */}
      <AnimatePresence>
        {showAdmin && isAdmin && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdmin(false)}
              className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-[110] w-full sm:max-w-xl bg-white shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-500 p-2 rounded-xl">
                    <LayoutGrid className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Subscribers</h2>
                </div>
                <button 
                  onClick={() => setShowAdmin(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {fetchingSubscribers ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading list...</p>
                  </div>
                ) : subscribers.length > 0 ? (
                  <div className="space-y-3">
                    {subscribers.map((sub, idx) => (
                      <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between group hover:border-indigo-300 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-200 text-indigo-600 font-black text-xs">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{sub.email}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              {sub.subscribedAt?.toDate ? sub.subscribedAt.toDate().toLocaleString() : 'Just now'}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(sub.email);
                            addToast("Copied", "Email address copied to clipboard.", "success");
                          }}
                          className="p-2 opacity-0 group-hover:opacity-100 hover:bg-white rounded-lg transition-all text-slate-400 hover:text-indigo-600 border border-transparent hover:border-slate-200"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <User className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-500 font-medium">No subscribers yet.</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                <button 
                  onClick={fetchSubscribers}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Refresh List
                </button>
                <button 
                  onClick={() => {
                    const csv = "Email,Date\n" + subscribers.map(s => `${s.email},${s.subscribedAt?.toDate ? s.subscribedAt.toDate().toISOString() : ''}`).join("\n");
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.setAttribute('hidden', '');
                    a.setAttribute('href', url);
                    a.setAttribute('download', 'subscribers.csv');
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  Export CSV
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings Slide-over Panel */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => profile && setShowSettings(false)}
              className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-[110] w-full sm:max-w-md bg-white shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 p-2 rounded-xl">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Preferences</h2>
                </div>
                {profile && (
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Identity & Location</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Current Location</label>
                      <div className="relative group">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                        <input 
                          type="text" 
                          placeholder="e.g. Mumbai, Maharashtra"
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                          value={tempProfile.location}
                          onChange={(e) => setTempProfile(prev => ({ ...prev, location: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Your Age</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 21"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                        value={tempProfile.age}
                        onChange={(e) => setTempProfile(prev => ({ ...prev, age: e.target.value ? parseInt(e.target.value) : '' }))}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Interests</h3>
                  <div className="flex flex-wrap gap-2">
                    {INTEREST_OPTIONS.map(interest => (
                      <button
                        key={interest}
                        onClick={() => toggleInterest(interest)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-medium transition-all border",
                          tempProfile.interests.includes(interest)
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100"
                            : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                        )}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Notifications</h3>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl transition-colors",
                        tempProfile.notificationsEnabled ? "bg-indigo-100 text-indigo-600" : "bg-slate-200 text-slate-500"
                      )}>
                        {tempProfile.notificationsEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">Nearby Alerts</p>
                        <p className="text-xs text-slate-500">Events within 50km</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setTempProfile(prev => ({ ...prev, notificationsEnabled: !prev.notificationsEnabled }))}
                      className={cn(
                        "w-11 h-6 rounded-full relative transition-all duration-300",
                        tempProfile.notificationsEnabled ? "bg-indigo-600" : "bg-slate-300"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm",
                        tempProfile.notificationsEnabled ? "left-6" : "left-1"
                      )} />
                    </button>
                  </div>
                </section>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                <button 
                  onClick={handleSaveProfile}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
                >
                  Save Preferences
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div className="hidden xs:block">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 uppercase">EventHub</h1>
                <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase -mt-1">Opportunities</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              {apiKeyMissing && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="hidden sm:inline">API Key Missing</span>
                </div>
              )}
              
              {user ? (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex flex-col items-end mr-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Logged in as</p>
                    <p className="text-xs font-black text-slate-900 truncate max-w-[120px]">{user.displayName || user.email}</p>
                  </div>
                  <button 
                    onClick={() => logout()}
                    className="p-2.5 hover:bg-red-50 rounded-xl transition-colors text-red-500 active:scale-95 border border-transparent hover:border-red-100"
                    title="Logout"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => signInWithGoogle()}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-100"
                >
                  <User className="w-4 h-4" />
                  <span>Login</span>
                </button>
              )}

              {isAdmin && (
                <button 
                  onClick={() => setShowAdmin(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-100 rounded-xl text-xs sm:text-sm font-bold text-amber-700 hover:bg-amber-200 transition-all active:scale-95"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden md:inline">Admin</span>
                </button>
              )}

              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(true)}
                  className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-600 active:scale-95 border border-transparent hover:border-slate-200 relative"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />
                  )}
                </button>
              </div>

              <button 
                onClick={() => setShowBookmarks(true)}
                className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-600 active:scale-95 border border-transparent hover:border-slate-200"
                title="Bookmarks"
              >
                <Bookmark className="w-5 h-5" />
              </button>

              {profile && (
                <button 
                  onClick={() => {
                    setTempProfile(profile);
                    setShowSettings(true);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-200 transition-all active:scale-95"
                >
                  <Sliders className="w-4 h-4" />
                  <span className="hidden md:inline">Preferences</span>
                </button>
              )}
              <button 
                onClick={getUserLocation}
                className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-600 active:scale-95 border border-transparent hover:border-slate-200"
                title="Refresh Location"
              >
                <MapPin className={cn("w-5 h-5", userLocation ? "text-indigo-600" : "text-slate-400")} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero Section */}
        <div className="mb-10 sm:mb-16 text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest mb-6 border border-indigo-100"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Curated for you
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight mb-4 sm:mb-6"
          >
            Your Next Big <span className="text-indigo-600">Break.</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-base sm:text-xl text-slate-500 max-w-2xl mx-auto font-medium leading-relaxed"
          >
            Discover corporate hackathons, government schemes, and educational programs tailored to your unique profile.
          </motion.p>
        </div>

        {/* Search and Filter Controls */}
        <div className="mb-10 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Explore Opportunities</h3>
            {isUpdating && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                UPDATING
              </div>
            )}
          </div>
          <div className="flex flex-col lg:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input
                type="text"
                placeholder="Search hackathons, schemes, programs, or companies..."
                className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm text-sm sm:text-base"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            
            <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
              <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                {(['all', 'hackathon', 'scheme', 'program'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={cn(
                      "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold capitalize transition-all",
                      filterType === type 
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" 
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
              
              <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={cn("p-2 rounded-xl transition-all", viewMode === 'grid' ? "bg-slate-100 text-indigo-600" : "text-slate-400")}
                >
                  <LayoutGrid className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn("p-2 rounded-xl transition-all", viewMode === 'list' ? "bg-slate-100 text-indigo-600" : "text-slate-400")}
                >
                  <List className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Nearby Alert */}
        <AnimatePresence>
          {nearbyEvents.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-10"
            >
              <div className="bg-indigo-600 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl shadow-indigo-200">
                <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md">
                    <MapPin className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-center sm:text-left flex-1">
                    <h3 className="text-xl sm:text-2xl font-black mb-2">Local Opportunities Detected!</h3>
                    <p className="text-indigo-100 font-medium mb-6">
                      We found {nearbyEvents.length} events within 50km of your current location. Don't miss out on what's happening in your backyard.
                    </p>
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setFilterType('all');
                        window.scrollTo({ top: 800, behavior: 'smooth' });
                      }}
                      className="px-6 py-3 bg-white text-indigo-600 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-50 transition-colors shadow-lg"
                    >
                      View Local Events
                    </button>
                  </div>
                </div>
                {/* Decorative elements */}
                <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute -left-10 -top-10 w-40 h-40 bg-indigo-400/20 rounded-full blur-3xl" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Event Content */}
        {apiKeyMissing ? (
          <div className="text-center py-24 bg-white rounded-[40px] border border-red-100 shadow-xl shadow-red-50/50">
            <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">API Key Required</h3>
            <p className="text-slate-500 font-medium max-w-md mx-auto mb-8">
              To fetch real opportunities, you need to set your Gemini API Key in your environment variables. 
              If you are using <b>Vercel</b>, add <code className="bg-slate-100 px-1 rounded">GEMINI_API_KEY</code> in your project settings.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all"
              >
                Get Free API Key
              </a>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all"
              >
                I've set the key, reload
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className={cn(
            "grid gap-6",
            viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
          )}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-3xl p-8 border border-slate-200 animate-pulse">
                <div className="h-4 bg-slate-100 rounded-full w-24 mb-6"></div>
                <div className="h-8 bg-slate-100 rounded-xl w-3/4 mb-4"></div>
                <div className="h-4 bg-slate-50 rounded-full w-1/2 mb-8"></div>
                <div className="space-y-3">
                  <div className="h-3 bg-slate-50 rounded-full w-full"></div>
                  <div className="h-3 bg-slate-50 rounded-full w-full"></div>
                  <div className="h-3 bg-slate-50 rounded-full w-2/3"></div>
                </div>
                <div className="mt-10 h-14 bg-slate-100 rounded-2xl"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn(
            "grid gap-6",
            viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
          )}>
            {filteredEvents.map((event) => (
              <motion.div
                layout
                key={event.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "group bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-100 transition-all duration-500 flex flex-col relative overflow-hidden",
                  viewMode === 'list' && "md:flex-row md:items-center md:gap-8"
                )}
              >
                <div className={cn("flex flex-col flex-1", viewMode === 'list' && "md:flex-[2]")}>
                  <div className="flex items-center gap-3 mb-6">
                    <span className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                      event.type === 'hackathon' ? "bg-amber-100 text-amber-700" : 
                      event.type === 'scheme' ? "bg-emerald-100 text-emerald-700" :
                      "bg-indigo-100 text-indigo-700"
                    )}>
                      {event.type}
                    </span>
                    {event.price && (
                      <span className={cn(
                        "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                        event.price.toLowerCase() === 'free' ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                      )}>
                        {event.price}
                      </span>
                    )}
                    {event.coordinates && userLocation && calculateDistance(userLocation.lat, userLocation.lng, event.coordinates.lat, event.coordinates.lng) < 50 && (
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">
                        <MapPin className="w-3 h-3" /> Nearby
                      </span>
                    )}
                  </div>

                  <button 
                    onClick={() => toggleBookmark(event.id)}
                    className={cn(
                      "absolute top-6 right-6 sm:top-8 sm:right-8 p-2 rounded-xl transition-all active:scale-90 z-20",
                      profile?.bookmarkedEventIds?.includes(event.id)
                        ? "bg-amber-100 text-amber-600 shadow-sm"
                        : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                    )}
                  >
                    {profile?.bookmarkedEventIds?.includes(event.id) ? (
                      <BookmarkCheck className="w-5 h-5" />
                    ) : (
                      <Bookmark className="w-5 h-5" />
                    )}
                  </button>

                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors leading-tight pr-10">
                    {event.title}
                  </h3>
                  <p className="text-sm font-bold text-slate-400 mb-6 flex items-center gap-2 uppercase tracking-wide">
                    {event.type === 'program' ? <GraduationCap className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />} {event.organization}
                  </p>

                  <p className="text-slate-500 text-sm sm:text-base mb-8 line-clamp-3 leading-relaxed">
                    {event.description}
                  </p>
                </div>

                <div className={cn(
                  "space-y-4 pt-6 border-t border-slate-100",
                  viewMode === 'list' && "md:border-t-0 md:pt-0 md:border-l md:pl-8 md:space-y-3 md:flex-1"
                )}>
                  <div className="flex items-center gap-3 text-xs sm:text-sm font-bold text-slate-600">
                    <div className="bg-slate-100 p-2 rounded-lg">
                      <Globe className="w-4 h-4" />
                    </div>
                    <span>{event.location}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs sm:text-sm font-bold text-slate-600">
                    <div className="bg-slate-100 p-2 rounded-lg">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <span>{event.date}</span>
                  </div>
                  
                  <a
                    href={event.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all group-hover:shadow-xl active:scale-[0.98]",
                      viewMode === 'list' && "md:mt-4"
                    )}
                  >
                    Apply Now <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && filteredEvents.length === 0 && (
          <div className="text-center py-24 bg-white rounded-[40px] border border-dashed border-slate-300">
            <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Info className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">No matches found</h3>
            <p className="text-slate-500 font-medium">Try adjusting your search or preferences.</p>
            <button 
              onClick={() => { setSearchQuery(''); setFilterType('all'); }}
              className="mt-8 text-indigo-600 font-black text-sm uppercase tracking-widest hover:text-indigo-700"
            >
              Clear all filters
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-16 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-16">
            <div className="lg:col-span-1">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-slate-900 p-2 rounded-xl">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-black tracking-tight text-slate-900 uppercase">EventHub</span>
              </div>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">
                Empowering your career journey by bringing the best hackathons, government schemes, and educational programs directly to you.
              </p>
            </div>
            
            <div className="lg:col-span-2">
              <div className="bg-slate-50 rounded-[32px] p-8 border border-slate-100">
                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                  <div>
                    <h4 className="text-xl font-black text-slate-900 mb-2">Join our newsletter</h4>
                    <p className="text-slate-500 text-sm font-medium">Get weekly updates on new opportunities near you.</p>
                  </div>
                  <form onSubmit={handleNewsletterSubscribe} className="w-full md:w-auto flex flex-col sm:flex-row gap-3">
                    <input 
                      type="email" 
                      placeholder="Enter your email"
                      required
                      className="px-6 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm min-w-[260px]"
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                    />
                    <button 
                      type="submit"
                      disabled={subscribing}
                      className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                    >
                      {subscribing ? 'Subscribing...' : 'Subscribe'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-slate-100 gap-8">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              © 2026 EventHub. Empowering careers through opportunities.
            </p>
            <div className="flex gap-8">
              <a href="#" className="text-slate-400 hover:text-indigo-600 transition-colors text-[10px] font-bold uppercase tracking-widest">Privacy Policy</a>
              <a href="#" className="text-slate-400 hover:text-indigo-600 transition-colors text-[10px] font-bold uppercase tracking-widest">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
