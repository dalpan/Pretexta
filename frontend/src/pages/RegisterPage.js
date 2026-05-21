import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Terminal, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function RegisterPage({ onRegister, onSwitchToLogin }) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    display_name: '',
    invite_code: '',
  });
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/auth/register', {
        username: formData.username,
        password: formData.password,
        email: formData.email || undefined,
        display_name: formData.display_name || undefined,
        invite_code: formData.invite_code || undefined,
      });
      login(response.data.token, response.data.user);
      toast.success(t('auth.register_success'));
      onRegister();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 grid-bg">
      <div className="glass-panel p-8 max-w-md w-full">
        <div className="mb-8 text-center space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <Terminal className="w-12 h-12 text-primary" />
            <h1 className="text-4xl font-bold glitch text-primary">Pretexta</h1>
          </div>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-widest">
            Create New Agent Profile
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="font-mono uppercase text-xs">{t('auth.username')} *</Label>
            <Input value={formData.username} onChange={update('username')} className="font-mono" placeholder="agent_name" required />
          </div>

          <div className="space-y-2">
            <Label className="font-mono uppercase text-xs">{t('auth.display_name')}</Label>
            <Input value={formData.display_name} onChange={update('display_name')} className="font-mono" placeholder="Your Name" />
          </div>

          <div className="space-y-2">
            <Label className="font-mono uppercase text-xs">{t('auth.email')}</Label>
            <Input type="email" value={formData.email} onChange={update('email')} className="font-mono" placeholder="agent@example.com" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="font-mono uppercase text-xs">{t('auth.password')} *</Label>
              <Input type="password" value={formData.password} onChange={update('password')} className="font-mono" required />
            </div>
            <div className="space-y-2">
              <Label className="font-mono uppercase text-xs">Confirm *</Label>
              <Input type="password" value={formData.confirmPassword} onChange={update('confirmPassword')} className="font-mono" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-mono uppercase text-xs">{t('auth.invite_code')}</Label>
            <Input value={formData.invite_code} onChange={update('invite_code')} className="font-mono" placeholder="XXXX-XXXX" />
          </div>

          <Button type="submit" className="w-full uppercase tracking-wider" disabled={loading}>
            <UserPlus className="w-4 h-4 mr-2" />
            {loading ? t('common.loading') : t('auth.register')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button onClick={onSwitchToLogin} className="text-xs text-muted-foreground hover:text-primary font-mono transition-colors">
            {t('auth.have_account')} {t('auth.login')}
          </button>
        </div>
      </div>
    </div>
  );
}
