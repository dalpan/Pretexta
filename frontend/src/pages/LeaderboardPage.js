import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Medal, Flame, Star, Users } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { useApi } from '../hooks/useApi';

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('rankings');
  const [scope, setScope] = useState('global');

  // useApi rebuilds execute when endpoint changes (scope in URL), so no manual useEffect needed
  const { data: leaderboardRaw, loading: lbLoading } = useApi(`/leaderboard?scope=${scope}`);
  const { data: myRank } = useApi('/leaderboard/me');
  const { data: badgesRaw } = useApi('/leaderboard/badges');

  const leaderboard = leaderboardRaw ?? [];
  const badges = badgesRaw ?? [];

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="text-xs font-mono text-muted-foreground w-5 text-center">#{rank}</span>;
  };

  const xpProgress = myRank?.xp_progress || {};

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <PageHeader
        icon={Trophy}
        title={t('leaderboard.title')}
        description={t('leaderboard.page_description')}
      >
        <div className="flex gap-2">
          <Button
            variant={scope === 'global' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScope('global')}
            className="font-mono text-xs uppercase tracking-widest"
          >
            {t('leaderboard.rank')}
          </Button>
          <Button
            variant={scope === 'organization' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScope('organization')}
            className="font-mono text-xs uppercase tracking-widest"
          >
            <Users className="w-3 h-3 mr-1" /> Team
          </Button>
        </div>
      </PageHeader>

      {/* My Rank Card */}
      {myRank && (
        <Card className="glass-panel border border-primary/25 p-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{t('leaderboard.your_rank')}</p>
              <p className="text-3xl font-bold font-mono text-primary">#{myRank.rank}</p>
              <p className="text-[10px] text-muted-foreground">/ {myRank.total_users}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{t('leaderboard.level')}</p>
              <p className="text-3xl font-bold font-mono text-yellow-400">{xpProgress.level || 1}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{t('leaderboard.xp')}</p>
              <p className="text-3xl font-bold font-mono text-blue-400">{xpProgress.current_xp || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{t('leaderboard.streak')}</p>
              <p className="text-3xl font-bold font-mono text-orange-400 flex items-center justify-center gap-1">
                <Flame className="w-5 h-5" /> {myRank.streak_days}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{t('leaderboard.simulations')}</p>
              <p className="text-3xl font-bold font-mono">{myRank.simulations_completed}</p>
            </div>
          </div>
          {/* XP Progress Bar */}
          <div className="pt-3 border-t border-white/5">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1.5">
              <span>Level {xpProgress.level}</span>
              <span>{xpProgress.progress || 0}%</span>
              <span>Level {(xpProgress.level || 1) + 1}</span>
            </div>
            <div className="h-1.5 bg-black/50 border border-primary/10 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-1000"
                style={{ width: `${xpProgress.progress || 0}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Tab Switch */}
      <div className="flex gap-2 border-b border-primary/10 pb-4">
        {['rankings', 'badges'].map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab)}
            className="font-mono text-xs uppercase tracking-widest"
          >
            {t(`leaderboard.${tab}`, tab.charAt(0).toUpperCase() + tab.slice(1))}
          </Button>
        ))}
      </div>

      {/* Rankings Tab */}
      {activeTab === 'rankings' && (
        <div className="space-y-2">
          {lbLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 glass-panel animate-pulse" />
            ))
          ) : leaderboard.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title={t('leaderboard.no_data')}
              description={t('leaderboard.no_data')}
            />
          ) : (
            leaderboard.map((entry) => (
              <div
                key={entry.user_id}
                className={`flex items-center justify-between p-4 glass-panel transition-all ${
                  entry.is_current_user ? 'border border-primary/40 bg-primary/5' : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-6">
                    {getRankIcon(entry.rank)}
                  </div>
                  <div>
                    <p className={`font-mono font-bold text-sm ${entry.is_current_user ? 'text-primary' : ''}`}>
                      {entry.display_name || entry.username}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {t('leaderboard.level')} {entry.level} · {entry.badges_count} {t('leaderboard.badges')} · {entry.streak_days}d streak
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-lg">
                    {entry.xp} <span className="text-xs text-muted-foreground">{t('leaderboard.xp')}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">{entry.simulations_completed} {t('leaderboard.simulations')}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Badges Tab */}
      {activeTab === 'badges' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge) => (
            <Card
              key={badge.id}
              className={`glass-panel p-4 transition-all ${
                badge.earned ? 'border-primary/40 bg-primary/5' : 'opacity-50 grayscale'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-none border flex-shrink-0 ${
                  badge.earned ? 'border-primary bg-primary/10 text-primary' : 'border-muted bg-muted/10 text-muted-foreground'
                }`}>
                  <Star className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-mono font-bold text-xs truncate">{badge.name}</h3>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{badge.description}</p>
                  <p className="text-[10px] text-primary/60 mt-1.5 font-mono">+{badge.xp_reward} {t('leaderboard.xp')}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
