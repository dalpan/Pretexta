import React, { useEffect, useState, useCallback } from 'react';
import {
  Radio, Plus, ShieldCheck, Send, Play, Octagon, CheckCircle2, XCircle,
  AlertTriangle, Info, RefreshCw, Globe, Inbox,
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

const OBJECTIVES = [
  'click_link', 'reply', 'agree_to_share_otp', 'agree_to_approve_payment', 'agree_to_install_tool',
];
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

const BLANK = {
  name: '', objective: 'click_link', principles: ['authority'],
  sender_name: 'IT Helpdesk', sender_email: 'helpdesk@acme.test',
  subject: '', body_html: '<p>Hello,</p><p>Please confirm here: {{.URL}}</p>',
  recipients: '', starts_at: '', ends_at: '', max_turns: 3,
};

function CreateForm({ onClose, onCreated }) {
  const [f, setF] = useState(BLANK);
  const [templates, setTemplates] = useState([]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const togglePrinciple = (p) =>
    set('principles', f.principles.includes(p) ? f.principles.filter((x) => x !== p) : [...f.principles, p]);

  useEffect(() => {
    api.get('/live/templates').then((r) => setTemplates(r.data)).catch(() => {});
  }, []);

  const applyTemplate = (id) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setF((p) => ({
      ...p,
      name: p.name || t.name,
      objective: t.objective,
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
      <div className="grid md:grid-cols-2 gap-3">
        <div><Label>Name</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div>
          <Label>Objective</Label>
          <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={f.objective} onChange={(e) => set('objective', e.target.value)}>
            {OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div><Label>Sender name</Label><Input value={f.sender_name} onChange={(e) => set('sender_name', e.target.value)} /></div>
        <div><Label>Sender email</Label><Input value={f.sender_email} onChange={(e) => set('sender_email', e.target.value)} /></div>
        <div><Label>Starts</Label><Input type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></div>
        <div><Label>Ends</Label><Input type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></div>
        <div><Label>Max AI turns</Label><Input type="number" min="0" max="6" value={f.max_turns} onChange={(e) => set('max_turns', e.target.value)} /></div>
      </div>
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

function Detail({ id, onChanged }) {
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
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={c.status} />
            <span className="text-xs text-muted-foreground">{c.recipient_count} recipients · obj: {c.objective}</span>
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
      </div>

      {m && (
        <div className="grid grid-cols-4 gap-3 pt-2">
          {[['Recipients', m.recipients], ['Reported', m.reported], ['Clicked', m.clicked],
            ['Report rate', m.report_rate == null ? '—' : `${Math.round(m.report_rate * 100)}%`]].map(([k, v]) => (
            <div key={k} className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{v}</div>
              <div className="text-xs text-muted-foreground">{k}</div>
            </div>
          ))}
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
          <h4 className="text-sm font-semibold">Conversation</h4>
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

      {c.status === 'running' && (
        <div className="border-t border-border pt-3 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2"><Inbox className="w-4 h-4" /> Simulate a recipient reply (demo)</h4>
          <Input placeholder="recipient@acme.test" value={replyEmail} onChange={(e) => setReplyEmail(e.target.value)} />
          <Textarea rows={2} placeholder="Their reply…" value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
          <Button size="sm" onClick={sendReply}>Send reply into the engine</Button>
        </div>
      )}
    </Card>
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
        description="Authorized phishing simulations in real mailboxes, with AI follow-up">
        <Button onClick={() => { setCreating(true); setSelected(null); }}>
          <Plus className="w-4 h-4 mr-2" /> New campaign
        </Button>
      </PageHeader>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <DomainsCard />
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
          {!creating && selected && <Detail id={selected} onChanged={load} />}
          {!creating && !selected && (
            <EmptyState icon={Radio} title="Select a campaign" description="Pick one on the left, or create a new campaign." />
          )}
        </div>
      </div>
    </div>
  );
}
