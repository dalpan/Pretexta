import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Radio, Plus, ShieldCheck, Send, Play, Octagon, CheckCircle2, XCircle,
  AlertTriangle, Info, RefreshCw, Globe, Inbox, MousePointerClick, Flag,
  MessageSquare, Clock, Trash2, ShieldOff, X, Repeat, Calendar, PlayCircle, PauseCircle, QrCode,
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import api from '../services/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// A click campaign measures behaviour (who clicks, who reports). The reply-based
// objectives drive the optional AI-conversation engine — an advanced layer.
const AI_OBJECTIVES = ['reply', 'agree_to_share_otp', 'agree_to_approve_payment', 'agree_to_install_tool'];
const isAiObjective = (o) => AI_OBJECTIVES.includes(o);
// GoPhish's per-recipient tracked link. Passed into i18n strings as a variable,
// since i18next would otherwise read {{.URL}} as its own placeholder.
const URL_TOKEN = '{{.URL}}';
const PRINCIPLES = ['reciprocity', 'scarcity', 'authority', 'commitment', 'liking', 'social_proof'];

const STATUS_STYLE = {
  draft: 'bg-slate-500', pending_approval: 'bg-amber-500', approved: 'bg-blue-500',
  launching: 'bg-blue-400', running: 'bg-emerald-500', closed: 'bg-slate-600', killed: 'bg-red-600',
};

const LEVEL_STYLE = {
  error: { icon: XCircle, cls: 'text-red-500' },
  warning: { icon: AlertTriangle, cls: 'text-amber-500' },
  info: { icon: Info, cls: 'text-blue-400' },
};

function StatusBadge({ status }) {
  const { t } = useTranslation();
  return (
    <Badge className={`${STATUS_STYLE[status] || 'bg-slate-500'} text-white`}>
      {t(`status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

const TONE = {
  default: 'text-foreground', amber: 'text-amber-400', emerald: 'text-emerald-400',
};
function Metric({ label, value, sub, icon: Icon, tone = 'default' }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {Icon && <Icon className="w-3 h-3" />}
        <span className="text-[10px] uppercase tracking-widest font-mono">{label}</span>
      </div>
      <div className={`text-xl font-bold ${TONE[tone]}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Preflight({ findings }) {
  const { t } = useTranslation();
  if (!findings?.length) {
    return (
      <p className="text-emerald-500 text-sm flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4" /> {t('live.preflight_ok')}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => {
        const s = LEVEL_STYLE[f.level] || LEVEL_STYLE.info;
        const Icon = s.icon;
        return (
          <li key={i} className={`text-sm flex items-start gap-2 ${s.cls}`}>
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span><span className="font-mono text-xs opacity-70">[{f.rule}]</span> {f.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

function DomainsCard() {
  const { t } = useTranslation();
  const [domains, setDomains] = useState([]);
  const [name, setName] = useState('');
  const load = useCallback(async () => {
    try { setDomains((await api.get('/live/domains')).data); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    try {
      const res = await api.post('/live/domains', { domain: name.trim() });
      if (res.data.instructions) toast.info(res.data.instructions, { duration: 12000 });
      else toast.success(t('live.domains.sandbox_ok'));
      setName(''); load();
    } catch (e) { toast.error(e.response?.data?.detail || t('live.failed')); }
  };
  const verify = async (id) => {
    const res = await api.post(`/live/domains/${id}/verify`);
    toast[res.data.verified ? 'success' : 'error'](res.data.verified ? t('live.domains.verified_toast') : t('live.domains.txt_missing'));
    load();
  };

  return (
    <Card className="p-5 space-y-3">
      <h3 className="font-bold flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /> {t('live.domains.title')}</h3>
      <p className="text-xs text-muted-foreground">{t('live.domains.help')}</p>
      <div className="flex gap-2">
        <Input placeholder="acme.test" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={add} size="sm"><Plus className="w-4 h-4" /></Button>
      </div>
      <div className="space-y-1">
        {domains.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-sm border-b border-border py-1.5">
            <span className="font-mono">{d.domain}</span>
            <div className="flex items-center gap-2">
              {d.verified_at
                ? <Badge className="bg-emerald-500 text-white">{t('live.domains.verified')}</Badge>
                : <Badge className="bg-amber-500 text-white">{t('live.domains.pending')}</Badge>}
              {!d.sandbox && !d.verified_at && (
                <Button size="sm" variant="outline" onClick={() => verify(d.id)}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ExclusionsCard() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [emails, setEmails] = useState('');
  const load = useCallback(async () => {
    try { setRows((await api.get('/live/exclusions')).data); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const list = emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!list.length) return;
    try {
      const res = await api.post('/live/exclusions', { emails: list, reason: 'Added from UI' });
      toast.success(t('live.exclusions.added', { count: res.data.added }));
      setEmails(''); load();
    } catch (e) { toast.error(e.response?.data?.detail || t('live.failed')); }
  };
  const remove = async (email) => {
    try { await api.delete(`/live/exclusions/${encodeURIComponent(email)}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || t('live.failed')); }
  };

  return (
    <Card className="p-5 space-y-3">
      <h3 className="font-bold flex items-center gap-2"><ShieldOff className="w-5 h-5 text-amber-400" /> {t('live.exclusions.title')}</h3>
      <p className="text-xs text-muted-foreground">{t('live.exclusions.help')}</p>
      <div className="flex gap-2">
        <Input placeholder="ceo@acme.test" value={emails} onChange={(e) => setEmails(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button onClick={add} size="sm"><Plus className="w-4 h-4" /></Button>
      </div>
      <div className="space-y-1 max-h-40 overflow-auto">
        {rows.length === 0
          ? <p className="text-xs text-muted-foreground font-mono">{t('live.exclusions.empty')}</p>
          : rows.map((r) => (
            <div key={r.email} className="flex items-center justify-between text-sm border-b border-border py-1.5">
              <span className="font-mono">{r.email}</span>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => remove(r.email)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
      </div>
    </Card>
  );
}

const SchedulesCard = React.forwardRef(function SchedulesCard(_props, ref) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    try { setRows((await api.get('/live/schedules')).data); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  React.useImperativeHandle(ref, () => ({ reload: load }), [load]);

  const runNow = async (id) => {
    try { await api.post(`/live/schedules/${id}/run-now`); toast.success(t('live.schedules.run_ok')); load(); }
    catch (e) { toast.error(e.response?.data?.detail || t('live.failed')); }
  };
  const toggle = async (s) => { await api.patch(`/live/schedules/${s.id}`, { active: !s.active }); load(); };
  const remove = async (id) => {
    if (!window.confirm(t('live.schedules.confirm_delete'))) return;
    await api.delete(`/live/schedules/${id}`); load();
  };

  if (rows.length === 0) return null;
  return (
    <Card className="p-5 space-y-3">
      <h3 className="font-bold flex items-center gap-2"><Repeat className="w-5 h-5 text-primary" /> {t('live.schedules.title')}</h3>
      <div className="space-y-2">
        {rows.map((s) => (
          <div key={s.id} className="p-2.5 border border-white/5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-bold truncate">{s.name}</span>
              <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border flex-shrink-0 ${
                s.active ? 'text-emerald-400 border-emerald-400/40' : 'text-muted-foreground border-white/10'}`}>
                {s.active ? t('live.schedules.active') : t('live.schedules.paused')}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {t('live.schedules.cadence', { every: s.interval_days, window: s.window_days })}
              {s.next_run && <> · {t('live.schedules.next', { date: new Date(s.next_run).toLocaleDateString() })}</>}
            </p>
            <div className="flex gap-1.5 mt-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[10px] uppercase tracking-widest" onClick={() => runNow(s.id)}>
                <PlayCircle className="w-3 h-3 mr-1" /> {t('live.schedules.run')}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px] uppercase tracking-widest" onClick={() => toggle(s)}>
                {s.active ? <><PauseCircle className="w-3 h-3 mr-1" /> {t('live.schedules.pause')}</> : <><PlayCircle className="w-3 h-3 mr-1" /> {t('live.schedules.resume')}</>}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 ml-auto" onClick={() => remove(s.id)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
});

const BLANK = {
  name: '', objective: 'click_link', principles: ['authority'],
  sender_name: 'IT Helpdesk', sender_email: 'helpdesk@acme.test',
  subject: '', body_html: '',
  recipients: '', starts_at: '', ends_at: '', max_turns: 0, use_qr: false,
};

// <input type="datetime-local"> wants local time without a zone: "YYYY-MM-DDTHH:mm".
function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultWindow() {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return { starts_at: toLocalInput(start), ends_at: toLocalInput(end) };
}

const escapeHtml = (text) => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Plain-text editor → email HTML. Blank lines split paragraphs; {{.URL}} becomes the
// tracked link with a readable label, so authors never have to write HTML.
function textToHtml(text, linkText) {
  const link = `<a href="{{.URL}}">${escapeHtml(linkText || '{{.URL}}')}</a>`;
  return text.trim().split(/\n\s*\n/).map((para) =>
    `<p>${escapeHtml(para).split('{{.URL}}').join(link).replace(/\n/g, '<br>')}</p>`).join('');
}

function CreateForm({ onClose, onCreated, onScheduled, initial }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ ...BLANK, ...defaultWindow(), ...(initial || {}) });
  const [htmlMode, setHtmlMode] = useState(!!initial?.body_html);
  const [bodyText, setBodyText] = useState(t('live.form.body_default', { token: URL_TOKEN }));
  const [linkText, setLinkText] = useState(t('live.form.link_default'));
  const bodyHtml = htmlMode ? f.body_html : textToHtml(bodyText, linkText);
  const [templates, setTemplates] = useState([]);
  const [aiMode, setAiMode] = useState(false); // click campaign by default
  const [recurring, setRecurring] = useState(false);
  const [sched, setSched] = useState({ interval_days: 30, window_days: 5 });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const togglePrinciple = (p) =>
    set('principles', f.principles.includes(p) ? f.principles.filter((x) => x !== p) : [...f.principles, p]);

  // Switching mode keeps the two worlds clean: a click campaign has no AI turns.
  const chooseClick = () => { setAiMode(false); setF((p) => ({ ...p, objective: 'click_link', max_turns: 0 })); };
  const chooseAi = () => {
    setAiMode(true);
    setF((p) => ({ ...p, objective: isAiObjective(p.objective) ? p.objective : 'reply', max_turns: p.max_turns || 3 }));
  };

  useEffect(() => {
    api.get('/live/templates').then((r) => setTemplates(r.data)).catch(() => {});
  }, []);

  const applyTemplate = (id) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setAiMode(isAiObjective(tpl.objective));
    setHtmlMode(true); // templates ship as HTML; edit them as-is
    setF((p) => ({
      ...p,
      name: p.name || tpl.name,
      objective: tpl.objective,
      max_turns: isAiObjective(tpl.objective) ? (p.max_turns || 3) : 0,
      principles: tpl.principles,
      sender_name: tpl.sender_name,
      subject: tpl.subject,
      body_html: tpl.body_html,
    }));
  };

  const submit = async () => {
    const recipients = f.recipients.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!bodyHtml.includes('{{.URL}}')) {
      toast.error(t('live.form.err_no_url', { token: URL_TOKEN }));
      return;
    }
    if (!recurring && !(new Date(f.ends_at) > new Date(f.starts_at))) {
      toast.error(t('live.form.err_window'));
      return;
    }
    try {
      if (recurring) {
        // Build the schedule template — only the content fields (no time window).
        const template = {
          name: f.name, objective: f.objective, principles: f.principles,
          sender_name: f.sender_name, sender_email: f.sender_email,
          subject: f.subject, body_html: bodyHtml, recipients,
          max_turns: Number(f.max_turns), language: f.language || 'en',
          use_qr: !!f.use_qr,
        };
        await api.post('/live/schedules', {
          name: f.name || t('live.form.schedule_default_name'),
          interval_days: Number(sched.interval_days),
          window_days: Number(sched.window_days),
          start_in_days: 0,
          template,
        });
        toast.success(t('live.form.schedule_ok'));
        onScheduled?.();
        onClose?.();
        return;
      }
      const res = await api.post('/live/campaigns', {
        ...f, body_html: bodyHtml, max_turns: Number(f.max_turns), recipients,
        starts_at: new Date(f.starts_at).toISOString(),
        ends_at: new Date(f.ends_at).toISOString(),
      });
      toast.success(t('live.form.draft_ok'));
      onCreated(res.data.id);
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : t('live.form.create_failed'));
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{t('live.form.title')}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}><XCircle className="w-4 h-4" /></Button>
      </div>
      {templates.length > 0 && (
        <div>
          <Label>{t('live.form.template')}</Label>
          <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">{t('live.form.template_none')}</option>
            {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name} · {tpl.category}</option>)}
          </select>
        </div>
      )}
      {/* Campaign type: click is the primary, measurable flow; AI is advanced. */}
      <div>
        <Label>{t('live.form.type')}</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button type="button" onClick={chooseClick}
            className={`flex items-start gap-2 p-3 rounded-md border text-left transition-all ${
              !aiMode ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
            <MousePointerClick className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
            <span>
              <span className="block text-sm font-semibold">{t('live.type_click')}</span>
              <span className="block text-[11px] text-muted-foreground">{t('live.form.type_click_help')}</span>
            </span>
          </button>
          <button type="button" onClick={chooseAi}
            className={`flex items-start gap-2 p-3 rounded-md border text-left transition-all ${
              aiMode ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/40'}`}>
            <MessageSquare className="w-4 h-4 mt-0.5 text-accent flex-shrink-0" />
            <span>
              <span className="block text-sm font-semibold">{t('live.type_ai')} <span className="text-[10px] uppercase tracking-wide text-accent">{t('live.advanced')}</span></span>
              <span className="block text-[11px] text-muted-foreground">{t('live.form.type_ai_help')}</span>
            </span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div><Label>{t('live.form.name')}</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div><Label>{t('live.form.sender_name')}</Label><Input value={f.sender_name} onChange={(e) => set('sender_name', e.target.value)} /></div>
        <div><Label>{t('live.form.sender_email')}</Label><Input value={f.sender_email} onChange={(e) => set('sender_email', e.target.value)} /></div>
        <div className="hidden md:block" />
        {!recurring && <>
          <div><Label>{t('live.form.starts')}</Label><Input type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></div>
          <div><Label>{t('live.form.ends')}</Label><Input type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></div>
        </>}
      </div>

      {/* Quishing: deliver the lure as a QR code encoding the tracked URL. */}
      <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border p-3">
        <input type="checkbox" checked={!!f.use_qr} onChange={(e) => set('use_qr', e.target.checked)} className="accent-primary" />
        <QrCode className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">{t('live.form.qr')}</span>
        <span className="text-[10px] text-muted-foreground">{t('live.form.qr_help')}</span>
      </label>

      {/* Recurring schedule: each cycle materialises a campaign for approval (G2). */}
      <div className="rounded-md border border-primary/20 bg-primary/3 p-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="accent-primary" />
          <Repeat className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{t('live.form.recurring')}</span>
          <span className="text-[10px] text-muted-foreground">{t('live.form.recurring_help')}</span>
        </label>
        {recurring && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div><Label>{t('live.form.every_days')}</Label><Input type="number" min="1" max="365"
              value={sched.interval_days} onChange={(e) => setSched((p) => ({ ...p, interval_days: e.target.value }))} /></div>
            <div><Label>{t('live.form.window_days')}</Label><Input type="number" min="1" max="30"
              value={sched.window_days} onChange={(e) => setSched((p) => ({ ...p, window_days: e.target.value }))} /></div>
          </div>
        )}
      </div>

      {/* Advanced AI settings only when the AI mode is chosen. */}
      {aiMode && (
        <div className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-accent">
            <MessageSquare className="w-4 h-4" /> {t('live.form.ai_settings')}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>{t('live.form.objective')}</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={f.objective} onChange={(e) => set('objective', e.target.value)}>
                {AI_OBJECTIVES.map((o) => <option key={o} value={o}>{t(`live.objective.${o}`)}</option>)}
              </select>
            </div>
            <div><Label>{t('live.form.max_turns')}</Label><Input type="number" min="1" max="6" value={f.max_turns} onChange={(e) => set('max_turns', e.target.value)} /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('live.form.ai_review_note')}
          </p>
        </div>
      )}

      <div>
        <Label>{t('live.form.principles')}</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {PRINCIPLES.map((p) => (
            <button key={p} onClick={() => togglePrinciple(p)}
              className={`px-2.5 py-1 rounded-full text-xs border ${f.principles.includes(p) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}>
              {t(`principles.${p}`, { defaultValue: p })}
            </button>
          ))}
        </div>
      </div>
      <div><Label>{t('live.form.subject')}</Label><Input value={f.subject} onChange={(e) => set('subject', e.target.value)} /></div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{htmlMode ? t('live.form.body_html') : t('live.form.body_text')}</Label>
          <button type="button" className="text-[11px] text-primary hover:underline"
            onClick={() => {
              // Carry the current content across so switching never loses work.
              if (!htmlMode) set('body_html', textToHtml(bodyText, linkText));
              setHtmlMode(!htmlMode);
            }}>
            {htmlMode ? t('live.form.use_text') : t('live.form.use_html')}
          </button>
        </div>
        {htmlMode ? (
          <Textarea rows={5} value={f.body_html} onChange={(e) => set('body_html', e.target.value)}
            className="font-mono text-xs" />
        ) : (
          <>
            <Textarea rows={5} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
            <div className="grid md:grid-cols-2 gap-3">
              <div><Label>{t('live.form.link_text')}</Label>
                <Input value={linkText} onChange={(e) => setLinkText(e.target.value)} /></div>
              <p className="text-[11px] text-muted-foreground self-end">{t('live.form.url_hint', { token: URL_TOKEN })}</p>
            </div>
          </>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t('live.form.preview')}</p>
          {/* Sandboxed: the preview renders author HTML without running scripts. */}
          <iframe title="preview" sandbox="" className="w-full h-40 rounded-md border border-border bg-white"
            srcDoc={`<div style="font-family:sans-serif;font-size:14px;color:#222;padding:8px">${bodyHtml
              .split('{{.URL}}').join('#')}</div>`} />
        </div>
      </div>
      <div><Label>{t('live.form.recipients')}</Label>
        <Textarea rows={3} value={f.recipients} onChange={(e) => set('recipients', e.target.value)} placeholder="alice@acme.test&#10;bob@acme.test" /></div>
      <Button onClick={submit} className="w-full">
        {recurring
          ? <><Repeat className="w-4 h-4 mr-2" /> {t('live.form.create_schedule')}</>
          : <><Plus className="w-4 h-4 mr-2" /> {t('live.form.create_draft')}</>}
      </Button>
    </Card>
  );
}

function Detail({ id, onChanged, onDeleted }) {
  const { t } = useTranslation();
  const [c, setC] = useState(null);
  const [results, setResults] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyEmail, setReplyEmail] = useState('');
  const [replyBody, setReplyBody] = useState('');

  const load = useCallback(async () => {
    try {
      setC((await api.get(`/live/campaigns/${id}`)).data);
      setResults((await api.get(`/live/campaigns/${id}/results`)).data);
      setMessages((await api.get(`/live/campaigns/${id}/messages`)).data);
    } catch { /* noop */ }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!c) return null;

  const act = async (verb, body) => {
    try {
      await api.post(`/live/campaigns/${id}/${verb}`, body || {});
      toast.success(t(`live.action_ok.${verb}`, { defaultValue: verb }));
      load(); onChanged?.();
    } catch (e) {
      const d = e.response?.data?.detail;
      if (d?.preflight) toast.error(t('live.preflight_blocked'));
      else toast.error(typeof d === 'string' ? d : t('live.failed'));
      load();
    }
  };

  const remove = async () => {
    if (!window.confirm(t('live.confirm_delete', { name: c.name }))) return;
    try {
      await api.delete(`/live/campaigns/${id}`);
      toast.success(t('live.deleted'));
      onDeleted?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('live.failed'));
    }
  };

  const sendReply = async () => {
    if (!replyEmail || !replyBody) return;
    const res = await api.post(`/live/campaigns/${id}/inbound`, { email: replyEmail, body: replyBody });
    toast.info(t('live.reply_outcome', { status: res.data.status }));
    setReplyBody(''); load();
  };

  const m = results?.metrics;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg">{c.name}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={c.status} />
            {isAiObjective(c.objective)
              ? <Badge className="bg-accent/80 text-white"><MessageSquare className="w-3 h-3 mr-1" />{t('live.type_ai')}</Badge>
              : <Badge className="bg-primary/80 text-white"><MousePointerClick className="w-3 h-3 mr-1" />{t('live.type_click')}</Badge>}
            <span className="text-xs text-muted-foreground">{t('live.recipients_count', { count: c.recipient_count })} · {t(`live.objective.${c.objective}`, { defaultValue: c.objective })}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">{t('live.preflight')}</h4>
        <Preflight findings={c.preflight} />
      </div>

      <div className="flex flex-wrap gap-2">
        {c.status === 'draft' && <Button size="sm" onClick={() => act('submit')}><Send className="w-4 h-4 mr-1" /> {t('live.btn.submit')}</Button>}
        {c.status === 'pending_approval' && <>
          <Button size="sm" onClick={() => act('approve')}><CheckCircle2 className="w-4 h-4 mr-1" /> {t('live.btn.approve')}</Button>
          <Button size="sm" variant="outline" onClick={() => act('reject', { reason: 'Rejected from UI' })}>{t('live.btn.reject')}</Button>
        </>}
        {c.status === 'approved' && <Button size="sm" onClick={() => act('launch')}><Play className="w-4 h-4 mr-1" /> {t('live.btn.launch')}</Button>}
        {c.status === 'running' && <Button size="sm" variant="outline" onClick={() => act('sync')}><RefreshCw className="w-4 h-4 mr-1" /> {t('live.btn.sync')}</Button>}
        {!['killed', 'closed'].includes(c.status) && (
          <Button size="sm" variant="destructive" onClick={() => act('kill')}><Octagon className="w-4 h-4 mr-1" /> {t('live.btn.kill')}</Button>
        )}
        {!['pending_approval', 'approved', 'launching', 'running'].includes(c.status) && (
          <Button size="sm" variant="outline" onClick={remove}
            className="text-red-400 border-red-400/30"><Trash2 className="w-4 h-4 mr-1" /> {t('live.btn.delete')}</Button>
        )}
      </div>

      {m && (
        <div className="grid md:grid-cols-3 gap-3 pt-2">
          {/* Report rate is the headline: the behaviour we actually want. */}
          <div className="md:row-span-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-col justify-center text-center">
            <div className="flex items-center justify-center gap-1.5 text-emerald-400 mb-1">
              <Flag className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-widest font-mono">{t('live.m.report_rate')}</span>
            </div>
            <div className="text-5xl font-bold text-emerald-400">
              {m.report_rate == null ? '—' : `${Math.round(m.report_rate * 100)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{t('live.m.reported_of', { reported: m.reported, total: m.recipients })}</div>
          </div>
          <Metric label={t('live.m.click_rate')} value={m.click_rate == null ? '—' : `${Math.round(m.click_rate * 100)}%`}
            sub={t('live.m.clicks', { count: m.clicked })} icon={MousePointerClick} tone="amber" />
          <Metric label={t('live.m.recipients')} value={m.recipients} icon={Inbox} />
          <Metric label={t('live.m.time_to_report')}
            value={m.median_time_to_report_min == null ? '—' : `${m.median_time_to_report_min}m`}
            icon={Clock} />
          <Metric label={t('live.m.reported')} value={m.reported} icon={Flag} tone="emerald" />
        </div>
      )}

      {results?.recipients?.length > 0 && (
        <div className="max-h-48 overflow-auto text-sm">
          {results.recipients.map((r) => (
            <div key={r.email} className="flex justify-between border-b border-border py-1">
              <span className="font-mono">{r.email}</span>
              <span className="flex gap-2">
                <Badge variant="outline">{t(`status.${r.state || 'queued'}`, { defaultValue: r.state })}</Badge>
                {r.conversation_state && <Badge className="bg-primary/70 text-white">{t(`status.${r.conversation_state}`, { defaultValue: r.conversation_state })}</Badge>}
                {r.reported && <Badge className="bg-emerald-500 text-white">{t('status.reported')}</Badge>}
              </span>
            </div>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent" /> {t('live.type_ai')}
            <span className="text-[10px] uppercase tracking-wide text-accent">{t('live.advanced')}</span>
          </h4>
          <div className="max-h-56 overflow-auto space-y-2">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`text-sm p-2 rounded-md ${msg.direction === 'inbound' ? 'bg-muted/40' : 'bg-primary/10'}`}>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{msg.direction === 'inbound' ? t('live.msg.replied', { email: msg.email }) : t('live.msg.persona')}</span>
                  <Badge variant="outline" className="text-[10px]">{t(`status.${msg.status}`, { defaultValue: msg.status })}</Badge>
                </div>
                <div className="mt-1">{msg.body_redacted}</div>
                {msg.secrets_found?.length > 0 && (
                  <div className="text-[10px] text-amber-500 mt-1">{t('live.msg.redacted', { kinds: msg.secrets_found.join(', ') })}</div>
                )}
              </div>
            ))}
          </div>
          {messages.some((x) => x.direction === 'inbound') &&
            !messages.some((x) => x.direction === 'outbound' && x.status === 'draft_pending') && (
              <p className="text-xs text-amber-500">
                {t('live.msg.no_llm')}
              </p>
            )}
        </div>
      )}

      {c.status === 'running' && isAiObjective(c.objective) && (
        <div className="border-t border-border pt-3 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2"><Inbox className="w-4 h-4" /> {t('live.sim_reply.title')}</h4>
          <Input placeholder={t('live.sim_reply.email_ph')} value={replyEmail} onChange={(e) => setReplyEmail(e.target.value)} />
          <Textarea rows={2} placeholder={t('live.sim_reply.body_ph')} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
          <Button size="sm" onClick={sendReply}>{t('live.sim_reply.send')}</Button>
        </div>
      )}
    </Card>
  );
}

function SummaryBand({ campaigns }) {
  const { t } = useTranslation();
  const [agg, setAgg] = useState(null);
  useEffect(() => {
    const live = campaigns.filter((c) => ['running', 'closed'].includes(c.status));
    if (!live.length) { setAgg(null); return; }
    let cancelled = false;
    Promise.all(live.map((c) =>
      api.get(`/live/campaigns/${c.id}/results`).then((r) => r.data.metrics).catch(() => null)))
      .then((all) => {
        if (cancelled) return;
        const ms = all.filter(Boolean);
        const sum = (k) => ms.reduce((t, m) => t + (m[k] || 0), 0);
        const recipients = sum('recipients');
        setAgg({
          campaigns: live.length,
          recipients,
          reported: sum('reported'),
          clicked: sum('clicked'),
          report_rate: recipients ? sum('reported') / recipients : null,
          click_rate: recipients ? sum('clicked') / recipients : null,
        });
      });
    return () => { cancelled = true; };
  }, [campaigns]);

  if (!agg) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
          <Flag className="w-4 h-4" /><span className="text-[10px] uppercase tracking-widest font-mono">{t('live.m.report_rate')}</span>
        </div>
        <div className="text-3xl font-bold text-emerald-400">
          {agg.report_rate == null ? '—' : `${Math.round(agg.report_rate * 100)}%`}
        </div>
        <div className="text-[10px] text-muted-foreground">{t('live.m.summary_sub', { reported: agg.reported, total: agg.recipients, campaigns: agg.campaigns })}</div>
      </div>
      <Metric label={t('live.m.click_rate')} value={agg.click_rate == null ? '—' : `${Math.round(agg.click_rate * 100)}%`}
        sub={t('live.m.clicks', { count: agg.clicked })} icon={MousePointerClick} tone="amber" />
      <Metric label={t('live.m.total_recipients')} value={agg.recipients} icon={Inbox} />
      <Metric label={t('live.m.total_reported')} value={agg.reported} icon={Flag} tone="emerald" />
    </div>
  );
}

export default function LiveCampaignsPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const schedRef = useRef(null);

  const load = useCallback(async () => {
    try { setCampaigns((await api.get('/live/campaigns')).data); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Recipients handed over from the Attack Surface Map ("launch to weak points").
  useEffect(() => {
    let recipients = null;
    try {
      recipients = sessionStorage.getItem('pretexta_prefill_recipients');
      if (recipients) sessionStorage.removeItem('pretexta_prefill_recipients');
    } catch { /* noop */ }
    if (recipients) {
      setPrefill({ recipients, name: t('live.prefill_name') });
      setCreating(true); setSelected(null);
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <PageHeader icon={Radio} title={t('nav.live_campaigns')}
        description={t('live.page_desc')}>
        <Button onClick={() => { setCreating(true); setSelected(null); }}>
          <Plus className="w-4 h-4 mr-2" /> {t('live.new')}
        </Button>
      </PageHeader>

      <SummaryBand campaigns={campaigns} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <DomainsCard />
          <SchedulesCard ref={schedRef} />
          <ExclusionsCard />
          <Card className="p-5">
            <h3 className="font-bold mb-3">{t('live.list_title')}</h3>
            {campaigns.length === 0
              ? <EmptyState icon={Radio} title={t('live.empty_title')} description={t('live.empty_desc')} />
              : (
                <div className="space-y-1">
                  {campaigns.map((c) => (
                    <button key={c.id} onClick={() => { setSelected(c.id); setCreating(false); }}
                      className={`w-full text-left p-2 rounded-md hover:bg-muted/50 ${selected === c.id ? 'bg-muted/60' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate">{c.name}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <span className="text-xs text-muted-foreground">{t('live.recipients_count', { count: c.recipient_count })}</span>
                    </button>
                  ))}
                </div>
              )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          {creating && <CreateForm onClose={() => { setCreating(false); setPrefill(null); }}
            initial={prefill}
            onCreated={(id) => { setCreating(false); setPrefill(null); setSelected(id); load(); }}
            onScheduled={() => { schedRef.current?.reload(); setPrefill(null); }} />}
          {!creating && selected && <Detail id={selected} onChanged={load}
            onDeleted={() => { setSelected(null); load(); }} />}
          {!creating && !selected && (
            <EmptyState icon={Radio} title={t('live.select_title')} description={t('live.select_desc')} />
          )}
        </div>
      </div>
    </div>
  );
}
