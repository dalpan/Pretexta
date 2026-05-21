import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ShieldAlert, Users, User, ChevronRight, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, Minus, BarChart3,
  Download, Eye, Activity, Brain
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import RiskVector from '../components/RiskVector';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

function TraineeRow({ stat }) {
  const isAtRisk = stat.needs_attention;
  const avgScore = stat.avg_score;

  return (
    <div className={`flex items-center gap-4 p-3 border transition-all hover:bg-white/5 ${
      isAtRisk ? 'border-red-500/20 bg-red-500/5' : 'border-white/5'
    }`}>
      {/* Alert indicator */}
      <div className="flex-shrink-0">
        {isAtRisk
          ? <AlertTriangle className="w-4 h-4 text-red-400" />
          : <CheckCircle2 className="w-4 h-4 text-emerald-400/60" />
        }
      </div>

      {/* Identity */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono font-bold truncate">
          {stat.display_name || stat.username}
        </p>
        <p className="text-[10px] text-muted-foreground font-mono">
          @{stat.username} · LVL {stat.level} · {stat.simulations_completed} missions
        </p>
      </div>

      {/* Risk dimensions */}
      {stat.high_risk_dimensions?.length > 0 && (
        <div className="hidden md:flex gap-1 flex-shrink-0">
          {stat.high_risk_dimensions.slice(0, 3).map(dim => (
            <span key={dim} className="text-[9px] font-mono border border-red-400/30 text-red-400/80 px-1.5 py-0.5 uppercase">
              {dim.replace('_', ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Score */}
      <div className="text-right flex-shrink-0 ml-2">
        <p className="text-[10px] text-muted-foreground font-mono mb-0.5">Avg Score</p>
        {avgScore !== null ? (
          <p className={`text-lg font-bold font-mono ${
            avgScore >= 70 ? 'text-emerald-400' : avgScore >= 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>{avgScore}%</p>
        ) : (
          <p className="text-sm text-muted-foreground font-mono">—</p>
        )}
      </div>

      <Link to={`/trainer/user-history`} state={{ userId: stat.user_id }}>
        <Button variant="ghost" size="sm" className="text-[10px] uppercase tracking-widest h-7 flex-shrink-0">
          Detail <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

export default function InstructorReportsPage() {
  const { t } = useTranslation();
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'risk'

  const { data: groupsRaw } = useApi('/instructor/groups');
  const groups = groupsRaw ?? [];

  // Fetch cohort analytics when a group is selected
  // useApi re-fetches automatically when endpoint changes (selectedGroupId in URL)
  const { data: cohort, loading: cohortLoading, error: cohortError } = useApi(
    selectedGroupId ? `/instructor/cohort/${selectedGroupId}/analytics` : null,
    { manual: !selectedGroupId }
  );

  // Safe access — cohort is undefined until loaded
  const cohortStats = cohort?.stats ?? [];
  const needsAttentionCount = cohortStats.filter(s => s.needs_attention).length;
  const avgGroupScore = cohort?.summary?.group_avg_score ?? null;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <PageHeader
        icon={ShieldAlert}
        title={t('instructor.reports')}
        description="Cohort assessment and behavioral risk analysis"
      >
        <Select onValueChange={setSelectedGroupId} value={selectedGroupId}>
          <SelectTrigger className="font-mono text-xs w-48">
            <SelectValue placeholder="Select Group..." />
          </SelectTrigger>
          <SelectContent>
            {groups.map(g => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      {!selectedGroupId ? (
        <EmptyState
          icon={ShieldAlert}
          title="Select a training group"
          description="Choose a group from the dropdown above to view their assessment data."
        />
      ) : cohortLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 glass-panel animate-pulse" />)}
        </div>
      ) : !cohort ? (
        <EmptyState icon={Activity} title="No data available" description="This group has no completed simulations yet." />
      ) : (
        <>
          {/* Group Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard
              icon={Users}
              label={t('instructor.total_trainees')}
              value={cohort?.summary?.total_trainees ?? 0}
              colorClass="border-blue-500"
              textClass="text-blue-400"
            />
            <StatCard
              icon={Activity}
              label="With Data"
              value={cohort?.summary?.trainees_with_data ?? 0}
              colorClass="border-primary"
              textClass="text-primary"
            />
            <StatCard
              icon={BarChart3}
              label={t('instructor.avg_group_score')}
              value={avgGroupScore !== null && avgGroupScore !== undefined ? avgGroupScore : '—'}
              suffix={avgGroupScore !== null ? '%' : ''}
              animate={avgGroupScore !== null}
              colorClass={avgGroupScore >= 70 ? 'border-emerald-500' : 'border-yellow-500'}
              textClass={avgGroupScore >= 70 ? 'text-emerald-400' : 'text-yellow-400'}
            />
            <StatCard
              icon={AlertTriangle}
              label={t('instructor.needs_attention')}
              value={needsAttentionCount}
              colorClass="border-red-500"
              textClass="text-red-400"
            />
          </div>

          {/* View Mode Tabs */}
          <div className="flex gap-2 border-b border-primary/10 pb-3">
            {[['list', 'Trainee List'], ['risk', 'Risk Analysis']].map(([mode, label]) => (
              <Button
                key={mode}
                variant={viewMode === mode ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode(mode)}
                className="text-[10px] uppercase tracking-widest"
              >
                {label}
              </Button>
            ))}
          </div>

          {viewMode === 'list' && (
            <SectionCard title={`${cohort.group?.name || 'Group'} — Trainee Assessment`} icon={Users}>
              {cohortStats.length === 0 ? (
                <EmptyState icon={User} title="No trainees with data" description="Assign exercises and wait for completions." />
              ) : (
                <div className="space-y-2">
                  {/* Needs Attention First */}
                  {needsAttentionCount > 0 && (
                    <div className="text-[10px] font-mono text-red-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3" /> {needsAttentionCount} trainee(s) need additional training
                    </div>
                  )}
                  {cohortStats.map(stat => (
                    <TraineeRow key={stat.user_id} stat={stat} />
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {viewMode === 'risk' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {cohort.stats
                .filter(s => s.risk_vector)
                .map(stat => (
                  <SectionCard
                    key={stat.user_id}
                    title={stat.display_name || stat.username}
                    icon={stat.needs_attention ? AlertTriangle : CheckCircle2}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <p className="text-[10px] text-muted-foreground font-mono">
                        @{stat.username} · {stat.simulations_completed} missions · avg {stat.avg_score || '—'}%
                      </p>
                      {stat.needs_attention && (
                        <span className="text-[9px] font-mono text-red-400 border border-red-400/30 px-1.5 py-0.5 uppercase">needs training</span>
                      )}
                    </div>
                    <RiskVector
                      vector={stat.risk_vector}
                      compact
                    />
                    {stat.high_risk_dimensions?.length > 0 && (
                      <p className="text-[10px] text-red-400 font-mono mt-3 pt-2 border-t border-white/5">
                        High risk: {stat.high_risk_dimensions.join(', ')}
                      </p>
                    )}
                  </SectionCard>
                ))}
              {cohortStats.filter(s => s.risk_vector).length === 0 && (
                <EmptyState
                  icon={Brain}
                  title="No risk profiles yet"
                  description="Risk profiles are built from completed simulation data."
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
