import React, { useState } from 'react';
import {
  History, User, Search, Activity, Clock, Trophy,
  TrendingUp, TrendingDown, Shield, CheckCircle2, XCircle,
  AlertTriangle, ChevronRight
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { useApi } from '../hooks/useApi';
import api from '../services/api';
import { toast } from 'sonner';

const TYPE_LABELS = {
  simulation:   'Skenario',
  ai_challenge: 'AI Challenge',
  quiz:         'Kuis',
  campaign:     'Kampanye',
};

function SimulationRow({ sim }) {
  const score = sim.score ?? 0;
  const isGood = score >= 70;
  const isCompleted = sim.status === 'completed';
  const label = TYPE_LABELS[sim.simulation_type] || sim.simulation_type || 'Simulasi';

  return (
    <div className="flex items-center gap-4 p-3.5 border border-white/5 hover:border-primary/20 hover:bg-white/3 transition-all">
      <div className={`p-1.5 flex-shrink-0 ${isCompleted ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono font-bold truncate">
          {sim.challenge_Title || sim.title || 'Simulasi Tanpa Judul'}
        </p>
        <p className="text-[10px] text-muted-foreground font-mono mt-0.5 flex items-center gap-2">
          <span className="capitalize">{label}</span>
          <span>·</span>
          <span>{sim.status}</span>
          <span>·</span>
          <Clock className="w-2.5 h-2.5" />
          <span>{new Date(sim.completed_at || sim.created_at).toLocaleString('id-ID')}</span>
        </p>
      </div>
      <div className="flex-shrink-0 text-right">
        {isCompleted && (
          <span className={`text-lg font-bold font-mono ${isGood ? 'text-emerald-400' : 'text-orange-400'}`}>
            {Math.round(score)}%
          </span>
        )}
      </div>
    </div>
  );
}

export default function UserHistoryPage() {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('all');

  const { data: usersRaw } = useApi('/instructor/users/all');
  const users = (usersRaw ?? []).filter(u => u.role === 'user' || u.role === 'trainer');

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.display_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  const loadHistory = async (user) => {
    setSelectedUser(user);
    setHistoryData(null);
    setLoading(true);
    try {
      const res = await api.get(`/instructor/user-history?user_id=${user.id}`);
      setHistoryData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memuat riwayat');
    } finally {
      setLoading(false);
    }
  };

  const filteredSims = (historyData?.simulations ?? []).filter(s =>
    filterType === 'all' || s.simulation_type === filterType
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <PageHeader
        icon={History}
        title="Riwayat & Analitik Pengguna"
        description="Lihat riwayat simulasi, skor, dan profil risiko setiap peserta"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List Panel */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari pengguna..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 font-mono text-sm"
            />
          </div>

          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <EmptyState icon={User} title="Tidak ada pengguna" description="Belum ada pengguna terdaftar." />
            ) : (
              filteredUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => loadHistory(u)}
                  className={`w-full flex items-center gap-3 p-3 border text-left transition-all ${
                    selectedUser?.id === u.id
                      ? 'border-primary bg-primary/10'
                      : 'border-white/5 hover:border-primary/30 hover:bg-white/3'
                  }`}
                >
                  <div className="w-8 h-8 bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-3.5 h-3.5 text-primary/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono font-bold truncate">
                      {u.display_name || u.username}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      @{u.username} · LVL {u.level || 1}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* History Detail Panel */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedUser ? (
            <div className="h-64 flex items-center justify-center border border-dashed border-primary/20">
              <div className="text-center">
                <History className="w-10 h-10 mx-auto mb-2 text-primary/30" />
                <p className="font-mono text-xs text-muted-foreground">Pilih pengguna untuk lihat riwayatnya</p>
              </div>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 glass-panel animate-pulse" />)}
            </div>
          ) : historyData ? (
            <>
              {/* User Summary */}
              <div className="glass-panel p-4 border border-primary/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary/60" />
                  </div>
                  <div>
                    <p className="font-mono font-bold text-sm">{selectedUser.display_name || selectedUser.username}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      @{selectedUser.username} · {selectedUser.email || 'no email'} · LVL {selectedUser.level || 1} · {selectedUser.xp || 0} XP
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <StatCard
                    icon={Activity}
                    label="Total Simulasi"
                    value={historyData.summary.total_simulations}
                    colorClass="border-primary"
                    textClass="text-primary"
                  />
                  <StatCard
                    icon={CheckCircle2}
                    label="Selesai"
                    value={historyData.summary.completed}
                    colorClass="border-emerald-500"
                    textClass="text-emerald-400"
                  />
                  <StatCard
                    icon={Trophy}
                    label="Skor Rata-rata"
                    value={historyData.summary.avg_score ?? '—'}
                    suffix={historyData.summary.avg_score !== null ? '%' : ''}
                    colorClass={historyData.summary.avg_score >= 70 ? 'border-emerald-500' : 'border-yellow-500'}
                    textClass={historyData.summary.avg_score >= 70 ? 'text-emerald-400' : 'text-yellow-400'}
                  />
                  <StatCard
                    icon={Shield}
                    label="Penugasan"
                    value={historyData.summary.total_assignments}
                    colorClass="border-blue-500"
                    textClass="text-blue-400"
                  />
                </div>
              </div>

              {/* Risk Profile */}
              {historyData.risk_profile?.current_vector && (
                <SectionCard title="Profil Risiko Cialdini" icon={AlertTriangle}>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(historyData.risk_profile.current_vector).map(([dim, score]) => (
                      <div key={dim} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-muted-foreground capitalize">{dim.replace('_', ' ')}</span>
                          <span className={score < 50 ? 'text-red-400' : score < 70 ? 'text-yellow-400' : 'text-emerald-400'}>
                            {Math.round(score)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-white/10 w-full">
                          <div
                            className={`h-full transition-all ${score < 50 ? 'bg-red-400' : score < 70 ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono mt-3">
                    Skor rendah = rentan terhadap prinsip manipulasi tersebut. Skor tinggi = tahan.
                  </p>
                </SectionCard>
              )}

              {/* Simulation History */}
              <SectionCard title={`Riwayat Simulasi (${filteredSims.length})`} icon={History}>
                {/* Filter Tabs */}
                <div className="flex gap-1 mb-3 flex-wrap">
                  {['all', 'simulation', 'ai_challenge', 'quiz'].map(t => (
                    <Button
                      key={t}
                      variant={filterType === t ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setFilterType(t)}
                      className="text-[10px] uppercase tracking-widest h-6"
                    >
                      {t === 'all' ? 'Semua' : TYPE_LABELS[t] || t}
                    </Button>
                  ))}
                </div>

                {filteredSims.length === 0 ? (
                  <EmptyState icon={Activity} title="Belum ada riwayat simulasi" description="Pengguna ini belum menyelesaikan simulasi apapun." />
                ) : (
                  <div className="space-y-1">
                    {filteredSims.map((sim, i) => (
                      <SimulationRow key={sim.id || i} sim={sim} />
                    ))}
                  </div>
                )}
              </SectionCard>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
