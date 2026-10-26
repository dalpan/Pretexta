import React, { useEffect, useState, useCallback } from 'react';
import { PenLine, Mail, Send, CheckCircle2, XCircle, ShieldCheck, Flag, AlertTriangle } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import PageHeader from '../components/PageHeader';
import api from '../services/api';
import { toast } from 'sonner';

function Check({ ok, label }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${ok ? 'text-tertiary' : 'text-muted-foreground'}`}>
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4 opacity-50" />}
      {label}
    </div>
  );
}

export default function FreeTextPage() {
  const [prompts, setPrompts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [response, setResponse] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    try { setPrompts((await api.get('/freetext')).data); } catch { /* noop */ }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const open = async (id) => {
    setResult(null); setResponse('');
    try { setCurrent((await api.get(`/freetext/${id}`)).data); }
    catch { toast.error('Failed to load'); }
  };

  const submit = async () => {
    if (!response.trim()) return;
    setBusy(true);
    try {
      const res = await api.post(`/freetext/${current.id}/submit`, { response });
      setResult(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Grading failed');
    } finally { setBusy(false); }
  };

  // ── Selection ──
  if (!current) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <PageHeader icon={PenLine} title="Write Your Reply"
          description="Read the message, type how you'd actually respond. An AI grades the behavior — refuse, verify independently, report." />
        <div className="grid md:grid-cols-2 gap-4">
          {prompts.map((p) => (
            <button key={p.id} onClick={() => open(p.id)}
              className="text-left glass-panel p-5 border border-white/5 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <h3 className="font-bold">{p.title}</h3>
                <Badge variant="outline" className="text-[10px] uppercase">{p.difficulty}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{p.from}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Exercise / result ──
  const r = result?.rubric;
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      <PageHeader icon={PenLine} title={current.title}>
        <Button variant="ghost" size="sm" onClick={() => setCurrent(null)}>← Back</Button>
      </PageHeader>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground border-b border-border pb-2 mb-3">
          <Mail className="w-4 h-4" /> {current.from}
        </div>
        <p className="text-sm whitespace-pre-wrap">{current.scenario}</p>
      </Card>

      {!result ? (
        <>
          <Textarea rows={6} placeholder="Type exactly how you would reply…"
            value={response} onChange={(e) => setResponse(e.target.value)} />
          <Button onClick={submit} disabled={busy || !response.trim()}>
            <Send className="w-4 h-4 mr-2" /> {busy ? 'Grading…' : 'Submit reply'}
          </Button>
        </>
      ) : (
        <Card className={`p-6 space-y-4 ${result.outcome === 'success' ? 'border-tertiary/40' : 'border-destructive/40'}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">
              {result.outcome === 'compromised' ? 'Compromised' : result.outcome === 'success' ? 'Well handled' : 'Needs work'}
            </h3>
            <span className="text-3xl font-bold">{result.score}<span className="text-base text-muted-foreground">/100</span></span>
          </div>
          <div className="space-y-1.5">
            <Check ok={!r.complied} label="Did not comply with the request" />
            <Check ok={r.verified_independently} label="Would verify through an independent, trusted channel" />
            <Check ok={r.would_report} label="Would report / escalate it" />
            {r.asked_the_sender && (
              <div className="flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="w-4 h-4" /> Verified with the sender instead of an independent channel
              </div>
            )}
          </div>
          {r.feedback && (
            <div className="p-3 bg-muted/20 rounded border border-muted/30 text-sm text-muted-foreground">
              {r.feedback}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setResult(null); setResponse(''); }}>
              <PenLine className="w-4 h-4 mr-2" /> Try again
            </Button>
            <Button onClick={() => setCurrent(null)}>Another scenario</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
