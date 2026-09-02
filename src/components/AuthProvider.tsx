import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  campus?: string;
  profileImage?: string;
  authProvider?: string;
}

interface AuthContextType {
  user: User | null;
  role: string | null;
  loading: boolean;
  isSupabaseConfigured: boolean;
  login: (email: string, password: string, campus?: string) => Promise<void>;
  loginWithGoogle: (campus?: string) => Promise<void>;
  logout: (isAutoLogout?: boolean | React.SyntheticEvent) => void;
}

const TEN_MINUTES_MS = 10 * 60 * 1000; // 10 minutes inactivity limit

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  role: null, 
  loading: true,
  isSupabaseConfigured,
  login: async () => {},
  loginWithGoogle: async () => {},
  logout: () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActiveRef = useRef<number>(Date.now());

  const logout = (isAutoLogout?: boolean | React.SyntheticEvent) => {
    const isAuto = typeof isAutoLogout === 'boolean' ? isAutoLogout : false;
    setUser(null);
    try {
      localStorage.removeItem('payroll_user');
      localStorage.removeItem('payroll_last_active');
      sessionStorage.removeItem('payroll_session_active');
      sessionStorage.removeItem('payroll_pending_campus');
      if (supabase) {
        supabase.auth.signOut().catch(() => {});
      }
    } catch (e) {
      console.error("Failed to clear session storage on logout", e);
    }
    if (isAuto) {
      toast.warning("You have been automatically logged out due to 10 minutes of inactivity.");
    }
  };

  useEffect(() => {
    const syncUser = () => {
      const savedUser = localStorage.getItem('payroll_user');
      const isSessionActive = sessionStorage.getItem('payroll_session_active');
      const lastActiveStr = localStorage.getItem('payroll_last_active');
      const now = Date.now();

      if (savedUser && isSessionActive === 'true') {
        const lastActiveTime = lastActiveStr ? Number(lastActiveStr) : now;
        if (now - lastActiveTime >= TEN_MINUTES_MS) {
          logout(true);
        } else {
          try {
            setUser(JSON.parse(savedUser));
            lastActiveRef.current = now;
            localStorage.setItem('payroll_last_active', String(now));
          } catch (e) {
            console.error("Failed to parse payroll_user from localStorage", e);
            logout(false);
          }
        }
      } else {
        // First visit / initial open without active session
        logout(false);
      }
    };
    
    syncUser();
    setLoading(false);

    window.addEventListener('storage', syncUser);
    window.addEventListener('user-updated', syncUser);
    
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('user-updated', syncUser);
    };
  }, []);

  // Supabase Auth State Change Listener for Google OAuth callbacks
  useEffect(() => {
    if (!supabase) return;

    const handleSupabaseSession = async (session: any) => {
      if (!session?.user?.email) return;

      const pendingCampus = sessionStorage.getItem('payroll_pending_campus') || undefined;
      const userMeta = session.user.user_metadata || {};
      const email = session.user.email;
      const displayName = userMeta.full_name || userMeta.name || userMeta.custom_claims?.name || email.split('@')[0];
      const profileImage = userMeta.avatar_url || userMeta.picture || '';

      try {
        const userData = await api.auth.googleLogin({
          email,
          displayName,
          profileImage,
          campus: pendingCampus,
          supabaseToken: session.access_token,
          supabaseUser: session.user,
        });

        sessionStorage.removeItem('payroll_pending_campus');
        const now = Date.now();
        lastActiveRef.current = now;
        setUser(userData);
        
        try {
          sessionStorage.setItem('payroll_session_active', 'true');
          localStorage.setItem('payroll_last_active', String(now));
          localStorage.setItem('payroll_user', JSON.stringify(userData));
        } catch (storageErr) {
          console.warn("Storage quota warning, storing minimal user object", storageErr);
          const fallbackUser = { ...userData, profileImage: '' };
          localStorage.setItem('payroll_user', JSON.stringify(fallbackUser));
        }

        toast.success(`Welcome ${userData.displayName || userData.email}! Signed in with Google.`);
      } catch (err: any) {
        console.error("Google OAuth login verification error:", err);
        sessionStorage.removeItem('payroll_pending_campus');
        sessionStorage.removeItem('payroll_session_active');
        localStorage.removeItem('payroll_user');
        localStorage.removeItem('payroll_last_active');
        
        if (supabase) {
          try {
            await supabase.auth.signOut();
          } catch (signOutErr) {
            console.warn("Supabase sign out error:", signOutErr);
          }
        }
        
        logout(false);
        const errorMsg = err.message || "Failed to authenticate Google user with payroll system";
        sessionStorage.setItem('payroll_login_error', errorMsg);
        window.dispatchEvent(new CustomEvent('payroll-login-error', { 
          detail: { 
            message: errorMsg, 
            code: err.code, 
            assignedCampus: err.assignedCampus 
          } 
        }));
        toast.error(errorMsg, { duration: 6000 });
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        const currentSaved = localStorage.getItem('payroll_user');
        if (!currentSaved) {
          await handleSupabaseSession(session);
        }
      }
    });

    // Check if initial session is present (e.g. on return redirect from Google)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !localStorage.getItem('payroll_user')) {
        handleSupabaseSession(session);
      }
    }).catch(err => {
      console.warn("Error checking Supabase session:", err);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Activity tracker & 10-minute auto-logout timer
  useEffect(() => {
    if (!user) return;

    let lastWriteTime = 0;

    const recordUserActivity = () => {
      const now = Date.now();
      lastActiveRef.current = now;
      if (now - lastWriteTime > 3000) { // Throttled localStorage write every 3 seconds
        lastWriteTime = now;
        try {
          localStorage.setItem('payroll_last_active', String(now));
        } catch (e) {}
      }
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'focus'];
    activityEvents.forEach(evt => window.addEventListener(evt, recordUserActivity));

    // Check inactivity every 3 seconds
    const interval = setInterval(() => {
      const now = Date.now();
      const lastActiveStored = Number(localStorage.getItem('payroll_last_active') || lastActiveRef.current);
      const effectiveLastActive = Math.max(lastActiveRef.current, lastActiveStored);

      if (now - effectiveLastActive >= TEN_MINUTES_MS) {
        logout(true);
      }
    }, 3000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const lastActiveStored = Number(localStorage.getItem('payroll_last_active') || lastActiveRef.current);
        if (now - lastActiveStored >= TEN_MINUTES_MS) {
          logout(true);
        } else {
          lastActiveRef.current = now;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activityEvents.forEach(evt => window.removeEventListener(evt, recordUserActivity));
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: any = null;

    const connectSSE = () => {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('/api/realtime');

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.event) {
            const customEvent = new CustomEvent(`realtime-${payload.event}`, { detail: payload.data });
            window.dispatchEvent(customEvent);

            const anyEvent = new CustomEvent('realtime-update', { detail: payload });
            window.dispatchEvent(anyEvent);
          }
        } catch (e) {
          // heartbeat or ignore
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      clearTimeout(reconnectTimer);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const login = async (email: string, password: string, campus?: string) => {
    const userData = await api.auth.login(email, password, campus);
    const now = Date.now();
    lastActiveRef.current = now;
    setUser(userData);
    
    try {
      sessionStorage.setItem('payroll_session_active', 'true');
      localStorage.setItem('payroll_last_active', String(now));
      localStorage.setItem('payroll_user', JSON.stringify(userData));
    } catch (e) {
      console.warn("Failed to store user in localStorage, likely quota exceeded. Retrying without profile image...", e);
      if (userData) {
        try {
          const fallbackUser = { ...userData, profileImage: '' };
          localStorage.setItem('payroll_user', JSON.stringify(fallbackUser));
        } catch (innerError) {
          console.error("Failed to store fallback user data in localStorage", innerError);
        }
      }
    }
  };

  const loginWithGoogle = async (campus?: string) => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Google OAuth.");
    }

    if (campus) {
      sessionStorage.setItem('payroll_pending_campus', campus);
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      }
    });

    if (error) {
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, role: user?.role || null, loading, isSupabaseConfigured, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
