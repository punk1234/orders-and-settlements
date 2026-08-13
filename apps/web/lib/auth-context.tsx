'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { api } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Screens that never read `user`/`loading` and don't gate on an existing
// session — a visitor who lands here has, by definition, not tried to log
// in yet, so there is nothing for a session check to accomplish. Calling
// `/auth/me` anyway just produces a guaranteed, noisy 401 on every load or
// refresh of these pages.
const SKIP_SESSION_CHECK_ROUTES = new Set(['/login', '/signup']);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    if (SKIP_SESSION_CHECK_ROUTES.has(pathname)) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: User }>('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    // Intentionally checking the session once per app load (using whichever
    // route we first landed on), not on every client-side route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ user: User }>('/auth/login', { email, password });
    setUser(res.user);
  }

  async function signup(email: string, password: string) {
    const res = await api.post<{ user: User }>('/auth/signup', { email, password });
    setUser(res.user);
  }

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
