import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Terminal, Lock, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function LoginPage({ onSwitchToRegister }) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { username, password });
      login(response.data.token, response.data.user);
    } catch {
      toast.error(t('auth.invalid_credentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 grid-bg">
      <div className="glass-panel p-8 max-w-md w-full border border-primary/20">

        {/* Header */}
        <div className="mb-8 text-center space-y-3">
          <div className="flex items-center justify-center space-x-3">
            <Terminal className="w-10 h-10 text-primary animate-pulse-slow" />
            <h1 className="text-4xl font-bold glitch text-primary" data-text="PRETEXTA">
              PRETEXTA
            </h1>
          </div>
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
            {t('app.tagline')}
          </p>
          {/* Ethics notice — no credentials shown */}
          <div className="flex items-center gap-2 justify-center pt-1">
            <Shield className="w-3 h-3 text-primary/40" />
            <p className="text-[10px] text-muted-foreground/50 font-mono">
              Authorized personnel only
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="font-mono uppercase text-xs tracking-widest">
              {t('auth.username')}
            </Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="font-mono"
              autoComplete="username"
              required
              data-testid="username-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="font-mono uppercase text-xs tracking-widest">
              {t('auth.password')}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
              autoComplete="current-password"
              required
              data-testid="password-input"
            />
          </div>

          <Button
            type="submit"
            className="w-full uppercase tracking-wider mt-2"
            disabled={loading}
            data-testid="login-submit-btn"
          >
            <Lock className="w-4 h-4 mr-2" />
            {loading ? t('auth.authenticating') : t('auth.login')}
          </Button>
        </form>

        {onSwitchToRegister && (
          <div className="mt-5 text-center">
            <button
              onClick={onSwitchToRegister}
              className="text-xs text-muted-foreground hover:text-primary font-mono transition-colors"
            >
              {t('auth.no_account')} {t('auth.register')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
