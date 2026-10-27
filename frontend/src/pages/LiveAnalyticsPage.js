import React from 'react';
import {
  BarChart3, Flag, MousePointerClick, Inbox, TrendingUp, AlertTriangle,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { useApi } from '../hooks/useApi';

function pct(x) { return x == null ? '—' : `${Math.round(x * 100)}%`; }

// A horizontal report-rate bar, consistent with the rest of the app (no chart lib).
function CampaignBar({ c }) {
  const rr = c.report_rate == null ? 0 : c.report_rate;
  const cr = c.click_rate == null ? 0 : c.click_rate;
  return (
    <div className="p-2.5 border border-white/5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-mono font-bold truncate">{c.name}</span>
        <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
          {c.launched_at ? new Date(c.launched_at).toLocaleDateString('id-ID') : '—'} · {c.recipients} penerima
        </span>
      </div>
      {/* report rate (good) */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400/70 w-14 flex-shrink-0">Report</span>
        <div className="flex-1 h-2 bg-black/30 overflow-hidden">
          <div className="h-full bg-emerald-500/70" style={{ width: `${rr * 100}%` }} />
        </div>
        <span className="text-[11px] font-mono font-bold text-emerald-400 w-9 text-right flex-shrink-0">{pct(c.report_rate)}</span>
      </div>
      {/* click rate (bad) */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400/70 w-14 flex-shrink-0">Click</span>
        <div className="flex-1 h-2 bg-black/30 overflow-hidden">
          <div className="h-full bg-amber-500/70" style={{ width: `${cr * 100}%` }} />
        </div>
        <span className="text-[11px] font-mono font-bold text-amber-400 w-9 text-right flex-shrink-0">{pct(c.click_rate)}</span>
      </div>
    </div>
  );
}

export default function LiveAnalyticsPage() {
  const { data, loading } = useApi('/live/analytics');
  const o = data?.overall;
  const campaigns = data?.campaigns ?? [];
  const offenders = data?.repeat_offenders ?? [];
  const empty = !loading && campaigns.length === 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        icon={BarChart3}
        title="Analitik Live"
        description="Perilaku lintas kampanye — tren report rate dan siapa yang berulang kali gagal"
      />

      {empty ? (
        <EmptyState icon={BarChart3} title="Belum ada data"
          description="Luncurkan kampanye live dulu — tren report rate dan pelanggar berulang akan muncul di sini." />
      ) : (
        <>
          {o && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={Flag} label="Report rate" value={pct(o.report_rate)}
                colorClass="border-emerald-500" textClass="text-emerald-400" />
              <StatCard icon={MousePointerClick} label="Click rate" value={pct(o.click_rate)}
                colorClass="border-amber-500" textClass="text-amber-400" />
              <StatCard icon={Inbox} label="Kampanye" value={o.campaigns}
                colorClass="border-primary" textClass="text-primary" />
              <StatCard icon={Inbox} label="Total penerima" value={o.recipients}
                colorClass="border-primary" textClass="text-primary" />
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <SectionCard title="Tren per kampanye (lama → baru)" icon={TrendingUp}>
                {loading ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/3 animate-pulse" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {campaigns.map((c) => <CampaignBar key={c.id} c={c} />)}
                  </div>
                )}
              </SectionCard>
            </div>

            <div>
              <SectionCard title="Pelanggar berulang" icon={AlertTriangle}>
                <p className="text-[11px] text-muted-foreground font-mono mb-3 leading-relaxed">
                  Orang yang klik/submit di <strong>lebih dari satu</strong> kampanye — target utama remediasi.
                </p>
                {offenders.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground font-mono">Tidak ada — bagus. 🎯</p>
                ) : (
                  <div className="space-y-2">
                    {offenders.map((r, i) => (
                      <div key={r.email} className="flex items-center gap-3 p-2 border border-white/5">
                        <span className="text-xs font-mono font-bold text-muted-foreground w-4">{i + 1}</span>
                        <span className="text-xs font-mono truncate flex-1 min-w-0">{r.email}</span>
                        <span className="text-[11px] font-mono font-bold text-red-400 flex-shrink-0">
                          {r.count}× gagal
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
