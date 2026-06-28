import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

// Detecta, já no carregamento, se o usuário chegou por um link de convite ou de
// redefinição de senha (o Supabase coloca type=invite|recovery no hash da URL).
// Lido aqui antes de o supabase-js consumir/limpar o hash.
function detectAuthFlowFromUrl() {
  try {
    const h = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '';
    const type = new URLSearchParams(h).get('type');
    return type === 'invite' || type === 'recovery';
  } catch { return false; }
}
const INITIAL_PASSWORD_SETUP = detectAuthFlowFromUrl();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // Mantido por compatibilidade com App.jsx (Base44 carregava settings públicos)
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  // Quando true, o app mostra a tela de definir senha (convite/recuperação).
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(INITIAL_PASSWORD_SETUP);

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    try {
      const u = await base44.auth.me();
      setUser(u);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    }
    setIsLoadingAuth(false);
  };

  useEffect(() => {
    checkUserAuth();
    // Reavalia ao logar/deslogar (ex.: refresh de token). O evento
    // PASSWORD_RECOVERY indica link de redefinição/convite => pedir nova senha.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setNeedsPasswordSetup(true);
      checkUserAuth();
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const logout = () => base44.auth.logout();
  const navigateToLogin = () => { window.location.href = '/login'; };
  // Chamado após o usuário definir a senha pelo link de convite/recuperação.
  const completePasswordSetup = () => {
    setNeedsPasswordSetup(false);
    try { window.history.replaceState({}, document.title, window.location.pathname); } catch { /* ignore */ }
    checkUserAuth();
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      needsPasswordSetup,
      completePasswordSetup,
      logout,
      navigateToLogin,
      checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
