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
  const [events, setEvents] = useState([]);
  const [score, setScore] = useState(100);
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [historyStack, setHistoryStack] = useState([]); // Track node history for undo/retry
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    loadSimulation();
    setLanguage(localStorage.getItem('soceng_language') || 'en');
  }, [simulationId]);

  const loadSimulation = async () => {
    try {
      const simRes = await api.get(`/simulations/${simulationId}`);
      setSimulation(simRes.data);
      setScore(simRes.data.score || 100);
      setEvents(simRes.data.events || []);

      if (simRes.data.challenge_id) {
        const challengeRes = await api.get(`/challenges/${simRes.data.challenge_id}`);
        const challengeData = challengeRes.data;
        setChallenge(challengeData);
        const nodes = Array.isArray(challengeData.nodes) ? challengeData.nodes : [];
        const lastEvent = simRes.data.events?.[simRes.data.events.length - 1];
        const nodeId = lastEvent?.next_node || 'start';
        const node = nodes.find((n) => n.id === nodeId) || nodes[0] || null;
        setCurrentNode(node);
      }
    } catch (error) {
      console.error('Failed to load simulation:', error);
      toast.error('Gagal memuat simulasi — ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleChoice = async (option) => {
    // Save current state to stack before moving
    setHistoryStack([...historyStack, currentNode]);

    const event = {
      node_id: currentNode.id,
      action: option.text,
      timestamp: new Date().toISOString(),
      score_impact: option.score_impact || 0,
      next_node: option.next
    };

    // Update local score
    const newScore = Math.max(0, Math.min(100, score + (option.score_impact || 0)));
    setScore(newScore);
    setEvents([...events, event]);

    // Save to backend
    try {
      await api.put(`/simulations/${simulationId}`, { events: [...events, event], score: newScore });
    } catch (error) {
      console.error('Failed to save event', error);
    }

    // Move to next node
    const nextNode = challenge.nodes.find(n => n.id === option.next);

    if (nextNode) {
      // Check if AI should generate adaptive content
      if (nextNode.type === 'ai_adaptive' || (newScore < 50 && nextNode.type === 'message')) {
        await generateAIResponse(nextNode, option);
      } else {
        setCurrentNode(nextNode);
      }

      // Check if simulation ended
      if (nextNode.type === 'end') {
        await completeSimulation(newScore, nextNode.result);
      }
    }
  };

  const generateAIResponse = async (node, previousChoice) => {
    setAiThinking(true);

    try {
      const context = {
        scenario_title: challenge.title,
        current_node: currentNode.id,
        participant_action: previousChoice.text,
        current_score: score,
        cialdini_triggers: challenge.cialdini_categories,
        event_history: events,
        language: language
      };

      const prompt = `You are simulating a social engineering attack for training purposes.

Scenario: ${challenge.title}
Participant just chose: "${previousChoice.text}"
Current susceptibility score: ${score}/100 (lower = more susceptible)
Active Cialdini principles: ${challenge.cialdini_categories.join(', ')}

Generate the next message in this attack sequence. Make it realistic but educational.
${language === 'id' ? 'Respond in Indonesian.' : 'Respond in English.'}

Format your response as JSON:
{
  "message": "The attack message content",
  "channel": "email_inbox or chat_ui or phone_sim",
  "from": "Sender name/email",
  "tactics_used": ["tactic1", "tactic2"]
}`;

      const response = await api.post('/llm/generate', {
        prompt,
        context,
      });

      // Parse AI response
      let aiContent;
      try {
        aiContent = JSON.parse(response.data.generated_text);
      } catch {
        // Fallback if not JSON
        aiContent = {
          message: response.data.generated_text,
          channel: node.channel || 'email_inbox',
          from: 'Attacker'
        };
      }

      // Create AI-generated node
      const aiNode = {
        ...node,
        id: `ai_${Date.now()}`,
        content_en: {
          body: aiContent.message,
          from: aiContent.from
        },
        ai_generated: true,
        tactics_used: aiContent.tactics_used
      };

      setCurrentNode(aiNode);
      toast.success('🤖 AI adapted the scenario based on your response');

    } catch (error) {
      console.error('AI generation failed', error);
      toast.error('AI generation failed, continuing with standard flow');
      setCurrentNode(node);
    } finally {
      setAiThinking(false);
    }
  };

  const completeSimulation = async (finalScore, result) => {
    try {
      await api.put(`/simulations/${simulationId}`, {
        status: 'completed',
        score: finalScore,
        completed_at: new Date().toISOString(),
      });

      // If this simulation was started as part of a campaign stage, auto-complete the stage
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
              Security Awareness Score
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
          <span>Event {events.length + 1}</span>
          <span>{simulation?.status}</span>
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
            <Button
              onClick={() => {
                const nextNode = challenge.nodes.find(n => n.id === currentNode.next);
                setCurrentNode(nextNode);
              }}
              disabled={!currentNode.next}
            >
              Continue <ArrowRight className="w-4 h-4 ml-2" />
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
                onClick={() => handleChoice(option)}
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
        <Card className={`glass-panel p-8 text-center ${currentNode.result === 'success' ? 'border-tertiary/50' : 'border-destructive/50'
          }`}>
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${currentNode.result === 'success' ? 'bg-tertiary/20' : 'bg-destructive/20'
            }`}>
            {currentNode.result === 'success' ? (
              <Check className="w-10 h-10 text-tertiary" />
            ) : (
              <X className="w-10 h-10 text-destructive" />
            )}
          </div>

          <h2 className="text-3xl font-bold mb-4">
            {getContent(currentNode, 'title')}
          </h2>

          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            {getContent(currentNode, 'explanation')}
          </p>

          <div className="flex items-center justify-center space-x-4 flex-wrap gap-2">
            {simulation?.campaign_id ? (
              <Button onClick={() => navigate('/campaigns')}>
                <Flag className="w-4 h-4 mr-2" /> Kembali ke Kampanye
              </Button>
            ) : (
              <Button onClick={() => navigate('/simulations')}>
                Lihat Semua Riwayat
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/scenarios')}>
              Coba Skenario Lain
            </Button>

            {/* RETRY BUTTON FOR PROFESSIONAL LEARNING */}
            {currentNode.result !== 'success' && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (historyStack.length > 0) {
                    // Get last node (before failure)
                    const lastNode = historyStack[historyStack.length - 1];
                    setCurrentNode(lastNode);
                    setHistoryStack(historyStack.slice(0, -1));

                    toast.info("Rewinding... Try a different approach!");
                  } else {
                    // Fallback if no history (e.g. reload)
                    window.location.reload();
                  }
                }}
              >
                Start Over / Retry Step
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
