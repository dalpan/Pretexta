import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  User, Shield, Award, Key, Flame, TrendingUp, Lock, Building2,
  CheckCircle2, Star, Calendar, AlertTriangle, ChevronRight
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import { useApi, useMutation } from '../hooks/useApi';
import api from '../services/api';

// Level thresholds mirror backend gamification.py LEVEL_THRESHOLDS
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500, 10000];

function getXpProgress(xp, level) {
  const current = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const progress = next > current ? Math.round(((xp - current) / (next - current)) * 100) : 100;
  return { current, next, progress: Math.min(100, Math.max(0, progress)) };
}

const BADGE_ICONS = {
  first_blood: Shield,
  phishing_detector: Shield,
  social_proof_immune: Star,
  streak_3: Flame,
  streak_7: Flame,
  streak_30: Flame,
  quiz_master: CheckCircle2,
  cialdini_scholar: Award,
  campaign_hero: Star,
  team_player: Building2,
  scenario_creator: Star,
};

function BadgeCard({ badge, earned }) {
  const Icon = BADGE_ICONS[badge.id] || Award;
  return (
    <div className={`p-3 border transition-all duration-200 ${
      earned
        ? 'border-primary/40 bg-primary/5 text-foreground'
        : 'border-white/5 bg-black/20 opacity-40 grayscale'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 flex-shrink-0 ${earned ? 'bg-primary/10 text-primary' : 'bg-muted/10 text-muted-foreground'}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="font-mono font-bold text-xs truncate">{badge.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{badge.description}</p>
          <p className="text-[10px] text-primary/60 mt-1 font-mono">+{badge.xp_reward} XP</p>
        </div>
        {earned && <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />}
      </div>
    </div>
  );
}

function PasswordChangeForm({ t }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const { mutate, loading } = useMutation('post', '/auth/change-password');

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    try {
      await mutate({ current_password: form.current, new_password: form.next });
      toast.success(t('auth.password_changed'));
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.detail || t('errors.generic'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className="font-mono uppercase text-xs">{t('auth.current_password')}</Label>
        <Input type="password" value={form.current} onChange={update('current')} className="font-mono" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="font-mono uppercase text-xs">{t('auth.new_password')}</Label>
          <Input type="password" value={form.next} onChange={update('next')} className="font-mono" required />
        </div>
        <div className="space-y-1">
          <Label className="font-mono uppercase text-xs">Confirm</Label>
          <Input type="password" value={form.confirm} onChange={update('confirm')} className="font-mono" required />
        </div>
      </div>
      <Button type="submit" disabled={loading} variant="outline" className="text-xs uppercase tracking-widest">
        <Lock className="w-3 h-3 mr-2" />
        {loading ? t('common.loading') : t('auth.change_password')}
      </Button>
    </form>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const [editMode, setEditMode] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  // Use 'profileUser' to avoid shadowing AuthContext user
  const { data: profileUser, loading, refetch } = useApi('/auth/me');
  const { data: badgesRaw } = useApi('/leaderboard/badges');
  const { data: myRank } = useApi('/leaderboard/me');

  // Null-safe aliasing
  const user = profileUser ?? null;
  const badges = badgesRaw ?? [];

  const { mutate: saveProfile, loading: saving } = useMutation('put', '/auth/profile');

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await saveProfile({ display_name: displayName || undefined, email: email || undefined });
      toast.success(t('common.success'));
      await refetch();
      setEditMode(false);
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  const startEdit = () => {
    setDisplayName(user?.display_name || '');
    setEmail(user?.email || '');
    setEditMode(true);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-primary font-mono animate-pulse">LOADING_PROFILE...</div>
      </div>
    );
  }

  if (!user) return null;

  const xpInfo = getXpProgress(user.xp || 0, user.level || 1);
  const earnedBadgeIds = new Set(user.badges || []);
  const joinedDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : '—';

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700">
      <PageHeader
        icon={User}
        title={t('profile.title')}
        description={`${user.role?.toUpperCase()} · ${t('profile.member_since')} ${joinedDate}`}
      >
        {!editMode ? (
          <Button size="sm" variant="outline" onClick={startEdit} className="text-xs uppercase tracking-widest">
            {t('common.edit')}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditMode(false)} className="text-xs uppercase tracking-widest">
            {t('common.cancel')}
          </Button>
        )}
      </PageHeader>

      {/* Agent Card */}
      <div className="glass-panel p-6 border border-primary/20">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 bg-primary/10 border-2 border-primary/40 flex items-center justify-center flex-shrink-0">
            <User className="w-10 h-10 text-primary/60" />
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0 space-y-1">
            {editMode ? (
              <form onSubmit={handleSave} className="space-y-3 max-w-sm">
                <div className="space-y-1">
                  <Label className="font-mono uppercase text-xs">{t('profile.display_name')}</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="font-mono h-8 text-sm" placeholder={user.username} />
                </div>
                <div className="space-y-1">
                  <Label className="font-mono uppercase text-xs">{t('profile.email')}</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="font-mono h-8 text-sm" placeholder="agent@example.com" />
                </div>
                <Button type="submit" disabled={saving} size="sm" className="text-xs uppercase tracking-widest">
                  {saving ? t('common.loading') : t('profile.save_changes')}
                </Button>
              </form>
            ) : (
              <>
                <h2 className="text-2xl font-bold font-mono text-foreground">
                  {user.display_name || user.username}
                </h2>
                <p className="text-sm font-mono text-muted-foreground">@{user.username}</p>
                {user.email && (
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                )}
              </>
            )}
          </div>

          {/* Level Badge */}
          <div className="text-center flex-shrink-0">
            <div className="w-16 h-16 border-2 border-primary bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold font-mono text-primary">{user.level || 1}</span>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 font-mono">
              {t('profile.level')}
            </p>
          </div>
        </div>

        {/* XP Progress */}
        <div className="mt-6 pt-4 border-t border-white/5">
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1.5">
            <span>{t('profile.xp')}: {user.xp || 0}</span>
            <span>{xpInfo.progress}% to Level {(user.level || 1) + 1}</span>
            <span>Next: {xpInfo.next} XP</span>
          </div>
          <div className="h-1.5 bg-black/50 border border-primary/10 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-1000"
              style={{ width: `${xpInfo.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          icon={TrendingUp}
          label={t('profile.xp')}
          value={user.xp || 0}
          colorClass="border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.15)]"
          textClass="text-blue-400"
        />
        <StatCard
          icon={Flame}
          label={t('profile.streak')}
          value={user.streak_days || 0}
          suffix={` ${t('common.days')}`}
          colorClass="border-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.15)]"
          textClass="text-orange-400"
        />
        <StatCard
          icon={Award}
          label={t('profile.badges')}
          value={earnedBadgeIds.size}
          colorClass="border-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.15)]"
          textClass="text-yellow-400"
        />
        <StatCard
          icon={Shield}
          label={t('leaderboard.rank')}
          value={myRank?.rank ? `#${myRank.rank}` : '—'}
          animate={false}
          colorClass="border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.15)]"
          textClass="text-purple-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Badges */}
        <SectionCard title={t('profile.badges')} icon={Award}>
          {badges && badges.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto pr-1">
              {badges.map((badge) => (
                <BadgeCard key={badge.id} badge={badge} earned={earnedBadgeIds.has(badge.id)} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground font-mono text-center py-6">
              {t('common.loading')}
            </p>
          )}
        </SectionCard>

        {/* Security Settings */}
        <div className="space-y-4">
          <SectionCard title={t('profile.security')} icon={Lock}>
            <PasswordChangeForm t={t} />
          </SectionCard>

          {/* Organization */}
          <SectionCard title={t('profile.organization')} icon={Building2}>
            {user.organization_id ? (
              <div className="flex items-center justify-between text-sm font-mono">
                <span className="text-muted-foreground text-xs">{t('organizations.your_org')}</span>
                <ChevronRight className="w-4 h-4 text-primary/50" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground font-mono">{t('profile.no_org')}</p>
            )}
          </SectionCard>

          {/* Account Info */}
          <SectionCard title="Account" icon={User}>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground uppercase tracking-wider">ID</span>
                <span className="text-foreground/60 truncate max-w-[60%]">{user.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground uppercase tracking-wider">{t('profile.member_since')}</span>
                <span className="text-foreground/80">{joinedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground uppercase tracking-wider">Role</span>
                <span className="text-primary uppercase">{user.role || 'trainee'}</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
