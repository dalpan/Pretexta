import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Radio, Users, ClipboardList, ShieldAlert, AlertTriangle,
  CheckCircle2, Activity, Plus, ChevronRight, Zap, BarChart3,
  Target, UserCog, ArrowRight
} from 'lucide-react';
import { Button } from '../components/ui/button';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import SectionCard from '../components/SectionCard';
import EmptyState from '../components/EmptyState';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';

const ROLE_CONFIG = {
  admin:   { color: 'text-red-400 border-red-400/30', label: 'ADMIN ACCESS' },
  trainer: { color: 'text-yellow-400 border-yellow-400/30', label: 'TRAINER ACCESS' },
};

export default function InstructorDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: groupsRaw,      loading: groupsLoading }      = useApi('/instructor/groups');
  const { data: assignmentsRaw, loading: assignmentsLoading } = useApi('/instructor/assignments');
  const { data: usersRaw }                                     = useApi('/instructor/users/all?role=user');

  const groups      = groupsRaw      ?? [];
  const assignments = assignmentsRaw ?? [];
  const userCount   = (usersRaw      ?? []).length;

  const totalTrainees       = groups.reduce((sum, g) => sum + (g.trainee_ids?.length || 0), 0);
  const activeAssignments   = assignments.filter(a => a.status === 'active').length;
  const completedAssignments = assignments.filter(a => a.status === 'completed').length;
  const recentAssignments   = assignments.slice(0, 5);

  const role = user?.role || 'trainer';
  const roleCfg = ROLE_CONFIG[role] || ROLE_CONFIG.trainer;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <PageHeader
        icon={Radio}
        title="Command Center"
        description={`${user?.display_name || user?.username} — ${role === 'admin' ? 'System Administrator' : 'Training Instructor'}`}
        badge={
          <span className={`text-[10px] font-mono uppercase tracking-[0.25em] border px-2 py-0.5 ${roleCfg.color}`}>
            {roleCfg.label}
          </span>
        }
      >
        <Link to="/trainer/assignments">
          <Button size="sm" className="text-xs uppercase tracking-widest">
            <Plus className="w-3.5 h-3.5 mr-2" /> New Assignment
          </Button>
        </Link>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={Users}        label="Total Users"        value={userCount}
          colorClass="border-blue-500"    textClass="text-blue-400" />
        <StatCard icon={Users}        label="In Training Groups" value={totalTrainees}
          colorClass="border-purple-500"  textClass="text-purple-400" />
        <StatCard icon={ClipboardList} label="Active Assignments" value={activeAssignments}
          colorClass="border-yellow-500"  textClass="text-yellow-400" />
        <StatCard icon={CheckCircle2} label="Completed"          value={completedAssignments}
          colorClass="border-emerald-500" textClass="text-emerald-400" />
      </div>

      {/* Workflow guide — shown when empty */}
      {groups.length === 0 && !groupsLoading && (
        <div className="p-5 border border-primary/20 bg-primary/3 space-y-4">
          <h3 className="text-sm font-mono font-bold text-primary uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-4 h-4" /> Getting Started — Training Workflow
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { n: '1', label: 'Create Group', desc: 'Organize trainees into training groups', path: '/trainer/groups', icon: Users },
              { n: '2', label: 'Add Users', desc: 'Add registered users to your training group', path: '/trainer/groups', icon: UserCog },
              { n: '3', label: 'Assign Exercises', desc: 'Assign scenarios, quizzes, or AI personas', path: '/trainer/assignments', icon: ClipboardList },
              { n: '4', label: 'View Reports', desc: 'Monitor progress and risk profiles', path: '/trainer/reports', icon: ShieldAlert },
            ].map(({ n, label, desc, path, icon: Icon }) => (
              <Link key={n} to={path}>
                <div className="p-3 border border-white/10 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 w-6 h-6 flex items-center justify-center">
                      {n}
                    </span>
                    <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-xs font-mono font-bold group-hover:text-primary transition-colors">{label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="space-y-4">
          <SectionCard title="Quick Actions" icon={Zap}>
            <div className="space-y-2">
              <Link to="/trainer/groups">
                <Button variant="outline" className="w-full justify-start h-10 text-xs uppercase tracking-widest">
                  <Users className="w-3.5 h-3.5 mr-3" /> {t('instructor.groups')}
                  <ChevronRight className="w-3 h-3 ml-auto" />
                </Button>
              </Link>
              <Link to="/trainer/assignments">
                <Button variant="default" className="w-full justify-start h-10 text-xs uppercase tracking-widest">
                  <ClipboardList className="w-3.5 h-3.5 mr-3" /> Assign Exercise
                  <ChevronRight className="w-3 h-3 ml-auto" />
                </Button>
              </Link>
              <Link to="/trainer/reports">
                <Button variant="outline" className="w-full justify-start h-10 text-xs uppercase tracking-widest">
                  <ShieldAlert className="w-3.5 h-3.5 mr-3" /> Assessment Reports
                  <ChevronRight className="w-3 h-3 ml-auto" />
                </Button>
              </Link>
              {role === 'admin' && (
                <Link to="/users">
                  <Button variant="outline" className="w-full justify-start h-10 text-xs uppercase tracking-widest border-yellow-400/20 text-yellow-400/70 hover:text-yellow-400">
                    <UserCog className="w-3.5 h-3.5 mr-3" /> Manage Users
                    <ChevronRight className="w-3 h-3 ml-auto" />
                  </Button>
                </Link>
              )}
              <Link to="/scenarios">
                <Button variant="ghost" className="w-full justify-start h-10 text-xs uppercase tracking-widest">
                  <Target className="w-3.5 h-3.5 mr-3" /> Browse Scenarios
                  <ChevronRight className="w-3 h-3 ml-auto" />
                </Button>
              </Link>
            </div>
          </SectionCard>

          {/* Training Groups */}
          <SectionCard
            title={t('instructor.groups')}
            icon={Users}
            actions={
              <Link to="/trainer/groups">
                <Button variant="ghost" size="sm" className="text-[10px] uppercase tracking-widest">
                  View All <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            }
          >
            {groupsLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-10 glass-panel animate-pulse" />)}
              </div>
            ) : groups.length === 0 ? (
              <Link to="/trainer/groups">
                <div className="text-center py-4 border border-dashed border-primary/20 hover:border-primary/40 transition-colors cursor-pointer">
                  <p className="text-[10px] font-mono text-muted-foreground">No groups yet</p>
                  <p className="text-[10px] font-mono text-primary mt-1">+ Create your first group</p>
                </div>
              </Link>
            ) : (
              <div className="space-y-1.5">
                {groups.slice(0, 4).map(group => (
                  <Link key={group.id} to={`/trainer/groups/${group.id}`}>
                    <div className="flex items-center justify-between p-2.5 hover:bg-primary/5 border border-white/5 hover:border-primary/20 transition-all group">
                      <div>
                        <p className="text-xs font-mono font-bold group-hover:text-primary transition-colors">{group.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {group.trainee_ids?.length || 0} trainees
                          {group.tags?.length > 0 && ` · ${group.tags.slice(0, 2).join(', ')}`}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </Link>
                ))}
                {groups.length > 4 && (
                  <Link to="/trainer/groups">
                    <p className="text-[10px] font-mono text-muted-foreground text-center py-1 hover:text-primary transition-colors">
                      +{groups.length - 4} more groups
                    </p>
                  </Link>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Recent Assignments */}
        <div className="lg:col-span-2">
          <SectionCard
            title="Recent Assignments"
            icon={ClipboardList}
            actions={
              <Link to="/trainer/assignments">
                <Button variant="ghost" size="sm" className="text-[10px] uppercase tracking-widest">
                  View All <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            }
          >
            {assignmentsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 glass-panel animate-pulse" />)}
              </div>
            ) : recentAssignments.length === 0 ? (
              <Link to="/trainer/assignments">
                <EmptyState
                  icon={ClipboardList}
                  title="No assignments yet"
                  description="Assign exercises to trainees to start tracking their progress."
                />
              </Link>
            ) : (
              <div className="space-y-2">
                {recentAssignments.map(assignment => {
                  const statusColor = {
                    active:    'text-yellow-400 border-yellow-400/30',
                    completed: 'text-emerald-400 border-emerald-400/30',
                    cancelled: 'text-red-400/60 border-red-400/20',
                    expired:   'text-muted-foreground border-white/10',
                  }[assignment.status] || 'text-muted-foreground border-white/10';

                  return (
                    <div key={assignment.id} className="flex items-center justify-between p-3 border border-white/5 hover:border-primary/20 transition-all">
                      <div className="min-w-0">
                        <p className="text-xs font-mono font-bold truncate">{assignment.title}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {assignment.content_type} · Pass: {assignment.passing_score}%
                          {assignment.due_date && ` · Due: ${new Date(assignment.due_date).toLocaleDateString()}`}
                        </p>
                      </div>
                      <span className={`text-[9px] font-mono uppercase border px-1.5 py-0.5 flex-shrink-0 ml-3 ${statusColor}`}>
                        {assignment.status}
                      </span>
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
