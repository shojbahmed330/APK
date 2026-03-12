
import { useState, useEffect } from 'react';
import { User as UserType, AppMode } from '../types';
import { DatabaseService } from '../services/dbService';
import { Session, AuthChangeEvent } from '@supabase/supabase-js';

const ADMIN_EMAILS = ['rajshahi.jibon@gmail.com', 'rajshahi.shojib@gmail.com', 'rajshahi.sumi@gmail.com'];

export const useAppAuth = (navigateTo: (path: string, mode?: AppMode) => void) => {
  const [user, setUser] = useState<UserType | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showScan, setShowScan] = useState(true);
  const db = DatabaseService.getInstance();

  useEffect(() => {
    let mounted = true;
    
    // Detect errors in URL (e.g., identity_already_exists)
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error_description') || params.get('error');
    const errorCode = params.get('error_code');

    if (error || errorCode) {
      let msg = "গিটহাব লিঙ্ক করতে সমস্যা হয়েছে।";
      if (errorCode === 'identity_already_exists' || error.includes('already_linked')) {
        msg = "এই গিটহাব অ্যাকাউন্টটি ইতিমধ্যে আমাদের সিস্টেমের অন্য একটি প্রোফাইলে যুক্ত আছে। দয়া করে অন্য একটি গিটহাব অ্যাকাউন্ট ব্যবহার করুন অথবা ম্যানুয়াল টোকেন বসান।";
      } else {
        msg = `ত্রুটি: ${error}`;
      }
      alert(msg);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const handleSession = async (session: Session | null) => {
      if (!mounted) return;
      
      if (!session?.user) {
        setAuthLoading(false);
        return;
      }

      try {
        const userData = await db.getUser(session.user.email || '', session.user.id);
        
        if (mounted && userData) { 
          setUser(userData); 
          setShowScan(false);
          
          // Sync GitHub Token if available
          const providerToken = session.provider_token;
          if (providerToken && session.user.app_metadata?.provider === 'github') {
            await db.updateGithubTokenOnly(session.user.id, providerToken);
          }

          if (window.location.pathname === '/' || window.location.pathname === '/login') {
             navigateTo('/dashboard', AppMode.PREVIEW);
          }
        }
      } catch (e) { 
        console.error("Auth process error:", e); 
      } finally { 
        if (mounted) setAuthLoading(false); 
      }
    };

    // Safety timeout to prevent infinite loading
    const safetyTimer = setTimeout(() => {
      if (mounted) setAuthLoading(false);
    }, 5000);

    db.supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    const { data: { subscription } } = db.supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_IN') {
        handleSession(session);
      } else if (event === 'SIGNED_OUT') {
        if (mounted) {
          setUser(null);
          setAuthLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array to run only once

  const handleLogout = async () => { 
    try { await db.signOut(); } catch (e) {}
    setUser(null); 
    setShowScan(true); 
    navigateTo('/login', AppMode.PREVIEW); 
  };

  return { user, setUser, authLoading, setAuthLoading, showScan, setShowScan, handleLogout };
};
