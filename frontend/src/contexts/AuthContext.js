import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('soceng_token'));
  const [isLoading, setIsLoading] = useState(true);

  // On mount, validate the stored token by fetching the current user
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        // Token invalid or expired — clear it
        localStorage.removeItem('soceng_token');
        localStorage.removeItem('soceng_user');
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  const login = useCallback((newToken, userData) => {
    localStorage.setItem('soceng_token', newToken);
    localStorage.setItem('soceng_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('soceng_token');
    localStorage.removeItem('soceng_user');
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem('soceng_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isAuthenticated: !!token, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
