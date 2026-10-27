import React, { useEffect, useState, useCallback } from 'react';
import {
  Radio, Plus, ShieldCheck, Send, Play, Octagon, CheckCircle2, XCircle,
  AlertTriangle, Info, RefreshCw, Globe, Inbox, MousePointerClick, Flag,
  MessageSquare, Clock, Trash2, ShieldOff, X,
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

// A click campaign measures behaviour (who clicks, who reports). The reply-based
// objectives drive the optional AI-conversation engine — an advanced layer.
const AI_OBJECTIVES = ['reply', 'agree_to_share_otp', 'agree_to_approve_payment', 'agree_to_install_tool'];
const OBJECTIVE_LABELS = {
  click_link: 'Klik tautan',
  reply: 'Balas email',
  agree_to_share_otp: 'Setuju bagikan OTP',
  agree_to_approve_payment: 'Setuju setujui pembayaran',
  agree_to_install_tool: 'Setuju pasang aplikasi',
};
const isAiObjective = (o) => AI_OBJECTIVES.includes(o);
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
  return <Badge className={`${STATUS_STYLE[status] || 'bg-slate-500'} text-white`}>{status}</Badge>;
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
  if (!findings?.length) {
    return (
      <p className="text-emerald-500 text-sm flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4" /> All pre-flight checks passed
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
      else toast.success('Sandbox domain verified');
      setName(''); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const verify = async (id) => {
    const res = await api.post(`/live/domains/${id}/verify`);
    toast[res.data.verified ? 'success' : 'error'](res.data.verified ? 'Verified' : 'TXT record not found');
    load();
  };

  return (
    <Card className="p-5 space-y-3">
      <h3 className="font-bold flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /> Verified domains</h3>
      <p className="text-xs text-muted-foreground">Recipients must be on a domain you control. Reserved TLDs like <code>.test</code> are sandbox domains, safe for demos.</p>
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
                ? <Badge className="bg-emerald-500 text-white">verified</Badge>
                : <Badge className="bg-amber-500 text-white">pending DNS</Badge>}
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
      toast.success(`${res.data.added} ditambahkan ke daftar kecuali`);
      setEmails(''); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Gagal'); }
  };
  const remove = async (email) => {
    try { await api.delete(`/live/exclusions/${encodeURIComponent(email)}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Gagal'); }
  };

  return (
    <Card className="p-5 space-y-3">
      <h3 className="font-bold flex items-center gap-2"><ShieldOff className="w-5 h-5 text-amber-400" /> Daftar kecuali</h3>
      <p className="text-xs text-muted-foreground">Alamat di sini <strong>tidak akan pernah</strong> dikirimi simulasi — mis. eksekutif yang opt-out, mailbox bersama, atau orang yang sedang cuti.</p>
      <div className="flex gap-2">
        <Input placeholder="ceo@acme.test" value={emails} onChange={(e) => setEmails(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button onClick={add} size="sm"><Plus className="w-4 h-4" /></Button>
      </div>
      <div className="space-y-1 max-h-40 overflow-auto">
        {rows.length === 0
          ? <p className="text-xs text-muted-foreground font-mono">Belum ada pengecualian.</p>
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

const BLANK = {
  name: '', objective: 'click_link', principles: ['authority'],
  sender_name: 'IT Helpdesk', sender_email: 'helpdesk@acme.test',
  subject: '', body_html: '<p>Hello,</p><p>Please confirm here: {{.URL}}</p>',
  recipients: '', starts_at: '', ends_at: '', max_turns: 0,
};

function CreateForm({ onClose, onCreated }) {
  const [f, setF] = useState(BLANK);
  const [templates, setTemplates] = useState([]);
  const [aiMode, setAiMode] = useState(false); // click campaign by default
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
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setAiMode(isAiObjective(t.objective));
    setF((p) => ({
      ...p,
      name: p.name || t.name,
      objective: t.objective,
      max_turns: isAiObjective(t.objective) ? (p.max_turns || 3) : 0,
      principles: t.principles,
      sender_name: t.sender_name,
      subject: t.subject,
      body_html: t.body_html,
    }));
  };

  const submit = async () => {
    const payload = {
      ...f,
      max_turns: Number(f.max_turns),
      recipients: f.recipients.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean),
      starts_at: new Date(f.starts_at).toISOString(),
      ends_at: new Date(f.ends_at).toISOString(),
    };
    try {
      const res = await api.post('/live/campaigns', payload);
      toast.success('Campaign drafted');
      onCreated(res.data.id);
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Create failed');
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">New live campaign</h3>
        <Button variant="ghost" size="sm" onClick={onClose}><XCircle className="w-4 h-4" /></Button>
      </div>
      {templates.length > 0 && (
        <div>
          <Label>Start from a template</Label>
          <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">— choose a phishing template (optional) —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.category}</option>)}
          </select>
        </div>
      )}
      {/* Campaign type: click is the primary, measurable flow; AI is advanced. */}
      <div>
        <Label>Tipe kampanye</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button type="button" onClick={chooseClick}
            className={`flex items-start gap-2 p-3 rounded-md border text-left transition-all ${
              !aiMode ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
            <MousePointerClick className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Kampanye Klik</span>
              <span className="block text-[11px] text-muted-foreground">Ukur siapa yang klik & siapa yang melapor. Metrik: report rate.</span>
            </span>
          </button>
          <button type="button" onClick={chooseAi}
            className={`flex items-start gap-2 p-3 rounded-md border text-left transition-all ${
              aiMode ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/40'}`}>
            <MessageSquare className="w-4 h-4 mt-0.5 text-accent flex-shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Percakapan AI <span className="text-[10px] uppercase tracking-wide text-accent">lanjutan</span></span>
              <span className="block text-[11px] text-muted-foreground">Persona AI membalas thread — tiap balasan ditinjau manusia.</span>
            </span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div><Label>Name</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div><Label>Sender name</Label><Input value={f.sender_name} onChange={(e) => set('sender_name', e.target.value)} /></div>
        <div><Label>Sender email</Label><Input value={f.sender_email} onChange={(e) => set('sender_email', e.target.value)} /></div>
        <div className="hidden md:block" />
        <div><Label>Starts</Label><Input type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></div>
        <div><Label>Ends</Label><Input type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></div>
      </div>

      {/* Advanced AI settings only when the AI mode is chosen. */}
      {aiMode && (
        <div className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-accent">
            <MessageSquare className="w-4 h-4" /> Pengaturan percakapan AI
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Objektif persona</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={f.objective} onChange={(e) => set('objective', e.target.value)}>
                {AI_OBJECTIVES.map((o) => <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>)}
              </select>
            </div>
            <div><Label>Maks giliran AI</Label><Input type="number" min="1" max="6" value={f.max_turns} onChange={(e) => set('max_turns', e.target.value)} /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Balasan persona tidak pernah terkirim otomatis — selalu ditahan di antrean <strong>Reply Review</strong> untuk disetujui.
          </p>
        </div>
      )}

      <div>
        <Label>Influence principles</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {PRINCIPLES.map((p) => (
            <button key={p} onClick={() => togglePrinciple(p)}
              className={`px-2.5 py-1 rounded-full text-xs border ${f.principles.includes(p) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div><Label>Subject</Label><Input value={f.subject} onChange={(e) => set('subject', e.target.value)} /></div>
      <div><Label>Body (HTML, use {'{{.URL}}'} for the link)</Label>
        <Textarea rows={4} value={f.body_html} onChange={(e) => set('body_html', e.target.value)} /></div>
      <div><Label>Recipients (one per line or comma-separated)</Label>
        <Textarea rows={3} value={f.recipients} onChange={(e) => set('recipients', e.target.value)} placeholder="alice@acme.test&#10;bob@acme.test" /></div>
      <Button onClick={submit} className="w-full"><Plus className="w-4 h-4 mr-2" /> Create draft</Button>
    </Card>
  );
}

function Detail({ id, onChanged, onDeleted }) {
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
      toast.success(verb);
      load(); onChanged?.();
    } catch (e) {
      const d = e.response?.data?.detail;
      if (d?.preflight) toast.error('Pre-flight blocked submission');
      else toast.error(typeof d === 'string' ? d : `${verb} failed`);
      load();
    }
  };

  const remove = async () => {
    if (!window.confirm(`Hapus kampanye "${c.name}"? Semua data penerima & pesannya ikut terhapus.`)) return;
    try {
      await api.delete(`/live/campaigns/${id}`);
      toast.success('Kampanye dihapus');
      onDeleted?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal menghapus');
    }
  };

  const sendReply = async () => {
    if (!replyEmail || !replyBody) return;
    const res = await api.post(`/live/campaigns/${id}/inbound`, { email: replyEmail, body: replyBody });
    toast.info(`Outcome: ${res.data.status}`);
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
              ? <Badge className="bg-accent/80 text-white"><MessageSquare className="w-3 h-3 mr-1" />Percakapan AI</Badge>
              : <Badge className="bg-primary/80 text-white"><MousePointerClick className="w-3 h-3 mr-1" />Kampanye Klik</Badge>}
            <span className="text-xs text-muted-foreground">{c.recipient_count} penerima · {OBJECTIVE_LABELS[c.objective] || c.objective}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">Pre-flight</h4>
        <Preflight findings={c.preflight} />
      </div>

      <div className="flex flex-wrap gap-2">
        {c.status === 'draft' && <Button size="sm" onClick={() => act('submit')}><Send className="w-4 h-4 mr-1" /> Submit for approval</Button>}
        {c.status === 'pending_approval' && <>
          <Button size="sm" onClick={() => act('approve')}><CheckCircle2 className="w-4 h-4 mr-1" /> Approve</Button>
          <Button size="sm" variant="outline" onClick={() => act('reject', { reason: 'Rejected from UI' })}>Reject</Button>
        </>}
        {c.status === 'approved' && <Button size="sm" onClick={() => act('launch')}><Play className="w-4 h-4 mr-1" /> Launch</Button>}
        {c.status === 'running' && <Button size="sm" variant="outline" onClick={() => act('sync')}><RefreshCw className="w-4 h-4 mr-1" /> Sync results</Button>}
        {!['killed', 'closed'].includes(c.status) && (
          <Button size="sm" variant="destructive" onClick={() => act('kill')}><Octagon className="w-4 h-4 mr-1" /> Kill</Button>
        )}
        {!['pending_approval', 'approved', 'launching', 'running'].includes(c.status) && (
          <Button size="sm" variant="outline" onClick={remove}
            className="text-red-400 border-red-400/30"><Trash2 className="w-4 h-4 mr-1" /> Hapus</Button>
        )}
      </div>

      {m && (
        <div className="grid md:grid-cols-3 gap-3 pt-2">
          {/* Report rate is the headline: the behaviour we actually want. */}
          <div className="md:row-span-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-col justify-center text-center">
            <div className="flex items-center justify-center gap-1.5 text-emerald-400 mb-1">
              <Flag className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-widest font-mono">Report rate</span>
            </div>
            <div className="text-5xl font-bold text-emerald-400">
              {m.report_rate == null ? '—' : `${Math.round(m.report_rate * 100)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{m.reported} dari {m.recipients} melapor</div>
          </div>
          <Metric label="Click rate" value={m.click_rate == null ? '—' : `${Math.round(m.click_rate * 100)}%`}
            sub={`${m.clicked} klik`} icon={MousePointerClick} tone="amber" />
          <Metric label="Penerima" value={m.recipients} icon={Inbox} />
          <Metric label="Waktu lapor (median)"
            value={m.median_time_to_report_min == null ? '—' : `${m.median_time_to_report_min}m`}
            icon={Clock} />
          <Metric label="Melapor" value={m.reported} icon={Flag} tone="emerald" />
        </div>
      )}

      {results?.recipients?.length > 0 && (
        <div className="max-h-48 overflow-auto text-sm">
          {results.recipients.map((r) => (
            <div key={r.email} className="flex justify-between border-b border-border py-1">
              <span className="font-mono">{r.email}</span>
              <span className="flex gap-2">
                <Badge variant="outline">{r.state || 'queued'}</Badge>
                {r.conversation_state && <Badge className="bg-primary/70 text-white">{r.conversation_state}</Badge>}
                {r.reported && <Badge className="bg-emerald-500 text-white">reported</Badge>}
              </span>
            </div>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent" /> Percakapan AI
            <span className="text-[10px] uppercase tracking-wide text-accent">lanjutan</span>
          </h4>
          <div className="max-h-56 overflow-auto space-y-2">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`text-sm p-2 rounded-md ${msg.direction === 'inbound' ? 'bg-muted/40' : 'bg-primary/10'}`}>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{msg.direction === 'inbound' ? `${msg.email} replied` : 'persona'}</span>
                  <Badge variant="outline" className="text-[10px]">{msg.status}</Badge>
                </div>
                <div className="mt-1">{msg.body_redacted}</div>
                {msg.secrets_found?.length > 0 && (
                  <div className="text-[10px] text-amber-500 mt-1">secret redacted: {msg.secrets_found.join(', ')}</div>
                )}
              </div>
            ))}
          </div>
          {messages.some((x) => x.direction === 'inbound') &&
            !messages.some((x) => x.direction === 'outbound' && x.status === 'draft_pending') && (
              <p className="text-xs text-amber-500">
                A reply was received but no AI draft was produced — configure an LLM provider in Settings so the persona can reply (drafts then appear in Reply Review).
              </p>
            )}
        </div>
      )}

      {c.status === 'running' && isAiObjective(c.objective) && (
        <div className="border-t border-border pt-3 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2"><Inbox className="w-4 h-4" /> Simulasikan balasan penerima (demo)</h4>
          <Input placeholder="penerima@acme.test" value={replyEmail} onChange={(e) => setReplyEmail(e.target.value)} />
          <Textarea rows={2} placeholder="Balasan mereka…" value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
          <Button size="sm" onClick={sendReply}>Kirim ke mesin percakapan</Button>
        </div>
      )}
    </Card>
  );
}

function SummaryBand({ campaigns }) {
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
          <Flag className="w-4 h-4" /><span className="text-[10px] uppercase tracking-widest font-mono">Report rate</span>
        </div>
        <div className="text-3xl font-bold text-emerald-400">
          {agg.report_rate == null ? '—' : `${Math.round(agg.report_rate * 100)}%`}
        </div>
        <div className="text-[10px] text-muted-foreground">{agg.reported}/{agg.recipients} melapor · {agg.campaigns} kampanye</div>
      </div>
      <Metric label="Click rate" value={agg.click_rate == null ? '—' : `${Math.round(agg.click_rate * 100)}%`}
        sub={`${agg.clicked} klik`} icon={MousePointerClick} tone="amber" />
      <Metric label="Total penerima" value={agg.recipients} icon={Inbox} />
      <Metric label="Total melapor" value={agg.reported} icon={Flag} tone="emerald" />
    </div>
  );
}

export default function LiveCampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try { setCampaigns((await api.get('/live/campaigns')).data); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <PageHeader icon={Radio} title="Live Campaigns"
        description="Simulasi phishing berizin di mailbox asli — ukur siapa yang klik & siapa yang melapor (report rate)">
        <Button onClick={() => { setCreating(true); setSelected(null); }}>
          <Plus className="w-4 h-4 mr-2" /> Kampanye baru
        </Button>
      </PageHeader>

      <SummaryBand campaigns={campaigns} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <DomainsCard />
          <ExclusionsCard />
          <Card className="p-5">
            <h3 className="font-bold mb-3">Campaigns</h3>
            {campaigns.length === 0
              ? <EmptyState icon={Radio} title="No campaigns yet" description="Create one to get started." />
              : (
                <div className="space-y-1">
                  {campaigns.map((c) => (
                    <button key={c.id} onClick={() => { setSelected(c.id); setCreating(false); }}
                      className={`w-full text-left p-2 rounded-md hover:bg-muted/50 ${selected === c.id ? 'bg-muted/60' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate">{c.name}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <span className="text-xs text-muted-foreground">{c.recipient_count} recipients</span>
                    </button>
                  ))}
                </div>
              )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          {creating && <CreateForm onClose={() => setCreating(false)}
            onCreated={(id) => { setCreating(false); setSelected(id); load(); }} />}
          {!creating && selected && <Detail id={selected} onChanged={load}
            onDeleted={() => { setSelected(null); load(); }} />}
          {!creating && !selected && (
            <EmptyState icon={Radio} title="Select a campaign" description="Pick one on the left, or create a new campaign." />
          )}
        </div>
      </div>
    </div>
  );
}
