import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Target, Flag, ListChecks, Zap,
  Calendar, ChevronRight, CheckCircle2, Clock, AlertTriangle, Award, Loader2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import EmptyState from '../components/EmptyState';
import StatCard from '../components/StatCard';
import { useApi } from '../hooks/useApi';
import api from '../services/api';
import { toast } from 'sonner';

const CONTENT_TYPE_ICONS = {
  challenge: Target,
  campaign: Flag,
  quiz: ListChecks,
  ai_persona: Zap,
};
const CONTENT_TYPE_LABELS = {
  challenge: 'Skenario',
  campaign: 'Kampanye',
  quiz: 'Kuis',
  ai_persona: 'AI Persona',
};

function AssignmentCard({ assignment }) {
  const navigate = useNavigate();
  const Icon = CONTENT_TYPE_ICONS[assignment.content_type] || Target;
  const result = assignment.result;
  const [starting, setStarting] = useState(false);

  const isOverdue = assignment.due_date &&
    new Date(assignment.due_date) < new Date() &&
    assignment.status === 'active';
  const isPassed = result?.passed;
  const score = result?.score;

  const launchAssignment = async () => {
    setStarting(true);
    try {
      switch (assignment.content_type) {
        case 'challenge': {
          // Create simulation directly for this specific challenge
          const res = await api.post('/simulations', {
            challenge_id: assignment.content_id,
            title: assignment.title,
            simulation_type: 'simulation',
            status: 'running',
            assignment_id: assignment.id,
          });
          navigate(`/simulations/${res.data.id}/play`);
          break;
        }
        case 'quiz':
          // Navigate directly to quiz player
          navigate(`/quizzes/${assignment.content_id}/play`);
          break;
        case 'campaign':
          // Navigate to campaign page — campaign progress is managed there
          navigate(`/campaigns?active=${assignment.content_id}`);
          break;
        case 'ai_persona':
          // Navigate to AI challenge with persona pre-selected
          navigate(`/ai-challenge?persona=${assignment.content_id}`);
          break;
        default:
          navigate('/scenarios');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memulai latihan');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className={`p-4 border transition-all group ${
      isPassed ? 'border-emerald-500/20 bg-emerald-500/3'
      : isOverdue ? 'border-red-500/25 bg-red-500/3'
      : 'border-white/5 hover:border-primary/30 hover:bg-white/3'
    }`}>
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`p-2.5 border flex-shrink-0 ${
          isPassed ? 'border-emerald-500/30 text-emerald-400'
          : isOverdue ? 'border-red-400/30 text-red-400'
          : 'border-primary/20 text-primary/60'
        }`}>
          {isPassed ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-sm font-mono font-bold group-hover:text-primary transition-colors truncate">
              {assignment.title}
            </p>
            {isOverdue && !isPassed && (
              <span className="text-[9px] font-mono text-red-400 border border-red-400/30 px-1.5 py-0.5 uppercase flex-shrink-0">
                Terlambat
              </span>
            )}
            {isPassed && (
              <span className="text-[9px] font-mono text-emerald-400 border border-emerald-400/30 px-1.5 py-0.5 uppercase flex-shrink-0">
                Lulus {score !== null ? `· ${Math.round(score)}%` : ''}
              </span>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground font-mono mb-2">
            {CONTENT_TYPE_LABELS[assignment.content_type]}
            {' · '}Nilai lulus: {assignment.passing_score}%
            {' · '}{assignment.max_attempts} percobaan maks
            {result && ` · Percobaan ke-${result.attempts}`}
          </p>

          {assignment.instructions && (
            <div className="p-2.5 bg-black/20 border border-white/5 mb-3">
              <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                <span className="text-primary/60 uppercase tracking-widest mr-1.5">Catatan Instruktur:</span>
                {assignment.instructions}
              </p>
            </div>
          )}

          <div className="flex items-center gap-4 flex-wrap">
            {assignment.due_date && (
              <span className={`text-[10px] font-mono flex items-center gap-1 ${
                isOverdue ? 'text-red-400' : 'text-muted-foreground'
              }`}>
                <Calendar className="w-3 h-3" />
                Batas: {new Date(assignment.due_date).toLocaleDateString('id-ID')}
              </span>
            )}
            {result?.instructor_feedback && (
              <span className="text-[10px] font-mono text-primary/60 flex items-center gap-1">
                <Award className="w-3 h-3" />
                Feedback instruktur tersedia
              </span>
            )}
          </div>

          {result?.instructor_feedback && (
            <div className="mt-2 p-2.5 bg-primary/5 border border-primary/15">
              <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                <span className="text-primary uppercase tracking-widest mr-1.5">Feedback:</span>
                {result.instructor_feedback}
              </p>
            </div>
          )}
        </div>

        {/* Action */}
        <div className="flex-shrink-0">
          {!isPassed ? (
            <Button
              size="sm"
              variant={isOverdue ? 'destructive' : 'default'}
              className="text-[10px] uppercase tracking-widest"
              onClick={launchAssignment}
              disabled={starting}
            >
              {starting
                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Memuat...</>
                : <>{result ? 'Coba Lagi' : 'Mulai'} <ChevronRight className="w-3 h-3 ml-1" /></>
              }
            </Button>
          ) : (
            <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest text-right">
              <CheckCircle2 className="w-5 h-5 mx-auto" />
              Selesai
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MyAssignmentsPage() {
  const { t } = useTranslation();

  const { data: assignmentsRaw, loading } = useApi('/assignments/mine');
  const assignments = assignmentsRaw ?? [];

  const active    = assignments.filter(a => a.status === 'active');
  const completed = assignments.filter(a => a.status === 'completed');
  const overdue   = active.filter(a =>
    a.due_date && new Date(a.due_date) < new Date()
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <PageHeader
        icon={ClipboardList}
        title="Penugasan Saya"
        description="Latihan yang ditugaskan oleh instruktur Anda"
      />

      {assignments.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={ClipboardList} label="Aktif" value={active.length}
            colorClass="border-primary" textClass="text-primary" />
          <StatCard icon={CheckCircle2} label="Selesai" value={completed.length}
            colorClass="border-emerald-500" textClass="text-emerald-400" />
          <StatCard icon={AlertTriangle} label="Terlambat" value={overdue.length}
            colorClass="border-red-500" textClass="text-red-400" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 glass-panel animate-pulse" />)}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Belum ada penugasan"
          description="Instruktur Anda belum memberikan tugas. Sementara itu, eksplorasi skenario dan kuis secara mandiri."
          action={() => window.location.href = '/scenarios'}
          actionLabel="Jelajahi Skenario"
        />
      ) : (
        <>
          {overdue.length > 0 && (
            <SectionCard title={`Terlambat (${overdue.length})`} icon={AlertTriangle}>
              <div className="space-y-3">
                {overdue.map(a => <AssignmentCard key={a.id} assignment={a} />)}
              </div>
            </SectionCard>
          )}

          {active.filter(a => !overdue.includes(a)).length > 0 && (
            <SectionCard
              title={`Penugasan Aktif (${active.filter(a => !overdue.includes(a)).length})`}
              icon={Clock}
            >
              <div className="space-y-3">
                {active.filter(a => !overdue.includes(a)).map(a => <AssignmentCard key={a.id} assignment={a} />)}
              </div>
            </SectionCard>
          )}

          {completed.length > 0 && (
            <SectionCard title={`Selesai (${completed.length})`} icon={CheckCircle2}>
              <div className="space-y-3 opacity-75">
                {completed.map(a => <AssignmentCard key={a.id} assignment={a} />)}
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
