import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Check, Trash2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import api from '../services/api';
import { toast } from 'sonner';

function DraftCard({ draft, onDone }) {
  const [body, setBody] = useState(draft.body_redacted);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      const edited = body !== draft.body_redacted ? { body } : {};
      await api.post(`/live/review/${draft.id}/approve`, edited);
      toast.success('Reply sent');
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Approve failed');
      setBusy(false);
    }
  };
  const discard = async () => {
    setBusy(true);
    try { await api.post(`/live/review/${draft.id}/discard`); toast.success('Discarded'); onDone(); }
    catch { toast.error('Discard failed'); setBusy(false); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm">{draft.email}</span>
        <Badge variant="outline">awaiting review</Badge>
      </div>
      <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="text-xs text-muted-foreground">
        Every AI reply is held here until a human approves it. Edit before sending if needed.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={approve} disabled={busy}><Check className="w-4 h-4 mr-1" /> Approve &amp; send</Button>
        <Button size="sm" variant="destructive" onClick={discard} disabled={busy}><Trash2 className="w-4 h-4 mr-1" /> Discard</Button>
      </div>
    </Card>
  );
}

export default function LiveReviewPage() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDrafts((await api.get('/live/review')).data); }
    catch { /* noop */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <PageHeader icon={MessageSquare} title="Reply Review Queue"
        description="Approve each AI persona reply before it is sent (review mode)">
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </PageHeader>

      {!loading && drafts.length === 0 && (
        <EmptyState icon={ShieldAlert} title="Queue is empty"
          description="AI replies awaiting approval will appear here." />
      )}
      <div className="space-y-4">
        {drafts.map((d) => <DraftCard key={d.id} draft={d} onDone={load} />)}
      </div>
    </div>
  );
}
