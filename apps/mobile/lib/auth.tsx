import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadSession, onSessionChange } from './api';
import type { Session } from './types';

type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; session: Session };

const AuthContext = createContext<AuthState>({ status: 'loading' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const apply = (s: Session | null) => setState(s ? { status: 'signedIn', session: s } : { status: 'signedOut' });
    const off = onSessionChange(apply);
    loadSession().then(apply, () => apply(null));
    return off;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function useUser() {
  const auth = useAuth();
  return auth.status === 'signedIn' ? auth.session.user : null;
}
