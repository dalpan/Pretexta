import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Inbox, Flag, ShieldCheck, Mail, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/PageHeader';
import api from '../services/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

function Metric({ label, value, hint }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</div>}
    </div>
  );
}

export default function TriageInboxPage() {
  const { t, i18n } = useTranslation();
  const [set, setSet] = useState(null);
  const [marks, setMarks] = useState({});
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  const load = useCallback(async () => {
    try {
      const list = (await api.get('/triage')).data;
      if (!list.length) return;
      // Prefer the set in the UI language; sets without a language are English.
      const lang = (i18n.language || 'en').slice(0, 2);
      const pick = list.find((x) => (x.language || 'en') === lang) || list[0];
      const full = (await api.get(`/triage/${pick.id}`)).data;
      setSet(full);
      setSelected(full.items[0]?.id || null);
      startRef.current = Date.now();
    } catch { toast.error(t('triage.load_failed')); }
  }, [i18n.language, t]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!set || results) return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [set, results]);

  const mark = (id, v) => setMarks((p) => ({ ...p, [id]: v }));

  const submit = async () => {
    try {
      const res = await api.post(`/triage/${set.id}/submit`, {
        marks, duration_seconds: Math.round((Date.now() - startRef.current) / 1000),
      });
      setResults(res.data);
    } catch { toast.error(t('triage.submit_failed')); }
  };

  if (!set) {
    return <div className="max-w-5xl mx-auto p-4"><PageHeader icon={Inbox} title={t('nav.triage')} /><p className="text-muted-foreground">{t('triage.none')}</p></div>;
  }

  // ── Results screen ──
  if (results) {
    const m = results.metrics;
    const byId = Object.fromEntries(results.results.map((r) => [r.id, r]));
    return (
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <PageHeader icon={Inbox} title={t('triage.results_title')}
          description={t('triage.results_desc')} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label={t('triage.score')} value={`${results.score}`} />
          <Metric label={t('triage.d_prime')} value={m.d_prime} hint={t('triage.d_prime_hint')} />
          <Metric label={t('triage.caught')} value={`${m.hits}/${m.pretexts}`} hint={t('triage.caught_hint')} />
          <Metric label={t('triage.false_alarms')} value={m.false_alarms} hint={t('triage.false_alarms_hint')} />
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Clock className="w-4 h-4" /> {t('triage.criterion', { seconds: m.duration_seconds, value: m.criterion, bias: m.criterion > 0 ? t('triage.bias_caution') : t('triage.bias_trust') })}
        </p>
        <div className="space-y-2">
          {set.items.map((it) => {
            const r = byId[it.id] || {};
            const ok = r.outcome === 'hit' || r.outcome === 'correct_rejection';
            return (
              <Card key={it.id} className={`p-4 ${ok ? 'border-tertiary/30' : 'border-destructive/40'}`}>
                <div className="flex items-start gap-3">
                  {ok ? <CheckCircle2 className="w-5 h-5 text-tertiary mt-0.5" /> : <XCircle className="w-5 h-5 text-destructive mt-0.5" />}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{it.subject}</span>
                      <Badge variant="outline" className="text-[10px]">{t(`triage.outcome.${r.outcome}`, { defaultValue: r.outcome })}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{it.from}</div>
                    {r.is_pretext && r.explanation && (
                      <p className="text-xs mt-2 text-muted-foreground"><span className="text-destructive font-semibold">{t('triage.pretext', { principle: t(`principles.${r.principle}`, { defaultValue: r.principle }) })}</span> {r.explanation}</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <Button onClick={() => window.location.reload()}>{t('triage.run_again')}</Button>
      </div>
    );
  }

  // ── Triage screen ──
  const current = set.items.find((i) => i.id === selected);
  const decided = Object.keys(marks).length;
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <PageHeader icon={Inbox} title={set.title}
        description={t('triage.instructions')}>
        <span className="text-sm font-mono text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" /> {elapsed}s</span>
      </PageHeader>

      <div className="grid md:grid-cols-5 gap-4">
        {/* Inbox list */}
        <Card className="md:col-span-2 p-2 max-h-[65vh] overflow-auto">
          {set.items.map((it) => (
            <button key={it.id} onClick={() => setSelected(it.id)}
              className={`w-full text-left p-3 rounded-md border-b border-border/50 hover:bg-muted/40 ${selected === it.id ? 'bg-muted/50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{it.subject}</span>
                {marks[it.id] === 'flag' && <Flag className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                {marks[it.id] === 'leave' && <ShieldCheck className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />}
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate">{it.from}</div>
            </button>
          ))}
        </Card>

        {/* Reading pane */}
        <Card className="md:col-span-3 p-5 flex flex-col">
          {current ? (
            <>
              <div className="border-b border-border pb-3 mb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Mail className="w-4 h-4" /> {current.from}</div>
                <h2 className="text-lg font-bold mt-1">{current.subject}</h2>
              </div>
              <p className="text-sm whitespace-pre-wrap flex-1">{current.body}</p>
              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <Button variant={marks[current.id] === 'flag' ? 'destructive' : 'outline'} onClick={() => mark(current.id, 'flag')}>
                  <Flag className="w-4 h-4 mr-2" /> {t('triage.report')}
                </Button>
                <Button variant={marks[current.id] === 'leave' ? 'default' : 'outline'} onClick={() => mark(current.id, 'leave')}>
                  <ShieldCheck className="w-4 h-4 mr-2" /> {t('triage.legit')}
                </Button>
              </div>
            </>
          ) : <p className="text-muted-foreground">{t('triage.select')}</p>}
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {t('triage.progress', { done: decided, total: set.items.length })}
        </span>
        <Button onClick={submit} disabled={decided === 0}>{t('triage.submit')}</Button>
      </div>
    </div>
  );
}
