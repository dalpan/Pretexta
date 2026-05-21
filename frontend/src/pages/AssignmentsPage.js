import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList, Plus, X, Target, Flag, ListChecks, Zap,
  Users, User, Calendar, Award, ChevronRight, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import EmptyState from '../components/EmptyState';
import { useApi } from '../hooks/useApi';
import api from '../services/api';

const CONTENT_TYPE_ICONS = {
  challenge: Target,
  campaign: Flag,
  quiz: ListChecks,
  ai_persona: Zap,
};

const CONTENT_TYPE_LABELS = {
  challenge: 'Scenario',
  campaign: 'Campaign',
  quiz: 'Quiz',
  ai_persona: 'AI Persona',
};

function CreateAssignmentModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    target_type: 'group', // 'group' | 'individual'
    group_id: '',
    trainee_id: '',
    content_type: 'challenge',
    content_id: '',
    title: '',
    instructions: '',
    due_date: '',
    passing_score: '70',
    max_attempts: '3',
  });
  const [loading, setLoading] = useState(false);

  const { data: groups = [] }    = useApi('/instructor/groups');
  const { data: trainees = [] }  = useApi('/instructor/trainees');
  const { data: challenges = [] } = useApi('/challenges/all');
  const { data: campaigns = [] } = useApi('/campaigns');
  const { data: quizzes = [] }   = useApi('/quizzes/all');

  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: typeof e === 'string' ? e : e.target.value }));

  const contentOptions = useMemo(() => {
    switch (form.content_type) {
      case 'challenge': return challenges.map(c => ({ id: c.id, label: c.title }));
      case 'campaign': return campaigns.map(c => ({ id: c.id, label: c.title }));
      case 'quiz': return quizzes.map(q => ({ id: q.id, label: q.title }));
      case 'ai_persona': return [
        { id: 'ceo_urgent',         label: 'Direktur Mendesak — Transfer Dana (Hard)' },
        { id: 'it_support',         label: 'IT Support Palsu — Reset Password (Medium)' },
        { id: 'colleague_emergency', label: 'Rekan Kerja Darurat — Kode OTP (Medium)' },
        { id: 'vendor_invoice',     label: 'Vendor Marah — Tagihan Palsu (Medium)' },
        { id: 'mfa_fatigue',        label: 'MFA Fatigue Attack (Hard)' },
        { id: 'govt_tax',           label: 'Petugas DJP — Penipuan Pajak (Hard)' },
        { id: 'deepfake_ceo_video', label: 'Video Deepfake Direktur (Hard)' },
        { id: 'charity_scam',       label: 'Donasi Bencana Palsu (Easy)' },
      ];
      default: return [];
    }
  }, [form.content_type, challenges, campaigns, quizzes]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.content_id || !form.title) return;

    setLoading(true);
    try {
      const payload = {
        content_type: form.content_type,
        content_id: form.content_id,
        title: form.title,
        instructions: form.instructions || undefined,
        due_date: form.due_date || undefined,
        passing_score: parseFloat(form.passing_score),
        max_attempts: parseInt(form.max_attempts),
      };

      const groupId = form.group_id !== '__none__' ? form.group_id : '';
      const traineeId = form.trainee_id !== '__none__' ? form.trainee_id : '';
      if (form.target_type === 'group' && groupId) {
        payload.group_id = groupId;
      } else if (traineeId) {
        payload.trainee_id = traineeId;
      } else {
        toast.error('Pilih kelompok atau peserta terlebih dahulu');
        setLoading(false);
        return;
      }

      const res = await api.post('/instructor/assignments', payload);
      toast.success(t('instructor.assignment_created'));
      onCreated(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-panel border border-primary/30 p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-mono font-bold uppercase tracking-widest text-primary text-sm">{t('instructor.assign_scenario')}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-primary"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, target_type: 'group' }))}
              className={`p-3 border text-xs font-mono uppercase tracking-wider transition-all ${form.target_type === 'group' ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:border-primary/30'}`}
            >
              <Users className="w-4 h-4 mx-auto mb-1" /> {t('instructor.assign_to_group')}
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, target_type: 'individual' }))}
              className={`p-3 border text-xs font-mono uppercase tracking-wider transition-all ${form.target_type === 'individual' ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:border-primary/30'}`}
            >
              <User className="w-4 h-4 mx-auto mb-1" /> {t('instructor.assign_to_individual')}
            </button>
          </div>

          {form.target_type === 'group' ? (
            <div>
              <Label className="font-mono text-xs uppercase">Kelompok Pelatihan *</Label>
              <Select onValueChange={update('group_id')} value={form.group_id}>
                <SelectTrigger className="font-mono text-xs mt-1">
                  <SelectValue placeholder="Pilih kelompok..." />
                </SelectTrigger>
                <SelectContent>
                  {groups.length === 0
                    ? <SelectItem value="__none__" disabled>Belum ada kelompok — buat kelompok dulu</SelectItem>
                    : groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({g.trainee_ids?.length || 0} peserta)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {groups.length === 0 && (
                <p className="text-[10px] text-yellow-400 font-mono mt-1">
                  ⚠ Buat kelompok terlebih dahulu di menu Kelompok Pelatihan
                </p>
              )}
            </div>
          ) : (
            <div>
              <Label className="font-mono text-xs uppercase">Pilih Peserta *</Label>
              <Select onValueChange={update('trainee_id')} value={form.trainee_id}>
                <SelectTrigger className="font-mono text-xs mt-1">
                  <SelectValue placeholder="Pilih peserta..." />
                </SelectTrigger>
                <SelectContent>
                  {trainees.length === 0
                    ? <SelectItem value="__none__" disabled>Belum ada peserta terdaftar</SelectItem>
                    : trainees.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.display_name || u.username} (@{u.username})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {trainees.length === 0 && (
                <p className="text-[10px] text-yellow-400 font-mono mt-1">
                  ⚠ Buat akun peserta terlebih dahulu di menu Users
                </p>
              )}
            </div>
          )}

          {/* Content Type */}
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(CONTENT_TYPE_LABELS).map(([type, label]) => {
              const Icon = CONTENT_TYPE_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, content_type: type, content_id: '' }))}
                  className={`p-2 border text-[10px] font-mono uppercase tracking-wider text-center transition-all ${form.content_type === type ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:border-primary/30'}`}
                >
                  <Icon className="w-3.5 h-3.5 mx-auto mb-0.5" /> {label}
                </button>
              );
            })}
          </div>

          {/* Content Selection */}
          <div>
            <Label className="font-mono text-xs uppercase">Select {CONTENT_TYPE_LABELS[form.content_type]} *</Label>
            <Select onValueChange={update('content_id')}>
              <SelectTrigger className="font-mono text-xs mt-1"><SelectValue placeholder={`Choose ${CONTENT_TYPE_LABELS[form.content_type]}...`} /></SelectTrigger>
              <SelectContent>
                {contentOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div>
            <Label className="font-mono text-xs uppercase">Assignment Title *</Label>
            <Input value={form.title} onChange={update('title')} className="font-mono mt-1 text-xs" placeholder="Week 3 — Phishing Recognition Exercise" required />
          </div>

          {/* Instructions */}
          <div>
            <Label className="font-mono text-xs uppercase">{t('instructor.instructions_for_trainee')}</Label>
            <textarea
              value={form.instructions}
              onChange={update('instructions')}
              className="w-full mt-1 font-mono text-xs bg-black/40 border border-input rounded-none px-3 py-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              placeholder="Complete this scenario and document your decision-making process..."
            />
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="font-mono text-xs uppercase">{t('instructor.due_date')}</Label>
              <Input type="date" value={form.due_date} onChange={update('due_date')} className="font-mono mt-1 text-xs" />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase">{t('instructor.passing_score')}</Label>
              <Input type="number" min="0" max="100" value={form.passing_score} onChange={update('passing_score')} className="font-mono mt-1 text-xs" />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase">{t('instructor.max_attempts')}</Label>
              <Input type="number" min="1" max="10" value={form.max_attempts} onChange={update('max_attempts')} className="font-mono mt-1 text-xs" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="flex-1 text-xs uppercase tracking-widest">
              {loading ? t('common.loading') : 'Create Assignment'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="text-xs uppercase tracking-widest">{t('common.cancel')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AssignmentsPage() {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const { data: assignments = [], loading, refetch } = useApi('/instructor/assignments');

  const filtered = assignments.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (filterType !== 'all' && a.content_type !== filterType) return false;
    return true;
  });

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this assignment?')) return;
    try {
      await api.delete(`/instructor/assignments/${id}`);
      toast.success('Assignment cancelled');
      refetch();
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  const statusColor = {
    active: 'text-yellow-400 border-yellow-400/30',
    completed: 'text-emerald-400 border-emerald-400/30',
    cancelled: 'text-red-400/60 border-red-400/20',
    expired: 'text-muted-foreground border-white/10',
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <PageHeader icon={ClipboardList} title={t('instructor.assignments')} description="Manage scenario assignments for trainees and groups">
        <Button size="sm" onClick={() => setShowCreate(true)} className="text-xs uppercase tracking-widest">
          <Plus className="w-3.5 h-3.5 mr-2" /> New Assignment
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1">
          {['all', 'active', 'completed', 'cancelled'].map(s => (
            <Button key={s} variant={filterStatus === s ? 'default' : 'ghost'} size="sm" onClick={() => setFilterStatus(s)} className="text-[10px] uppercase tracking-widest h-7">
              {s}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          {['all', 'challenge', 'campaign', 'quiz', 'ai_persona'].map(typeKey => (
            <Button key={typeKey} variant={filterType === typeKey ? 'default' : 'ghost'} size="sm" onClick={() => setFilterType(typeKey)} className="text-[10px] uppercase tracking-widest h-7">
              {typeKey === 'all' ? 'All Types' : CONTENT_TYPE_LABELS[typeKey]}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 glass-panel animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('instructor.no_assignments')} action={() => setShowCreate(true)} actionLabel="New Assignment" />
      ) : (
        <div className="space-y-2">
          {filtered.map(assignment => {
            const Icon = CONTENT_TYPE_ICONS[assignment.content_type] || Target;
            const color = statusColor[assignment.status] || 'text-muted-foreground border-white/10';

            return (
              <div key={assignment.id} className="flex items-center gap-4 p-4 glass-panel border border-white/5 hover:border-primary/20 transition-all group">
                <div className={`p-2 border flex-shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-bold group-hover:text-primary transition-colors truncate">{assignment.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground font-mono">
                    <span>{CONTENT_TYPE_LABELS[assignment.content_type]}</span>
                    <span>·</span>
                    <span>Pass: {assignment.passing_score}%</span>
                    <span>·</span>
                    <span>Attempts: {assignment.max_attempts}</span>
                    {assignment.due_date && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          {new Date(assignment.due_date).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-[9px] font-mono uppercase tracking-widest border px-1.5 py-0.5 ${color}`}>
                    {assignment.status}
                  </span>
                  <button
                    onClick={() => handleCancel(assignment.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    title="Cancel assignment"
                    disabled={assignment.status !== 'active'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateAssignmentModal onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
      )}
    </div>
  );
}
