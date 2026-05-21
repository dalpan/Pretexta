import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Flag, Play, CheckCircle2, Lock, ChevronRight, Trophy,
  Plus, X, Info, Layers, Clock, Target, Loader2,
  ArrowRight, BookOpen, AlertTriangle
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const DIFFICULTY_COLORS = {
  easy:   'text-emerald-400 border-emerald-400/30',
  medium: 'text-yellow-400 border-yellow-400/30',
  hard:   'text-red-400 border-red-400/30',
};

const CHANNEL_LABELS = {
  email_inbox:  '📧 Email',
  chat:         '💬 Chat / WhatsApp',
  whatsapp:     '💬 WhatsApp',
  telephone:    '📞 Telepon',
  phone:        '📞 Telepon',
  social_media: '👥 Media Sosial',
  narrator:     '🎬 Narasi',
};

// ─── Create Campaign Modal ────────────────────────────────────────────────────

function CreateCampaignModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', difficulty: 'medium', estimated_time: '30',
    is_published: true,
  });
  const [loading, setLoading] = useState(false);
  const update = (f) => (e) => setForm(p => ({ ...p, [f]: typeof e === 'string' ? e : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/campaigns', {
        title: form.title,
        description: form.description,
        difficulty: form.difficulty,
        estimated_time: parseInt(form.estimated_time),
        stages: [],
        cialdini_categories: [],
        is_published: form.is_published,
      });
      toast.success('Kampanye berhasil dibuat');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal membuat kampanye');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-panel border border-primary/30 p-6 max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono font-bold uppercase tracking-widest text-primary text-sm">Buat Kampanye Baru</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-primary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 bg-blue-500/5 border border-blue-500/20 text-[10px] font-mono text-blue-400 leading-relaxed">
          <strong>Kampanye</strong> adalah simulasi serangan multi-tahap. Setiap tahap menggunakan skenario yang sudah ada. Peserta menyelesaikan tahap secara berurutan seperti serangan APT nyata.
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="font-mono uppercase text-xs">Judul Kampanye *</Label>
            <Input value={form.title} onChange={update('title')} className="font-mono mt-1 text-sm"
              placeholder="Operasi Pembobolan Jaringan Perbankan" required />
          </div>
          <div>
            <Label className="font-mono uppercase text-xs">Deskripsi</Label>
            <textarea value={form.description} onChange={update('description')}
              className="w-full mt-1 font-mono text-xs bg-black/40 border border-input rounded-none px-3 py-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3} placeholder="Simulasi serangan phishing berlapis terhadap pegawai BUMN..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-mono uppercase text-xs">Tingkat Kesulitan</Label>
              <Select value={form.difficulty} onValueChange={update('difficulty')}>
                <SelectTrigger className="font-mono text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Mudah</SelectItem>
                  <SelectItem value="medium">Sedang</SelectItem>
                  <SelectItem value="hard">Sulit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-mono uppercase text-xs">Estimasi Waktu (menit)</Label>
              <Input type="number" min="5" value={form.estimated_time} onChange={update('estimated_time')} className="font-mono mt-1 text-xs" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="flex-1 text-xs uppercase tracking-widest">
              {loading ? 'Membuat...' : 'Buat Kampanye'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="text-xs uppercase tracking-widest">Batal</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stage Item ───────────────────────────────────────────────────────────────

function StageItem({ stage, idx, isCompleted, isCurrent, isLocked, onPlay, playing }) {
  const channelLabel = CHANNEL_LABELS[stage.channel] || stage.channel;
  const hasContent = stage.challenge_id || stage.challenge_title || stage.quiz_id;

  return (
    <div className={`p-3 border-l-2 transition-all ${
      isCompleted ? 'border-l-emerald-500 bg-emerald-500/5' :
      isCurrent   ? 'border-l-yellow-400 bg-yellow-400/5' :
                    'border-l-white/10 bg-white/[0.02]'
    }`}>
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="flex-shrink-0 mt-0.5">
          {isCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
           isCurrent   ? <Play className="w-4 h-4 text-yellow-400" /> :
                         <Lock className="w-4 h-4 text-muted-foreground/30" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-xs font-mono font-bold truncate ${
            isCompleted ? 'text-emerald-400' : isCurrent ? 'text-yellow-400' : 'text-muted-foreground/60'
          }`}>
            Tahap {idx + 1}: {stage.title}
          </p>
          {stage.description && (
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{stage.description}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-1.5">
            <span className="text-[9px] font-mono text-muted-foreground/60">{channelLabel}</span>
            {(stage.challenge_title || stage.quiz_title) && (
              <span className="text-[9px] font-mono border border-primary/20 text-primary/60 px-1.5 py-0.5 truncate max-w-[200px]">
                {stage.challenge_title || stage.quiz_title}
              </span>
            )}
          </div>
        </div>

        {/* Play button — only for current stage */}
        {isCurrent && (
          <Button
            size="sm"
            onClick={() => onPlay(idx, stage)}
            disabled={playing}
            className="text-[10px] uppercase tracking-widest flex-shrink-0 h-7"
          >
            {playing
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : hasContent
                ? <><Play className="w-3 h-3 mr-1" /> Mulai</>
                : <><CheckCircle2 className="w-3 h-3 mr-1" /> Selesaikan</>
            }
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Campaign Detail Panel ─────────────────────────────────────────────────

function CampaignDetail({ campaignId, onReset }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playingStage, setPlayingStage] = useState(null);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/campaigns/${campaignId}`);
      setDetail(res.data);
    } catch (err) {
      toast.error('Gagal memuat kampanye');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (campaignId) loadDetail();
  }, [campaignId]);

  const startCampaign = async () => {
    try {
      await api.post(`/campaigns/${campaignId}/start`, {});
      toast.success('Kampanye dimulai!');
      await loadDetail();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memulai kampanye');
    }
  };

  const playStage = async (stageIdx, stage) => {
    setPlayingStage(stageIdx);
    try {
      const res = await api.post(`/campaigns/${campaignId}/stage/${stageIdx}/start`, {});
      const { type, simulation_id, quiz_id } = res.data;

      if (type === 'challenge' && simulation_id) {
        navigate(`/simulations/${simulation_id}/play`);
      } else if (type === 'quiz' && quiz_id) {
        navigate(`/quizzes/${quiz_id}/play`);
      } else {
        // Manual stage — mark complete immediately
        await completeStage(stageIdx, 100);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memulai tahap');
    } finally {
      setPlayingStage(null);
    }
  };

  const completeStage = async (stageIdx, score = 100) => {
    try {
      const res = await api.post(`/campaigns/${campaignId}/stage/${stageIdx}/complete`, { score });
      if (res.data.is_complete) {
        toast.success('🏆 Kampanye Selesai! Semua tahap berhasil diselesaikan.');
      } else {
        toast.success(`Tahap ${stageIdx + 1} selesai — Tahap ${stageIdx + 2} dibuka!`);
      }
      await loadDetail();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyelesaikan tahap');
    }
  };

  if (loading) {
    return (
      <div className="glass-panel border border-primary/25 p-6 space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-10 bg-white/5 animate-pulse" />)}
      </div>
    );
  }

  if (!detail) return null;

  const { campaign, progress } = detail;
  const stages = campaign.stages || [];
  const currentStageIdx = progress?.current_stage ?? -1;
  const isCompleted = progress?.status === 'completed';
  const isStarted = !!progress;

  return (
    <div className="glass-panel border border-primary/25 sticky top-6">
      {/* Header */}
      <div className="p-5 border-b border-primary/20">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className="text-base font-bold font-mono text-primary leading-tight">{campaign.title}</h2>
          <button onClick={onReset} className="text-muted-foreground hover:text-primary flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        {campaign.description && (
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{campaign.description}</p>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`text-[9px] font-mono border px-1.5 py-0.5 uppercase ${DIFFICULTY_COLORS[campaign.difficulty] || DIFFICULTY_COLORS.medium}`}>
            {campaign.difficulty}
          </span>
          <span className="text-[9px] font-mono border border-white/10 px-1.5 py-0.5 text-muted-foreground flex items-center gap-1">
            <Layers className="w-2.5 h-2.5" /> {stages.length} Tahap
          </span>
          <span className="text-[9px] font-mono border border-white/10 px-1.5 py-0.5 text-muted-foreground flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> ~{campaign.estimated_time}m
          </span>
        </div>

        {/* How to play info */}
        {!isStarted && (
          <div className="p-3 bg-blue-500/5 border border-blue-500/20 text-[10px] font-mono text-blue-400 leading-relaxed mb-3">
            <p className="font-bold mb-1">Cara Bermain Kampanye:</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Klik <strong>Mulai Kampanye</strong> untuk memulai</li>
              <li>Selesaikan setiap tahap secara berurutan</li>
              <li>Klik <strong>Mulai</strong> pada tahap aktif untuk memainkannya</li>
              <li>Selesaikan semua tahap untuk menyelesaikan kampanye</li>
            </ol>
          </div>
        )}

        {/* Progress / Action */}
        {isCompleted ? (
          <div className="p-4 border border-emerald-500/30 bg-emerald-500/5 text-center">
            <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-1" />
            <p className="font-mono text-emerald-400 font-bold text-sm uppercase tracking-widest">Kampanye Selesai!</p>
            <p className="text-xs text-muted-foreground mt-1">
              Skor akhir: <span className="text-emerald-400 font-bold">{progress.overall_score ?? '—'}%</span>
            </p>
          </div>
        ) : !isStarted ? (
          <Button onClick={startCampaign} className="w-full text-xs uppercase tracking-widest">
            <Play className="w-3.5 h-3.5 mr-2" /> Mulai Kampanye
          </Button>
        ) : (
          <div className="p-3 border border-yellow-500/30 bg-yellow-500/5">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-yellow-400 text-xs font-bold uppercase tracking-widest">
                Sedang Berjalan
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {progress.stage_results?.length || 0}/{stages.length} tahap selesai
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-white/10 w-full mt-2">
              <div
                className="h-full bg-yellow-400 transition-all duration-500"
                style={{ width: `${((progress.stage_results?.length || 0) / Math.max(stages.length, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stage list */}
      <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-3">
          Rantai Serangan ({stages.length} Tahap)
        </p>
        {stages.length === 0 ? (
          <p className="text-[10px] text-muted-foreground font-mono text-center py-4">
            Belum ada tahap dalam kampanye ini.
          </p>
        ) : (
          stages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((stage, idx) => {
            const completedCount = progress?.stage_results?.length ?? 0;
            const isStageCompleted = isStarted && idx < completedCount;
            const isStageCurrent   = isStarted && !isCompleted && idx === currentStageIdx;
            const isLocked         = !isStarted || idx > currentStageIdx;

            return (
              <StageItem
                key={stage.stage_id || idx}
                stage={stage}
                idx={idx}
                isCompleted={isStageCompleted}
                isCurrent={isStageCurrent}
                isLocked={isLocked}
                onPlay={playStage}
                playing={playingStage === idx}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isTrainer = user?.role === 'admin' || user?.role === 'trainer';

  const [selectedId, setSelectedId] = useState(searchParams.get('active') || null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: campaignsRaw, loading } = useApi('/campaigns', { deps: [refreshKey] });
  const campaigns = campaignsRaw ?? [];

  // Auto-select if coming from assignment deep-link
  useEffect(() => {
    const active = searchParams.get('active');
    if (active) setSelectedId(active);
  }, [searchParams]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <PageHeader
        icon={Flag}
        title={t('campaigns.title')}
        description="Simulasi serangan multi-tahap — latih respons terhadap rangkaian serangan rekayasa sosial yang terkoordinasi"
      >
        {isTrainer && (
          <Button size="sm" onClick={() => setShowCreate(true)} className="text-xs uppercase tracking-widest">
            <Plus className="w-3.5 h-3.5 mr-2" /> Buat Kampanye
          </Button>
        )}
      </PageHeader>

      {/* What is a campaign */}
      <div className="p-4 border border-blue-500/20 bg-blue-500/5">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-[10px] font-mono text-blue-400/80 leading-relaxed space-y-1">
            <p className="font-bold text-blue-400">Apa itu Kampanye?</p>
            <p>Kampanye adalah rangkaian serangan yang terkoordinasi — mirip serangan APT nyata. Setiap tahap adalah satu vektor serangan berbeda yang harus diselesaikan secara berurutan.</p>
            <p>Contoh: <span className="text-blue-300">Rekayasa Sosial → Spear Phishing → CEO Fraud → Vishing Bank</span></p>
            {isTrainer && <p className="text-yellow-400">Sebagai Trainer: pilih kampanye, tambahkan tahapan (yang mengarah ke skenario tertentu), lalu tugaskan ke peserta.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Campaign List */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 glass-panel animate-pulse" />)}</div>
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={Flag}
              title={isTrainer ? 'Belum ada kampanye' : 'Belum ada kampanye tersedia'}
              description={isTrainer
                ? 'Buat kampanye multi-tahap untuk simulasi serangan yang lebih realistis.'
                : 'Trainer Anda belum membuat kampanye. Gunakan menu Skenario atau AI Challenge untuk latihan mandiri.'}
              action={isTrainer ? () => setShowCreate(true) : undefined}
              actionLabel={isTrainer ? 'Buat Kampanye Pertama' : undefined}
            />
          ) : (
            campaigns.map(campaign => (
              <Card
                key={campaign.id}
                className={`glass-panel p-5 cursor-pointer transition-all border-l-4 ${
                  selectedId === campaign.id
                    ? 'border-l-primary bg-primary/5'
                    : 'border-l-transparent hover:border-l-primary/50 hover:bg-white/5'
                }`}
                onClick={() => setSelectedId(campaign.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-mono font-bold text-sm truncate">{campaign.title}</h3>
                    {campaign.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{campaign.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className={`text-[9px] font-mono border px-1.5 py-0.5 uppercase ${DIFFICULTY_COLORS[campaign.difficulty] || DIFFICULTY_COLORS.medium}`}>
                        {campaign.difficulty}
                      </span>
                      <span className="text-[9px] font-mono border border-white/10 px-1.5 py-0.5 text-muted-foreground flex items-center gap-1">
                        <Layers className="w-2.5 h-2.5" /> {campaign.stages?.length || 0} Tahap
                      </span>
                      <span className="text-[9px] font-mono border border-white/10 px-1.5 py-0.5 text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> ~{campaign.estimated_time}m
                      </span>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${selectedId === campaign.id ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Campaign Detail Panel */}
        <div>
          {selectedId ? (
            <CampaignDetail
              campaignId={selectedId}
              onReset={() => setSelectedId(null)}
            />
          ) : (
            <div className="h-64 flex items-center justify-center border border-dashed border-primary/20 bg-primary/3">
              <div className="text-center">
                <Flag className="w-10 h-10 mx-auto mb-2 text-primary/30" />
                <p className="font-mono text-xs text-muted-foreground">Pilih kampanye untuk detail</p>
                <p className="font-mono text-[10px] text-muted-foreground/50 mt-1">Atau klik kampanye di kiri untuk mulai bermain</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
