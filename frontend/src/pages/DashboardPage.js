import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import {
  Activity, ListChecks, Zap, Shield, Target, Clock,
  ClipboardList, ChevronRight, AlertTriangle, CheckCircle2, Users, Tag
} from 'lucide-react';
import { getPersonas } from '../services/personas';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import SectionCard from '../components/SectionCard';

const CONTENT_ROUTES = {
  challenge: '/scenarios',
  campaign: '/campaigns',
  quiz: '/quizzes',
  ai_persona: '/ai-challenge',
};

export default function DashboardPage() {
  const { t } = useTranslation();

  const { data: simulationsRaw, loading: simsLoading }     = useApi('/simulations');
  const { data: challengesRaw, loading: challengesLoading } = useApi('/challenges/all');
  const { data: quizzesRaw }                                = useApi('/quizzes/all');
  const { data: assignmentsRaw, loading: assignLoading }   = useApi('/assignments/mine');
  const { data: groupsRaw }                                 = useApi('/assignments/my-groups');

  const simulations  = Array.isArray(simulationsRaw)  ? simulationsRaw  : [];
  const challenges   = Array.isArray(challengesRaw)   ? challengesRaw   : [];
  const quizzes      = Array.isArray(quizzesRaw)      ? quizzesRaw      : [];
  const assignments  = Array.isArray(assignmentsRaw)  ? assignmentsRaw  : [];
  const myGroups     = Array.isArray(groupsRaw)        ? groupsRaw        : [];

  const recentSims     = simulations.slice(0, 4);
  const activeAssigns  = assignments.filter(a => a.status === 'active');
  const overdueAssigns = activeAssigns.filter(a =>
    a.due_date && new Date(a.due_date) < new Date()
  );
  const personaCount   = getPersonas().length;

  const loading = simsLoading || challengesLoading;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <PageHeader
        icon={Shield}
        title={t('dashboard.welcome')}
        description={t('dashboard.ready')}
        badge={
          <span className="text-xs font-mono text-primary uppercase tracking-[0.2em]">
            {t('dashboard.system_online')}
          </span>
        }
      >
        <Link to="/ai-challenge">
          <Button size="lg" className="neon-border">
            <Zap className="w-5 h-5 mr-2" /> {t('dashboard.init_simulation')}
          </Button>
        </Link>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        <StatCard icon={Shield}    label={t('dashboard.stat_ai_scenarios')} value={personaCount}
          colorClass="border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.15)]"   textClass="text-blue-400" />
        <StatCard icon={Target}    label={t('dashboard.stat_scenarios')}    value={challenges.length}
          colorClass="border-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.15)]" textClass="text-purple-400" />
        <StatCard icon={ListChecks} label={t('dashboard.stat_quizzes')}     value={quizzes.length}
          colorClass="border-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.15)]"   textClass="text-pink-400" />
        <StatCard icon={Activity}  label={t('dashboard.stat_logs')}         value={simulations.length}
          colorClass="border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.15)]" textClass="text-emerald-400" />
      </div>

      {/* Training Group Membership */}
      {myGroups.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center p-3 border border-primary/15 bg-primary/3">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-primary/60 uppercase tracking-widest flex-shrink-0">
            <Users className="w-3.5 h-3.5" /> Kelompok Latihan Anda:
          </div>
          {myGroups.map(g => (
            <div key={g.id} className="flex items-center gap-1.5 px-2.5 py-1 border border-primary/25 bg-primary/8 text-[10px] font-mono">
              <Tag className="w-2.5 h-2.5 text-primary/60" />
              <span className="text-primary font-bold">{g.name}</span>
              <span className="text-muted-foreground">— {g.trainer_name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending Assignments — shown only if there are any */}
      {!assignLoading && activeAssigns.length > 0 && (
        <SectionCard
          title={`My Assignments (${activeAssigns.length} pending)`}
          icon={ClipboardList}
          actions={
            <Link to="/my-assignments">
              <Button variant="ghost" size="sm" className="text-[10px] uppercase tracking-widest">
                View All <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          }
        >
          <div className="space-y-2">
            {overdueAssigns.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-red-500/5 border border-red-500/20 text-[10px] font-mono text-red-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {overdueAssigns.length} assignment{overdueAssigns.length > 1 ? 's' : ''} overdue
              </div>
            )}
            {activeAssigns.slice(0, 3).map(a => {
              const isOverdue = a.due_date && new Date(a.due_date) < new Date();
              return (
                <div key={a.id} className={`flex items-center justify-between p-3 border transition-all ${
                  isOverdue ? 'border-red-500/20 bg-red-500/3' : 'border-white/5 hover:border-primary/20'
                }`}>
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-bold truncate">{a.title}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {a.content_type} · Lulus: {a.passing_score}%
                      {a.due_date && ` · Batas: ${new Date(a.due_date).toLocaleDateString('id-ID')}`}
                    </p>
                  </div>
                  {/* Point to /my-assignments which handles deep-linking per content type */}
                  <Link to="/my-assignments">
                    <Button size="sm" variant={isOverdue ? 'destructive' : 'default'}
                      className="text-[10px] uppercase tracking-widest flex-shrink-0 ml-3">
                      Mulai <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              );
            })}
            {activeAssigns.length > 3 && (
              <Link to="/my-assignments">
                <p className="text-[10px] font-mono text-center text-muted-foreground hover:text-primary transition-colors py-1 cursor-pointer">
                  +{activeAssigns.length - 3} more assignments
                </p>
              </Link>
            )}
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
        {/* Quick Actions */}
        <div className="space-y-4">
          <SectionCard title={t('dashboard.quick_actions')} icon={Zap}>
            <div className="grid gap-2.5">
              <Link to="/ai-challenge">
                <Button className="w-full justify-start h-12 font-semibold relative overflow-hidden group border-primary/40" variant="default">
                  <div className="absolute inset-0 bg-primary/15 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
                  <span className="relative z-10 flex items-center text-sm">
                    <Zap className="w-4 h-4 mr-3" /> {t('dashboard.start_ai_ops')}
                  </span>
                </Button>
              </Link>
              <Link to="/my-assignments">
                <Button className="w-full justify-start h-10" variant="outline">
                  <ClipboardList className="w-4 h-4 mr-3" />
                  My Assignments
                  {activeAssigns.length > 0 && (
                    <span className="ml-auto text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 font-mono">
                      {activeAssigns.length}
                    </span>
                  )}
                </Button>
              </Link>
              <Link to="/scenarios">
                <Button className="w-full justify-start h-10" variant="outline">
                  <Target className="w-4 h-4 mr-3" /> {t('dashboard.browse_scenarios')}
                </Button>
              </Link>
              <Link to="/quizzes">
                <Button className="w-full justify-start h-10" variant="outline">
                  <ListChecks className="w-4 h-4 mr-3" /> {t('dashboard.take_quiz')}
                </Button>
              </Link>
            </div>
          </SectionCard>
        </div>

        {/* Recent Operations */}
        <div className="lg:col-span-2">
          <SectionCard
            title={t('dashboard.recent_simulations')}
            icon={Activity}
            actions={
              <Link to="/simulations">
                <Button variant="ghost" size="sm" className="text-[10px] uppercase tracking-widest">
                  {t('dashboard.view_all_logs')}
                </Button>
              </Link>
            }
          >
            {loading ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-primary/5 animate-pulse" />)}
              </div>
            ) : recentSims.length === 0 ? (
              <EmptyState
                icon={Activity}
                title={t('dashboard.no_operations')}
                action={() => window.location.href = '/ai-challenge'}
                actionLabel={t('dashboard.init_first_op')}
              />
            ) : (
              <div className="space-y-2">
                {recentSims.map((sim, i) => {
                  const score = sim.score || 0;
                  const isGood = score >= 70;
                  const isAI = sim.simulation_type === 'ai_challenge' || sim.type === 'ai_challenge';
                  return (
                    <div
                      key={sim.id || i}
                      className="flex items-center justify-between p-3.5 glass-panel hover:bg-white/5 transition-all group border-l-2 border-l-transparent hover:border-l-primary"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className={`p-1.5 flex-shrink-0 ${
                          sim.completed_at
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-yellow-500/10 text-yellow-500'
                        }`}>
                          {isAI ? <Shield className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs uppercase tracking-wide font-mono truncate group-hover:text-primary transition-colors">
                            {sim.challenge_Title || sim.title || t('dashboard.untitled_operation')}
                          </p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(sim.completed_at || sim.created_at || sim.started_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right ml-4">
                        <span className="text-[10px] text-muted-foreground block mb-0.5">
                          {t('dashboard.success_rate')}
                        </span>
                        <span className={`font-mono font-bold text-lg leading-none ${
                          isGood ? 'text-emerald-400' : 'text-orange-400'
                        }`}>
                          {score}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
