import React, { useState } from 'react';
import {
  ShieldAlert, Flag, Inbox, AlertTriangle, CheckCircle2, Trophy,
  Loader2, Plus, ShieldCheck, Bug, CircleHelp,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { useApi } from '../hooks/useApi';
import api from '../services/api';
import { toast } from 'sonner';

const VERDICT = {
  simulation:   { label: 'Simulasi tertangkap', color: '#6f8f3f', Icon: ShieldCheck },
  needs_review: { label: 'Perlu ditinjau',       color: '#d39a22', Icon: CircleHelp },
  threat:       { label: 'Ancaman nyata',        color: '#c0453f', Icon: Bug },
  benign:       { label: 'Aman (salah lapor)',   color: '#8a94a0', Icon: CheckCircle2 },
};

function VerdictBadge({ verdict }) {
  const v = VERDICT[verdict] || VERDICT.needs_review;
  return (
    <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 border flex items-center gap-1 flex-shrink-0"
      style={{ color: v.color, borderColor: `${v.color}55` }}>
      <v.Icon className="w-3 h-3" /> {v.label}
    </span>
  );
}

function RecordForm({ onDone }) {
  const [f, setF] = useState({ reporter_email: '', subject: '', from_address: '', body: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (!f.reporter_email || !f.subject) { toast.error('Email pelapor & subjek wajib diisi'); return; }
    setBusy(true);
    try {
      const res = await api.post('/report-inbox/ingest', f);
      toast.success(`Laporan dicatat — ${VERDICT[res.data.verdict]?.label || res.data.verdict}`);
      setF({ reporter_email: '', subject: '', from_address: '', body: '' });
      onDone?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Gagal'); }
    finally { setBusy(false); }
  };
  return (
    <SectionCard title="Catat laporan" icon={Plus}>
      <p className="text-[11px] text-muted-foreground font-mono mb-3 leading-relaxed">
        Saat karyawan meneruskan email mencurigakan ke mailbox abuse, sistem memilahnya otomatis.
        Di produksi ini disuplai oleh poller mailbox; di sini bisa dicatat manual untuk uji coba.
      </p>
      <div className="space-y-2">
        <Input placeholder="Email pelapor — alice@acme.test" value={f.reporter_email}
          onChange={(e) => set('reporter_email', e.target.value)} />
        <Input placeholder="Subjek email yang dilaporkan (mis. Fwd: ...)" value={f.subject}
          onChange={(e) => set('subject', e.target.value)} />
        <Input placeholder="Pengirim asli (opsional)" value={f.from_address}
          onChange={(e) => set('from_address', e.target.value)} />
        <Textarea rows={2} placeholder="Isi email (opsional — rahasia otomatis diredaksi)"
          value={f.body} onChange={(e) => set('body', e.target.value)} />
        <Button onClick={submit} disabled={busy} className="w-full text-[11px] uppercase tracking-widest">
          {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Flag className="w-3 h-3 mr-1" />}
          Catat & klasifikasikan
        </Button>
      </div>
    </SectionCard>
  );
}

export default function ReportInboxPage() {
  const { data: reports, loading, refetch } = useApi('/report-inbox');
  const { data: stats, refetch: refetchStats } = useApi('/report-inbox/stats');
  const { data: board, refetch: refetchBoard } = useApi('/report-inbox/leaderboard');
  const [filter, setFilter] = useState(null);

  const refresh = () => { refetch(); refetchStats(); refetchBoard(); };
  const rows = (reports ?? []).filter((r) => !filter || r.verdict === filter);

  const triage = async (id, verdict) => {
    try { await api.patch(`/report-inbox/${id}`, { verdict }); toast.success('Diperbarui'); refresh(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Gagal'); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        icon={ShieldAlert}
        title="Laporan Phishing"
        description="Mailbox abuse — karyawan yang melaporkan phish adalah perilaku yang kita ukur"
      />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Inbox} label="Total laporan" value={stats.total}
            colorClass="border-primary" textClass="text-primary" />
          <StatCard icon={ShieldCheck} label="Simulasi tertangkap" value={stats.simulation}
            colorClass="border-emerald-500" textClass="text-emerald-400" />
          <StatCard icon={AlertTriangle} label="Perlu ditinjau" value={stats.needs_review}
            colorClass="border-amber-500" textClass="text-amber-400" />
          <StatCard icon={Bug} label="Ancaman nyata" value={stats.threat}
            colorClass="border-red-500" textClass="text-red-400" />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* filter chips */}
          <div className="flex flex-wrap gap-2">
            {[['Semua', null], ...Object.entries(VERDICT).map(([k, v]) => [v.label, k])].map(([label, k]) => (
              <button key={label} onClick={() => setFilter(k)}
                className={`text-[10px] font-mono uppercase tracking-wide px-2 py-1 border transition-colors ${
                  filter === k ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:border-primary/40'}`}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 glass-panel animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Inbox} title="Belum ada laporan"
              description="Saat seseorang melaporkan email mencurigakan, laporannya muncul di sini dan dipilah otomatis." />
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="p-3 border border-white/5 hover:border-primary/20 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-mono font-bold truncate">{r.subject || '(tanpa subjek)'}</span>
                    <VerdictBadge verdict={r.verdict} />
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Dilaporkan oleh <span className="text-primary/70">{r.reporter_email}</span>
                    {r.from_address && <> · pengirim: {r.from_address}</>}
                    {r.credited && <span className="text-emerald-400"> · pelapor dikreditkan</span>}
                    {' · '}{new Date(r.created_at).toLocaleString('id-ID')}
                  </p>
                  {r.body_excerpt && (
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-1.5 line-clamp-2 bg-black/20 p-1.5 border border-white/5">
                      {r.body_excerpt}
                    </p>
                  )}
                  {r.verdict === 'needs_review' && (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="text-[10px] uppercase tracking-widest text-red-400 border-red-400/30"
                        onClick={() => triage(r.id, 'threat')}>
                        <Bug className="w-3 h-3 mr-1" /> Tandai ancaman
                      </Button>
                      <Button size="sm" variant="ghost" className="text-[10px] uppercase tracking-widest"
                        onClick={() => triage(r.id, 'benign')}>
                        Tandai aman
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <RecordForm onDone={refresh} />
          <SectionCard title="Pelapor teratas" icon={Trophy}>
            {(board ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground font-mono">Belum ada pelapor.</p>
            ) : (
              <div className="space-y-2">
                {board.map((b, i) => (
                  <div key={b.reporter_email} className="flex items-center gap-3 p-2 border border-white/5">
                    <span className="text-xs font-mono font-bold text-muted-foreground w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono truncate">{b.reporter_email}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{b.reports} laporan</p>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-emerald-400 flex-shrink-0">
                      {b.simulations_caught} ✓
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
