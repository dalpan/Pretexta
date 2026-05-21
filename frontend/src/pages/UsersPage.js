import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Users, Search, Shield, User, Flame, Award, ChevronRight,
  UserCog, AlertTriangle, CheckCircle2, X, RefreshCw, Plus, Eye, EyeOff
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import EmptyState from '../components/EmptyState';
import StatCard from '../components/StatCard';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

function CreateUserModal({ onClose, onCreated, isAdmin }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    username: '', password: '', display_name: '', email: '', role: 'user',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) =>
    setForm((p) => ({ ...p, [field]: typeof e === 'string' ? e : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      toast.error('Username dan password wajib diisi');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/create-user', form);
      toast.success(res.data.message);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-panel border border-primary/30 p-6 max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono font-bold uppercase tracking-widest text-primary text-sm">
            Buat Akun Baru
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-mono uppercase text-xs">Username *</Label>
              <Input value={form.username} onChange={update('username')}
                className="font-mono mt-1 text-sm" placeholder="nama_pengguna" required />
            </div>
            <div>
              <Label className="font-mono uppercase text-xs">Nama Lengkap</Label>
              <Input value={form.display_name} onChange={update('display_name')}
                className="font-mono mt-1 text-sm" placeholder="Budi Santoso" />
            </div>
          </div>

          <div>
            <Label className="font-mono uppercase text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={update('email')}
              className="font-mono mt-1 text-sm" placeholder="budi@instansi.go.id" />
          </div>

          <div>
            <Label className="font-mono uppercase text-xs">Password *</Label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={update('password')}
                className="font-mono text-sm pr-10"
                placeholder="Min. 8 karakter, huruf besar, angka"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground font-mono mt-1">
              Min. 8 karakter · Satu huruf besar · Satu angka
            </p>
          </div>

          {/* Role — admin can set trainer, trainer can only set user */}
          {isAdmin && (
            <div>
              <Label className="font-mono uppercase text-xs">Role</Label>
              <Select value={form.role} onValueChange={update('role')}>
                <SelectTrigger className="font-mono text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User (Peserta)</SelectItem>
                  <SelectItem value="trainer">Trainer (Instruktur)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="flex-1 text-xs uppercase tracking-widest">
              {loading ? 'Membuat...' : 'Buat Akun'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="text-xs uppercase tracking-widest">
              Batal
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ROLE_BADGE = {
  admin:   { label: 'Admin',   color: 'text-red-400 border-red-400/30 bg-red-400/5' },
  trainer: { label: 'Trainer', color: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5' },
  user:    { label: 'User',    color: 'text-primary/60 border-primary/20 bg-primary/5' },
};

function UserRow({ user, onPromote, isAdmin }) {
  const badge = ROLE_BADGE[user.role] || ROLE_BADGE.user;

  return (
    <div className="flex items-center gap-4 p-3.5 border border-white/5 hover:border-primary/20 hover:bg-white/3 transition-all group">
      {/* Avatar */}
      <div className="w-9 h-9 bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <User className="w-4 h-4 text-primary/60" />
      </div>

      {/* Identity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-mono font-bold truncate">
            {user.display_name || user.username}
          </p>
          <span className={`text-[9px] font-mono uppercase tracking-widest border px-1.5 py-0.5 flex-shrink-0 ${badge.color}`}>
            {badge.label}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
          @{user.username}
          {user.email && ` · ${user.email}`}
          {' · '}LVL {user.level || 1} · {user.xp || 0} XP
        </p>
      </div>

      {/* Stats */}
      <div className="hidden md:flex items-center gap-4 flex-shrink-0 text-right">
        <div>
          <p className="text-[9px] text-muted-foreground font-mono uppercase">Streak</p>
          <p className="text-sm font-mono font-bold text-orange-400 flex items-center gap-0.5">
            <Flame className="w-3 h-3" /> {user.streak_days || 0}d
          </p>
        </div>
        <div>
          <p className="text-[9px] text-muted-foreground font-mono uppercase">Badges</p>
          <p className="text-sm font-mono font-bold text-yellow-400">
            {user.badges?.length || 0}
          </p>
        </div>
      </div>

      {/* Actions — only admin can change roles */}
      {isAdmin && user.role !== 'admin' && (
        <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {user.role === 'user' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPromote(user.username, 'trainer')}
              className="text-[10px] uppercase tracking-widest h-7 border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10"
            >
              <UserCog className="w-3 h-3 mr-1" /> Make Trainer
            </Button>
          ) : user.role === 'trainer' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPromote(user.username, 'user')}
              className="text-[10px] uppercase tracking-widest h-7 border-white/20 text-muted-foreground hover:bg-white/5"
            >
              <X className="w-3 h-3 mr-1" /> Revoke Trainer
            </Button>
          ) : null}
        </div>
      )}

      <p className="text-[9px] text-muted-foreground font-mono flex-shrink-0 hidden lg:block">
        {user.created_at ? new Date(user.created_at).toLocaleDateString() : ''}
      </p>
    </div>
  );
}

export default function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const endpoint = `/instructor/users/all${roleFilter !== 'all' ? `?role=${roleFilter}` : ''}`;
  const { data: usersRaw, loading, refetch } = useApi(endpoint, { deps: [refreshKey, roleFilter] });
  const users = usersRaw ?? [];

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.display_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  const totalUsers    = users.filter(u => u.role === 'user').length;
  const totalTrainers = users.filter(u => u.role === 'trainer').length;
  const totalAdmins   = users.filter(u => u.role === 'admin').length;

  const handlePromote = async (username, newRole) => {
    const action = newRole === 'trainer' ? 'promote to Trainer' : 'demote to User';
    if (!window.confirm(`${action} @${username}?`)) return;
    try {
      const res = await api.post('/auth/promote', { username, role: newRole });
      toast.success(res.data.message);
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.response?.data?.detail || t('errors.generic'));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <PageHeader
        icon={Users}
        title="User Management"
        description={isAdmin
          ? "View and manage all platform users. Promote users to Trainer role."
          : "View users in your training cohort."}
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="text-[10px] uppercase tracking-widest"
          >
            <Plus className="w-3 h-3 mr-2" /> Buat Akun
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey(k => k + 1)}
            className="text-[10px] uppercase tracking-widest"
          >
            <RefreshCw className="w-3 h-3 mr-2" /> Refresh
          </Button>
        </div>
      </PageHeader>

      {/* Stats — admin only */}
      {isAdmin && (
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <StatCard icon={User} label="Users" value={totalUsers}
            colorClass="border-primary" textClass="text-primary" />
          <StatCard icon={UserCog} label="Trainers" value={totalTrainers}
            colorClass="border-yellow-500" textClass="text-yellow-400" />
          <StatCard icon={Shield} label="Admins" value={totalAdmins}
            colorClass="border-red-500" textClass="text-red-400" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by username, name, or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 font-mono text-sm"
          />
        </div>
        {isAdmin && (
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="font-mono text-xs w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="user">Users Only</SelectItem>
              <SelectItem value="trainer">Trainers Only</SelectItem>
              <SelectItem value="admin">Admins Only</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Users list */}
      <SectionCard title={`${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''}`} icon={Users}>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 glass-panel animate-pulse" />)}
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState icon={Users} title="No users found" description="Try adjusting your search or filter." />
        ) : (
          <div className="space-y-1">
            {/* Table header */}
            <div className="flex items-center gap-4 px-3.5 pb-2 border-b border-white/5">
              <div className="w-9 flex-shrink-0" />
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest flex-1">User</p>
              {isAdmin && <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest hidden md:block">Actions</p>}
            </div>
            {filteredUsers.map(u => (
              <UserRow
                key={u.id}
                user={u}
                onPromote={handlePromote}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Role guide */}
      <SectionCard title="Role Permissions" icon={Shield}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              role: 'user', badge: ROLE_BADGE.user, icon: User,
              perms: ['Complete assigned exercises', 'Access all scenarios & quizzes', 'Personal analytics & leaderboard', 'AI challenge roleplay'],
            },
            {
              role: 'trainer', badge: ROLE_BADGE.trainer, icon: UserCog,
              perms: ['All user permissions', 'Create training groups', 'Assign exercises to users', 'View cohort reports & risk profiles', 'Scenario builder'],
            },
            {
              role: 'admin', badge: ROLE_BADGE.admin, icon: Shield,
              perms: ['All trainer permissions', 'Promote/demote users', 'Platform settings & LLM config', 'Webhook management', 'Full system access'],
            },
          ].map(({ role, badge, icon: Icon, perms }) => (
            <div key={role} className={`p-4 border ${badge.color}`}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4" />
                <span className={`text-xs font-mono font-bold uppercase tracking-widest ${badge.color.split(' ')[0]}`}>
                  {badge.label}
                </span>
              </div>
              <ul className="space-y-1.5">
                {perms.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-[10px] font-mono text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5 text-emerald-400/50" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      {showCreateModal && (
        <CreateUserModal
          isAdmin={isAdmin}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
