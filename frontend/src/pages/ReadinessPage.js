import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck, Flag, MousePointerClick, ArrowRight, TrendingUp, TrendingDown, Repeat,
  GraduationCap, CheckCircle2, Crosshair, Inbox, Activity, Radio, Share2, Info,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import { Button } from '../components/ui/button';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { useApi } from '../hooks/useApi';

// Same palette as the Attack Surface Map so the two screens read as one system.
const GOOD = '#6f8f3f';
const WARN = '#d39a22';
const BAD = '#c0453f';
const ACCENT = '#e0b84a';
const POSTURE_COLOR = {
  SECURE: '#6f8f3f', GUARDED: '#9fae3a', ELEVATED: '#d39a22', HIGH: '#d9772a', SEVERE: '#c0453f',
};
const TICK = { fill: 'rgba(234,234,230,0.55)', fontSize: 10, fontFamily: 'monospace' };
const TOOLTIP = {
  background: '#151812', border: '1px solid rgba(143,159,94,0.3)', fontSize: 11, fontFamily: 'monospace',
};

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function band(score) {
  if (score == null) return { key: 'none', color: 'rgba(234,234,230,0.35)' };
  if (score >= 80) return { key: 'strong', color: GOOD };
  if (score >= 60) return { key: 'alert', color: '#9fae3a' };
  if (score >= 40) return { key: 'vulnerable', color: WARN };
  return { key: 'critical', color: BAD };
}

// Half-circle gauge, 0–100.
function Gauge({ score }) {
  const { color } = band(score);
  const r = 80;
  const len = Math.PI * r;
  const filled = score == null ? 0 : (len * score) / 100;
  return (
    <svg viewBox="0 0 200 116" className="w-full max-w-[260px]">
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(234,234,230,0.08)"
        strokeWidth="14" strokeLinecap="round" />
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="14"
        strokeLinecap="round" strokeDasharray={`${filled} ${len}`}
        style={{ transition: 'stroke-dasharray 900ms ease' }} />
      <text x="100" y="92" textAnchor="middle" fontSize="42" fontWeight="700" fill={color}
        fontFamily="Oswald, monospace">
        {score == null ? '—' : score}
      </text>
      <text x="100" y="112" textAnchor="middle" fontSize="9" fill="rgba(234,234,230,0.5)"
        fontFamily="monospace" letterSpacing="2">/ 100</text>
    </svg>
  );
}

function IndexCard({ index, t }) {
  const b = band(index.score);
  return (
    <SectionCard title={t('readiness.index')} icon={ShieldCheck} className="lg:col-span-1">
      <div className="flex flex-col items-center">
        <Gauge score={index.score} />
        <span className="mt-1 text-xs font-mono uppercase tracking-[0.25em]" style={{ color: b.color }}>
          {t(`readiness.band.${b.key}`)}
        </span>
      </div>
      {/* The formula is shown, not hidden: every part of the number is inspectable. */}
      <div className="space-y-2 pt-2">
        {Object.entries(index.components).map(([key, value]) => (
          <div key={key}>
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>{t(`readiness.component.${key}`)} · {Math.round(index.weights[key] * 100)}%</span>
              <span>{value == null ? t('readiness.no_data') : value}</span>
            </div>
            <div className="h-1.5 bg-white/5 mt-0.5">
              <div className="h-full" style={{
                width: `${value ?? 0}%`, background: value == null ? 'transparent' : band(value).color,
              }} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ReportCard({ live, t }) {
  const delta = live.report_rate_delta;
  const Trend = delta != null && delta < 0 ? TrendingDown : TrendingUp;
  const trend = live.trend.map((c) => ({
    name: c.name,
    report: c.report_rate == null ? null : Math.round(c.report_rate * 100),
    click: c.click_rate == null ? null : Math.round(c.click_rate * 100),
  }));
  return (
    <SectionCard title={t('readiness.report_title')} icon={Flag} className="lg:col-span-2"
      actions={<Link to="/live/analytics" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary">
        {t('dashboard.view_all')}</Link>}>
      <div className="grid sm:grid-cols-3 gap-4 items-center">
        <div>
          <div className="text-5xl font-bold" style={{ color: GOOD, fontFamily: 'Oswald, monospace' }}>
            {pct(live.latest_report_rate)}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">
            {t('readiness.latest_campaign')}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            {t('readiness.reported_of', {
              rate: pct(live.report_rate), reported: live.reported, total: live.recipients, campaigns: live.campaigns,
            })}
          </div>
          {delta != null && (
            <div className="flex items-center gap-1 mt-2 text-xs font-mono"
              style={{ color: delta >= 0 ? GOOD : BAD }}>
              <Trend className="w-3.5 h-3.5" />
              {delta >= 0 ? '+' : ''}{Math.round(delta * 100)} {t('readiness.points_since_first')}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-3 text-[10px] font-mono text-muted-foreground">
            <MousePointerClick className="w-3 h-3" style={{ color: WARN }} />
            {t('readiness.click_rate')}: <span style={{ color: WARN }}>{pct(live.latest_click_rate)}</span>
          </div>
        </div>
        <div className="sm:col-span-2 h-40">
          {trend.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={false} axisLine={{ stroke: 'rgba(234,234,230,0.1)' }} />
                <YAxis domain={[0, 100]} tick={TICK} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v, k) => [`${v}%`, t(`readiness.series.${k}`)]} />
                <Line type="monotone" dataKey="report" stroke={GOOD} strokeWidth={2.5} dot={{ r: 3, fill: GOOD }} />
                <Line type="monotone" dataKey="click" stroke={WARN} strokeWidth={1.5} strokeDasharray="4 3"
                  dot={{ r: 2, fill: WARN }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-mono text-muted-foreground border border-dashed border-white/10">
              {t('readiness.trend_needs_two')}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function LoopCard({ live, loop, t }) {
  const steps = [
    { key: 'failed', value: live.clicked, icon: MousePointerClick, color: BAD },
    { key: 'assigned', value: loop.remediation_assigned, icon: GraduationCap, color: WARN },
    { key: 'passed', value: loop.remediation_passed, icon: CheckCircle2, color: '#9fae3a' },
    { key: 'retested', value: loop.retest_passed, icon: Repeat, color: GOOD },
  ];
  return (
    <SectionCard title={t('readiness.loop_title')} icon={Repeat}>
      <p className="text-[11px] text-muted-foreground -mt-1">{t('readiness.loop_desc')}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-0 items-stretch">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex items-center">
              <div className="flex-1 p-3 border text-center" style={{ borderColor: `${s.color}55`, background: `${s.color}0d` }}>
                <Icon className="w-4 h-4 mx-auto" style={{ color: s.color }} />
                <div className="text-3xl font-bold mt-1" style={{ color: s.color, fontFamily: 'Oswald, monospace' }}>
                  {s.value}
                </div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {t(`readiness.step.${s.key}`)}
                </div>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="hidden md:block w-4 h-4 mx-1.5 text-muted-foreground/50 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function PrinciplesCard({ principles, weakest, t }) {
  const data = Object.entries(principles).map(([key, value]) => ({
    key, label: t(`principles.${key}`, { defaultValue: key }), value: value ?? 0,
  }));
  const hasData = Object.values(principles).some((v) => v != null);
  return (
    <SectionCard title={t('readiness.principles_title')} icon={Crosshair}>
      {hasData ? (
        <>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} outerRadius="72%">
                <PolarGrid stroke="rgba(234,234,230,0.12)" />
                <PolarAngleAxis dataKey="label" tick={TICK} />
                <Radar dataKey="value" stroke={ACCENT} fill={ACCENT} fillOpacity={0.25} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`${v}/100`, t('readiness.resistance')]} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {weakest.length > 0 && (
            <p className="text-xs font-mono">
              <span className="text-muted-foreground">{t('readiness.weakest')}: </span>
              {weakest.map((p) => (
                <span key={p} className="mr-2" style={{ color: BAD }}>
                  {t(`principles.${p}`, { defaultValue: p })} ({principles[p]})
                </span>
              ))}
            </p>
          )}
        </>
      ) : <p className="text-xs font-mono text-muted-foreground">{t('readiness.no_data')}</p>}
    </SectionCard>
  );
}

function SurfaceCard({ surface, t }) {
  if (!surface) {
    return (
      <SectionCard title={t('readiness.surface_title')} icon={Share2}>
        <p className="text-xs text-muted-foreground">{t('readiness.surface_empty')}</p>
        <Link to="/attack-surface"><Button size="sm" variant="outline">{t('readiness.open_map')}</Button></Link>
      </SectionCard>
    );
  }
  const color = POSTURE_COLOR[surface.posture?.label] || WARN;
  return (
    <SectionCard title={t('readiness.surface_title')} icon={Share2}>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold" style={{ color, fontFamily: 'Oswald, monospace' }}>
          {surface.posture?.label}
        </span>
        <span className="text-xs font-mono text-muted-foreground">
          DEFCON {surface.posture?.condition} · {t('readiness.score')} {surface.posture?.score}
        </span>
      </div>
      {surface.top_path && (
        <p className="text-xs">
          {t('readiness.top_path', { asset: surface.top_path.asset, probability: pct(surface.top_path.probability) })}
        </p>
      )}
      <Link to="/attack-surface">
        <Button size="sm" variant="outline" className="text-[10px] uppercase tracking-widest">
          {t('readiness.open_map')} <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </Link>
    </SectionCard>
  );
}

function LabCard({ lab, t }) {
  return (
    <SectionCard title={t('readiness.lab_title')} icon={Inbox}>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [lab.avg_d_prime ?? '—', t('readiness.d_prime')],
          [lab.avg_triage_score ?? '—', t('readiness.triage_score')],
          [lab.triage_runs, t('readiness.triage_runs')],
        ].map(([value, label]) => (
          <div key={label} className="p-2 bg-white/[0.03]">
            <div className="text-2xl font-bold" style={{ fontFamily: 'Oswald, monospace' }}>{value}</div>
            <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">{t('readiness.d_prime_hint')}</p>
    </SectionCard>
  );
}

function FeedCard({ recent, t }) {
  return (
    <SectionCard title={t('readiness.feed_title')} icon={Activity}>
      {recent.length === 0 ? (
        <p className="text-xs font-mono text-muted-foreground">{t('readiness.feed_empty')}</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              {r.source === 'retest'
                ? <Repeat className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: GOOD }} />
                : <GraduationCap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: WARN }} />}
              <span className="flex-1">
                {t(`readiness.feed.${r.source}_${r.status === 'completed' ? 'done' : 'open'}`,
                  { principle: t(`principles.${r.principle}`, { defaultValue: r.principle }) })}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
                {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
        <Info className="w-3 h-3" /> {t('readiness.feed_privacy')}
      </p>
    </SectionCard>
  );
}

export default function ReadinessPage() {
  const { t } = useTranslation();
  const { data, loading } = useApi('/readiness');

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <PageHeader icon={ShieldCheck} title={t('readiness.title')} description={t('readiness.desc')}>
        <Link to="/live">
          <Button size="sm" className="text-xs uppercase tracking-widest">
            <Radio className="w-3.5 h-3.5 mr-2" /> {t('nav.live_campaigns')}
          </Button>
        </Link>
      </PageHeader>

      {loading || !data ? (
        <div className="grid lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <div key={i} className="h-64 glass-panel animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-6">
            <IndexCard index={data.index} t={t} />
            <ReportCard live={data.live} t={t} />
          </div>
          <LoopCard live={data.live} loop={data.loop} t={t} />
          <div className="grid lg:grid-cols-3 gap-6">
            <PrinciplesCard principles={data.principles} weakest={data.weakest_principles} t={t} />
            <div className="space-y-6">
              <SurfaceCard surface={data.attack_surface} t={t} />
              <LabCard lab={data.lab} t={t} />
            </div>
            <FeedCard recent={data.loop.recent} t={t} />
          </div>
          <p className="text-[10px] font-mono text-muted-foreground/60">
            {t('readiness.cohort_note', { people: data.people })}
          </p>
        </>
      )}
    </div>
  );
}
