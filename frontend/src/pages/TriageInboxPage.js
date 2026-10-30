import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Inbox, Flag, ShieldCheck, Mail, AlertTriangle, CheckCircle2, XCircle, Clock, MessageCircle, Smartphone,
} from 'lucide-react';
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

const CHAT_CHANNELS = ['whatsapp', 'sms'];
const CHANNEL_ICON = { email_inbox: Mail, whatsapp: MessageCircle, sms: Smartphone };

// A chat message rendered the way it arrives on a phone: contact header, one
// incoming bubble. Same item, same grading — only the presentation differs.
function ChatPane({ item, t }) {
  const initial = (item.from || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="flex-1 flex flex-col rounded-md overflow-hidden border border-border">
      <div className="flex items-center gap-3 px-3 py-2" style={{ background: '#1f2c33' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: '#2a3942', color: '#d1d7db' }}>{initial}</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: '#e9edef' }}>{item.from}</div>
          <div className="text-[10px]" style={{ color: '#8696a0' }}>
            {item.channel === 'sms' ? t('triage.channel.sms') : t('triage.channel.whatsapp')}
          </div>
        </div>
      </div>
      <div className="flex-1 p-4" style={{ background: '#0b141a' }}>
        <div className="max-w-[85%] rounded-lg rounded-tl-none px-3 py-2 text-sm whitespace-pre-wrap"
          style={{ background: '#202c33', color: '#e9edef' }}>
          {item.body}
        </div>
      </div>
    </div>
  );
}

export default function TriageInboxPage() {
  const { t, i18n } = useTranslation();
  const [sets, setSets] = useState([]);
  const [set, setSet] = useState(null);
  const [marks, setMarks] = useState({});
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  const openSet = useCallback(async (id) => {
    try {
      const full = (await api.get(`/triage/${id}`)).data;
      setSet(full);
      setMarks({});
      setResults(null);
      setElapsed(0);
      setSelected(full.items[0]?.id || null);
      startRef.current = Date.now();
    } catch { toast.error(t('triage.load_failed')); }
  }, [t]);

  const load = useCallback(async () => {
    try {
      const list = (await api.get('/triage')).data;
      if (!list.length) return;
      setSets(list);
      // Prefer a set in the UI language; sets without a language are English.
      const lang = (i18n.language || 'en').slice(0, 2);
      const pick = list.find((x) => (x.language || 'en') === lang) || list[0];
      await openSet(pick.id);
    } catch { toast.error(t('triage.load_failed')); }
  }, [i18n.language, t, openSet]);
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
        <Button onClick={() => openSet(set.id)}>{t('triage.run_again')}</Button>
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
        <div className="flex items-center gap-3">
          {sets.length > 1 && (
            <select aria-label={t('triage.choose_set')} value={set.id}
              onChange={(e) => openSet(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs font-mono">
              {sets.map((x) => (
                <option key={x.id} value={x.id}>{x.title} · {x.item_count}</option>
              ))}
            </select>
          )}
          <span className="text-sm font-mono text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" /> {elapsed}s</span>
        </div>
      </PageHeader>

      <div className="grid md:grid-cols-5 gap-4">
        {/* Inbox list */}
        <Card className="md:col-span-2 p-2 max-h-[65vh] overflow-auto">
          {set.items.map((it) => {
            const ChannelIcon = CHANNEL_ICON[it.channel] || Mail;
            return (
            <button key={it.id} onClick={() => setSelected(it.id)}
              className={`w-full text-left p-3 rounded-md border-b border-border/50 hover:bg-muted/40 ${selected === it.id ? 'bg-muted/50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <ChannelIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="font-medium text-sm truncate flex-1">{it.subject}</span>
                {marks[it.id] === 'flag' && <Flag className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                {marks[it.id] === 'leave' && <ShieldCheck className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />}
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate pl-5">{it.from}</div>
            </button>
            );
          })}
        </Card>

        {/* Reading pane */}
        <Card className="md:col-span-3 p-5 flex flex-col">
          {current ? (
            <>
              {CHAT_CHANNELS.includes(current.channel) ? <ChatPane item={current} t={t} /> : (
                <>
                  <div className="border-b border-border pb-3 mb-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Mail className="w-4 h-4" /> {current.from}</div>
                    <h2 className="text-lg font-bold mt-1">{current.subject}</h2>
                  </div>
                  <p className="text-sm whitespace-pre-wrap flex-1">{current.body}</p>
                </>
              )}
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
