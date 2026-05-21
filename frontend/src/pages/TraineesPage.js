import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Users, Plus, Search, ChevronRight, User, Shield, Activity,
  AlertTriangle, CheckCircle2, X, UserPlus, Tag
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import EmptyState from '../components/EmptyState';
import StatCard from '../components/StatCard';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

function CreateGroupModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/instructor/groups', {
        name: name.trim(),
        description: description.trim() || undefined,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      toast.success(t('instructor.group_created'));
      onCreated(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass-panel border border-primary/30 p-6 max-w-md w-full mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono font-bold uppercase tracking-widest text-primary text-sm">{t('instructor.create_group')}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-primary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="font-mono text-xs uppercase">{t('instructor.group_name')} *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="font-mono mt-1" placeholder="Alpha Platoon" required />
          </div>
          <div>
            <Label className="font-mono text-xs uppercase">{t('common.description')}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="font-mono mt-1" placeholder="Intel Unit — Batch 2025" />
          </div>
          <div>
            <Label className="font-mono text-xs uppercase">{t('instructor.group_tags')}</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} className="font-mono mt-1" placeholder="ranger, intel, signals" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="flex-1 text-xs uppercase tracking-widest">
              {loading ? t('common.loading') : t('instructor.create_group')}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="text-xs uppercase tracking-widest">
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddTraineeModal({ groupId, onClose, onAdded }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post(`/instructor/groups/${groupId}/trainees`, { username });
      toast.success(t('instructor.trainee_added'));
      onAdded(res.data.trainee);
      setUsername('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Trainee not found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass-panel border border-primary/30 p-6 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono font-bold uppercase tracking-widest text-primary text-sm">{t('instructor.add_trainee')}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-primary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="font-mono text-xs uppercase">Username</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} className="font-mono mt-1" placeholder="trainee_username" required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading} className="flex-1 text-xs uppercase tracking-widest">
              {loading ? t('common.loading') : t('instructor.add_trainee')}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="text-xs uppercase tracking-widest">{t('common.cancel')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TraineesPage() {
  const { t } = useTranslation();
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddTrainee, setShowAddTrainee] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: groups = [], loading, refetch: refetchGroups } = useApi('/instructor/groups');
  const { data: groupDetail, refetch: refetchDetail } = useApi(
    selectedGroup ? `/instructor/groups/${selectedGroup}` : null,
    { manual: !selectedGroup }
  );

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.tags || []).some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleRemoveTrainee = async (traineeId) => {
    if (!selectedGroup) return;
    if (!window.confirm('Remove this trainee from the group?')) return;
    try {
      await api.delete(`/instructor/groups/${selectedGroup}/trainees/${traineeId}`);
      toast.success('Trainee removed');
      refetchDetail();
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <PageHeader icon={Users} title={t('instructor.trainees')} description="Manage training groups and participants">
        <Button size="sm" onClick={() => setShowCreateGroup(true)} className="text-xs uppercase tracking-widest">
          <Plus className="w-3.5 h-3.5 mr-2" /> {t('instructor.create_group')}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Groups List */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search groups..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 font-mono text-xs"
            />
          </div>

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 glass-panel animate-pulse" />)}</div>
          ) : filteredGroups.length === 0 ? (
            <EmptyState icon={Users} title={t('instructor.no_groups')} action={() => setShowCreateGroup(true)} actionLabel={t('instructor.create_group')} />
          ) : (
            <div className="space-y-2">
              {filteredGroups.map(group => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`w-full text-left p-3 border transition-all ${
                    selectedGroup === group.id
                      ? 'border-primary bg-primary/8 text-primary'
                      : 'border-white/5 hover:border-primary/30 hover:bg-primary/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-bold truncate">{group.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {group.trainee_ids?.length || 0} trainees
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1 ml-2">
                      {(group.tags || []).slice(0, 2).map(tag => (
                        <span key={tag} className="text-[9px] font-mono border border-primary/20 px-1 text-primary/60">{tag}</span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Group Detail */}
        <div className="lg:col-span-2">
          {!selectedGroup ? (
            <div className="h-64 flex items-center justify-center border border-dashed border-primary/20 text-muted-foreground font-mono text-sm">
              Select a group to view trainees
            </div>
          ) : (
            <SectionCard
              title={groupDetail?.name || 'Group'}
              icon={Users}
              actions={
                <Button size="sm" variant="outline" onClick={() => setShowAddTrainee(true)} className="text-[10px] uppercase tracking-widest">
                  <UserPlus className="w-3 h-3 mr-1.5" /> Add Trainee
                </Button>
              }
            >
              {!groupDetail ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 glass-panel animate-pulse" />)}</div>
              ) : (groupDetail.trainees || []).length === 0 ? (
                <EmptyState icon={User} title={t('instructor.no_trainees')} action={() => setShowAddTrainee(true)} actionLabel={t('instructor.add_trainee')} />
              ) : (
                <div className="space-y-2">
                  {groupDetail.trainees.map(trainee => (
                    <div key={trainee.id} className="flex items-center justify-between p-3 border border-white/5 hover:border-primary/20 transition-all group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary/60" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-bold truncate">{trainee.display_name || trainee.username}</p>
                          <p className="text-[10px] text-muted-foreground">@{trainee.username} · LVL {trainee.level || 1} · {trainee.xp || 0} XP</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link to={`/trainer/user-history`} state={{ userId: trainee.id }}>
                          <Button variant="ghost" size="sm" className="text-[10px] h-7 px-2">Riwayat</Button>
                        </Link>
                        <button
                          onClick={() => handleRemoveTrainee(trainee.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove from group"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {groupDetail && (groupDetail.tags || []).length > 0 && (
                <div className="flex items-center gap-2 pt-3 border-t border-white/5 mt-3">
                  <Tag className="w-3 h-3 text-muted-foreground" />
                  {groupDetail.tags.map(tag => (
                    <span key={tag} className="text-[10px] font-mono border border-primary/20 px-2 py-0.5 text-primary/60">{tag}</span>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={() => refetchGroups()}
        />
      )}

      {showAddTrainee && selectedGroup && (
        <AddTraineeModal
          groupId={selectedGroup}
          onClose={() => setShowAddTrainee(false)}
          onAdded={() => refetchDetail()}
        />
      )}
    </div>
  );
}
