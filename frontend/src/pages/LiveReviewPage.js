import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Check, Trash2, RefreshCw, ShieldAlert, Bot } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import api from '../services/api';
import { toast } from 'sonner';

function DraftCard({ draft, onDone }) {
  const { t } = useTranslation();
  const [body, setBody] = useState(draft.body_redacted);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      const edited = body !== draft.body_redacted ? { body } : {};
      await api.post(`/live/review/${draft.id}/approve`, edited);
      toast.success(t('review.sent'));
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('review.approve_failed'));
      setBusy(false);
    }
  };
  const discard = async () => {
    setBusy(true);
    try { await api.post(`/live/review/${draft.id}/discard`); toast.success(t('review.discarded')); onDone(); }
    catch { toast.error(t('review.discard_failed')); setBusy(false); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <span className="font-mono text-sm">{draft.email}</span>
          {draft.campaign_name && (
            <span className="block text-xs text-muted-foreground truncate">{draft.campaign_name}</span>
          )}
        </div>
        {draft.persona_declined
          ? <Badge variant="outline" className="text-amber-400 border-amber-400/40"><Bot className="w-3 h-3 mr-1" />{t('review.declined')}</Badge>
          : <Badge variant="outline">{t('review.awaiting')}</Badge>}
      </div>
      {draft.in_reply_to && (
        <div className="border-l-2 border-primary/40 pl-3 text-sm">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t('review.they_wrote')}</span>
          <p className="whitespace-pre-line">{draft.in_reply_to}</p>
        </div>
      )}
      {draft.persona_declined && (
        <p className="text-xs text-amber-400">{t('review.declined_note')}</p>
      )}
      <Textarea rows={4} value={body} placeholder={t('review.placeholder')}
        onChange={(e) => setBody(e.target.value)} />
      <p className="text-xs text-muted-foreground">{t('review.help')}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={approve} disabled={busy || !body.trim()}>
          <Check className="w-4 h-4 mr-1" /> {t('review.approve')}
        </Button>
        <Button size="sm" variant="destructive" onClick={discard} disabled={busy}>
          <Trash2 className="w-4 h-4 mr-1" /> {t('review.discard')}
        </Button>
      </div>
    </Card>
  );
}

export default function LiveReviewPage() {
  const { t } = useTranslation();
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
      <PageHeader icon={MessageSquare} title={t('review.title')} description={t('review.subtitle')}>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </PageHeader>

      {!loading && drafts.length === 0 && (
        <EmptyState icon={ShieldAlert} title={t('review.empty_title')} description={t('review.empty_desc')} />
      )}
      <div className="space-y-4">
        {drafts.map((d) => <DraftCard key={d.id} draft={d} onDone={load} />)}
      </div>
    </div>
  );
}
