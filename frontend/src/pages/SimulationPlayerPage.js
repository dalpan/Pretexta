import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Mail, MessageSquare, Phone, Globe, ArrowRight, Check, X, Zap, Flag } from 'lucide-react';
import api from '../services/api';

export default function SimulationPlayerPage() {
  const { simulationId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [simulation, setSimulation] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [currentNode, setCurrentNode] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [score, setScore] = useState(100);
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState(false); // kept false; server drives flow now
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    loadSimulation();
    setLanguage(localStorage.getItem('soceng_language') || 'en');
  }, [simulationId]);

  const loadSimulation = async () => {
    try {
      const simRes = await api.get(`/simulations/${simulationId}`);
      setSimulation(simRes.data);

      if (simRes.data.challenge_id) {
        // Keep the challenge only for display metadata (title, principles).
        try {
          const challengeRes = await api.get(`/challenges/${simRes.data.challenge_id}`);
          setChallenge(challengeRes.data);
        } catch { /* noop */ }
      }

      // The server holds the scenario node graph and the score.
      const res = await api.post('/scenarios/resume', { simulation_id: simulationId });
      setSessionId(res.data.session_id);
      setCurrentNode(res.data.node);
      setScore(res.data.score);
      if (res.data.status === 'completed') setOutcome(res.data.outcome || (res.data.score >= 70 ? 'success' : 'failure'));
    } catch (error) {
      console.error('Failed to load simulation:', error);
      toast.error('Gagal memuat simulasi — ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  // optionIndex is null to advance past a message node.
  const handleChoice = async (optionIndex) => {
    try {
      const res = await api.post('/scenarios/choose', {
        session_id: sessionId,
        option_index: optionIndex,
      });
      setScore(res.data.score);
      if (res.data.status === 'completed') {
        setOutcome(res.data.outcome);
        setCurrentNode(res.data.node || { type: 'end' });
        await onCompleted(res.data.score, res.data.outcome);
      } else {
        setCurrentNode(res.data.node);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to continue');
    }
  };

  const onCompleted = async (finalScore, result) => {
    try {
      // The server already recorded the simulation; just handle campaign-stage linkage.
      if (simulation?.campaign_id !== undefined && simulation?.stage_index !== undefined) {
        try {
          const stageRes = await api.post(
            `/campaigns/${simulation.campaign_id}/stage/${simulation.stage_index}/complete`,
            { score: finalScore }
          );
          if (stageRes.data.is_complete) {
            toast.success('🏆 Kampanye Selesai! Semua tahap berhasil diselesaikan.');
          } else {
            toast.success(`Tahap ${simulation.stage_index + 1} selesai — Tahap ${simulation.stage_index + 2} dibuka!`);
          }
        } catch (campErr) {
          console.warn('Could not auto-complete campaign stage:', campErr.message);
        }
      } else {
        toast.success(result === 'success' ? '✅ Simulasi selesai!' : '⚠️ Simulasi selesai');
      }
    } catch (error) {
      console.error('Failed to complete simulation', error);
    }
  };

  const getChannelIcon = (channel) => {
    switch (channel) {
      case 'email_inbox':
      case 'email':
        return <Mail className="w-5 h-5" />;
      case 'chat_ui':
      case 'chat':
      case 'whatsapp':
      case 'sms':
      case 'social_media':
      case 'linkedin':
        return <MessageSquare className="w-5 h-5" />;
      case 'phone_sim':
      case 'phone_call':
      case 'telephone':
      case 'phone':
        return <Phone className="w-5 h-5" />;
      case 'web_sim':
      case 'browser':
        return <Globe className="w-5 h-5" />;
      default: return <MessageSquare className="w-5 h-5" />;
    }
  };

  const getContent = (node, key) => {
    const contentKey = language === 'id' && node.content_id ? 'content_id' : 'content_en';
    return node[contentKey]?.[key] || node.content_en?.[key] || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-primary font-mono animate-pulse">LOADING SIMULATION...</div>
      </div>
    );
  }

  if (!currentNode && !loading) {
    return (
      <div className="max-w-xl mx-auto text-center p-12 space-y-4">
        <div className="p-4 border border-yellow-500/30 bg-yellow-500/5">
          <p className="font-mono text-yellow-400 text-sm font-bold uppercase tracking-widest mb-2">Skenario Tidak Dapat Dimuat</p>
          <p className="text-xs text-muted-foreground font-mono">
            Data skenario tidak ditemukan atau memiliki format yang tidak valid.
            Silakan coba skenario lain atau hubungi instruktur Anda.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate('/scenarios')} className="text-xs uppercase tracking-widest">
            Kembali ke Skenario
          </Button>
          <Button variant="outline" onClick={() => navigate('/simulations')} className="text-xs uppercase tracking-widest">
            Riwayat Simulasi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-2">{challenge?.title}</h1>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              {challenge?.cialdini_categories?.map(cat => (
                <Badge key={cat} variant="outline" className="font-mono">
                  {cat}
                </Badge>
              ))}
            </div>
          </div>

          {/* Score Display */}
          <div className="text-right">
            <div className="text-sm text-muted-foreground uppercase tracking-wide">
              {t('simulation.security_score')}
            </div>
            <div className={`text-4xl font-bold font-mono ${score >= 70 ? 'text-tertiary' : score >= 40 ? 'text-warning' : 'text-destructive'
              }`}>
              {Math.round(score)}
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="glass-panel p-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('simulation.score_of', { score: Math.round(score) })}</span>
          <span>{currentNode?.type === 'end' ? t('simulation.status_completed') : t('simulation.status_running')}</span>
        </div>
      </div>

      {/* Current Node Display */}
      {currentNode.type === 'message' && (
        <Card className="glass-panel p-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-primary/20 rounded-lg">
              {getChannelIcon(currentNode.channel)}
            </div>

            <div className="flex-1 space-y-4">
              {currentNode.ai_generated && (
                <Badge className="bg-warning/20 text-warning border-warning/30">
                  <Zap className="w-3 h-3 mr-1" />
                  AI-Generated Adaptive Response
                </Badge>
              )}

              {getContent(currentNode, 'subject') && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase">Subject</div>
                  <div className="text-lg font-semibold">{getContent(currentNode, 'subject')}</div>
                </div>
              )}

              {getContent(currentNode, 'from') && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase">From</div>
                  <div className="font-mono text-sm">{getContent(currentNode, 'from')}</div>
                </div>
              )}

              {getContent(currentNode, 'caller') && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase">Caller ID</div>
                  <div className="font-mono text-sm">{getContent(currentNode, 'caller')}</div>
                </div>
              )}

              {getContent(currentNode, 'sender') && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase">Sender</div>
                  <div className="font-mono text-sm">{getContent(currentNode, 'sender')}</div>
                </div>
              )}

              {getContent(currentNode, 'url') && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase">URL</div>
                  <div className="font-mono text-sm text-blue-400">{getContent(currentNode, 'url')}</div>
                </div>
              )}

              {getContent(currentNode, 'attachment') && (
                <div className="inline-flex items-center space-x-2 p-2 bg-muted/20 border border-muted/30 rounded mt-2">
                  <span className="text-xs text-muted-foreground uppercase font-bold">Attachment:</span>
                  <span className="font-mono text-sm text-tertiary">{getContent(currentNode, 'attachment')}</span>
                </div>
              )}

              <div className="prose prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{getContent(currentNode, 'body') || getContent(currentNode, 'text') || getContent(currentNode, 'transcript') || getContent(currentNode, 'message') || getContent(currentNode, 'info')}</p>
              </div>

              {currentNode.tactics_used && (
                <div className="text-xs text-warning">
                  🎯 Tactics: {currentNode.tactics_used.join(', ')}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={() => handleChoice(null)}>
              {t('simulation.continue')} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {/* Question Node */}
      {currentNode.type === 'question' && (
        <Card className="glass-panel p-6">
          <h2 className="text-xl font-bold mb-6">
            {getContent(currentNode, 'text')}
          </h2>

          <div className="space-y-3">
            {currentNode.options?.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleChoice(idx)}
                disabled={aiThinking}
                className="w-full p-4 text-left bg-muted/10 hover:bg-muted/20 border border-muted/30 hover:border-primary/30 rounded-lg transition-colors group"
                data-testid={`option-${idx}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex-1">
                    {language === 'id' && option.text_id ? option.text_id : option.text}
                  </span>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </button>
            ))}
          </div>

          {aiThinking && (
            <div className="mt-6 text-center">
              <div className="inline-flex items-center space-x-2 text-warning animate-pulse">
                <Zap className="w-5 h-5" />
                <span className="font-mono">AI adapting scenario...</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* End Node */}
      {currentNode.type === 'end' && (
        <Card className={`glass-panel p-8 text-center ${outcome === 'success' ? 'border-tertiary/50' : 'border-destructive/50'
          }`}>
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${outcome === 'success' ? 'bg-tertiary/20' : 'bg-destructive/20'
            }`}>
            {outcome === 'success' ? (
              <Check className="w-10 h-10 text-tertiary" />
            ) : (
              <X className="w-10 h-10 text-destructive" />
            )}
          </div>

          <h2 className="text-3xl font-bold mb-4">
            {getContent(currentNode, 'title')}
          </h2>

          {/* Explanations are authored with line breaks and bullet lists. */}
          <p className="text-base text-muted-foreground mb-8 max-w-2xl mx-auto text-left whitespace-pre-line leading-relaxed">
            {getContent(currentNode, 'explanation')}
          </p>

          <div className="flex items-center justify-center space-x-4 flex-wrap gap-2">
            <Button onClick={() => navigate('/simulations')}>
              {t('simulation.view_all_simulations')}
            </Button>
            {/* A fresh attempt is a new scenario run, so scoring stays honest. */}
            <Button variant="outline" onClick={() => navigate('/scenarios')}>
              {t('simulation.try_another')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
