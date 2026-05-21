import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Send, Bot, Shield, AlertTriangle, RefreshCw, Trophy, Skull, Zap, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { getPersonas, getPersonaById, getDifficultyVariant, getDifficultyColor, getPersonasByDifficulty } from '../services/personas';
import PageHeader from '../components/PageHeader';
import api from '../services/api';
import { useApi } from '../hooks/useApi';

const DIFFICULTY_TABS = ['Easy', 'Medium', 'Hard'];

export default function AIChatPage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [gameStatus, setGameStatus] = useState('idle'); // idle | active | won | lost
  const [activeDifficulty, setActiveDifficulty] = useState('Easy');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const { data: llmConfigs } = useApi('/llm/config');
  const isLLMConfigured = Array.isArray(llmConfigs) && llmConfigs.some((c) => c.enabled !== false);

  const personasByDifficulty = getPersonasByDifficulty();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-start persona from assignment deep-link (?persona=id)
  useEffect(() => {
    const personaId = searchParams.get('persona');
    if (personaId && isLLMConfigured) {
      const persona = getPersonaById(personaId);
      if (persona) startChat(persona);
    }
  }, [searchParams, isLLMConfigured]);

  const startChat = (persona) => {
    setSelectedPersona(persona);
    setGameStatus('active');
    setMessages([
      {
        role: 'system',
        content: `${t('simulation.security_score')} — ${persona.name} | ${persona.category}`,
      },
      { role: 'assistant', content: persona.openingLine },
    ]);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || loading || gameStatus !== 'active') return;

    const userMsg = { role: 'user', content: inputValue };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputValue('');
    setLoading(true);

    try {
      const response = await api.post('/llm/chat', {
        history: newHistory.filter((m) => m.role !== 'system'),
        persona: selectedPersona,
        message: userMsg.content,
        language: i18n.language,
      });

      const aiMsg = response.data;
      setMessages((prev) => [...prev, { role: 'assistant', content: aiMsg.content }]);

      if (aiMsg.status === 'failed' || aiMsg.status === 'completed') {
        const isWin = aiMsg.status === 'completed';
        setGameStatus(isWin ? 'won' : 'lost');
        toast[isWin ? 'success' : 'error'](
          isWin ? t('simulation.attack_prevented') : t('simulation.compromised'),
          { duration: 5000 }
        );
        await api.post('/simulations', {
          type: 'ai_challenge',
          status: 'completed',
          score: isWin ? 100 : 0,
          title: `AI Battle: ${selectedPersona.name}`,
          challenge_Title: `AI Battle: ${selectedPersona.name}`,
          simulation_type: 'ai_challenge',
          completed_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      const msg = err.response?.data?.detail || t('errors.llm_not_configured');
      toast.error(msg);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const resetGame = () => {
    setSelectedPersona(null);
    setMessages([]);
    setGameStatus('idle');
    setInputValue('');
  };

  // ── Persona Selection Screen ─────────────────────────────────────────
  if (!selectedPersona) {
    return (
      <div className="space-y-8 animate-in fade-in duration-700">
        <PageHeader
          icon={Zap}
          title={t('ai_challenge.title')}
          description={t('ai_challenge.tagline')}
        />

        {/* LLM Warning */}
        {!isLLMConfigured && (
          <div className="flex items-start gap-3 p-4 border border-yellow-500/30 bg-yellow-500/5">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-mono font-bold text-xs text-yellow-400 uppercase tracking-widest mb-1">
                {t('ai_challenge.llm_not_configured')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('ai_challenge.llm_config_message')}{' '}
                <Link to="/settings" className="text-primary underline underline-offset-2">
                  {t('ai_challenge.go_to_settings')}
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Difficulty Tabs */}
        <div className="flex gap-2 border-b border-primary/10 pb-4">
          {DIFFICULTY_TABS.map((diff) => (
            <Button
              key={diff}
              variant={activeDifficulty === diff ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveDifficulty(diff)}
              className={`font-mono text-xs uppercase tracking-widest ${
                activeDifficulty !== diff ? getDifficultyColor(diff).split(' ')[0] : ''
              }`}
            >
              {t(`scenarios.${diff.toLowerCase()}`, diff)}
            </Button>
          ))}
        </div>

        {/* Persona Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(personasByDifficulty[activeDifficulty] || []).map((persona) => (
            <button
              key={persona.id}
              onClick={() => isLLMConfigured ? startChat(persona) : toast.error(t('ai_challenge.llm_not_configured'))}
              className={`group relative overflow-hidden p-5 text-left glass-panel border border-white/5 hover:border-primary/40 transition-all duration-200 ${
                !isLLMConfigured ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-white/5'
              }`}
            >
              {/* Background icon */}
              <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                <Bot className="w-20 h-20" />
              </div>

              <div className="relative z-10 flex flex-col h-full gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className={`p-2 border ${getDifficultyColor(persona.difficulty)}`}>
                    <Shield className="w-4 h-4" />
                  </div>
                  <Badge variant={getDifficultyVariant(persona.difficulty)} className="text-[10px] uppercase tracking-widest">
                    {t(`scenarios.${persona.difficulty.toLowerCase()}`, persona.difficulty)}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-mono font-bold text-sm group-hover:text-primary transition-colors truncate">
                    {persona.name}
                  </h3>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mt-0.5 truncate">
                    {persona.category}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">
                  {persona.description}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-[10px] font-mono text-primary uppercase tracking-widest flex items-center gap-1">
                    {t('simulation.continue')} <Send className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Active Chat Screen ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto animate-in fade-in duration-500">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 glass-panel border-b border-primary/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`p-2 border ${getDifficultyColor(selectedPersona.difficulty)}`}>
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-mono font-bold text-sm">{selectedPersona.name}</h2>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
              {selectedPersona.category}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={resetGame} className="text-xs uppercase tracking-widest">
          <RefreshCw className="w-3 h-3 mr-2" /> {t('simulation.end_challenge')}
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4 scroll-smooth">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'system' ? (
              <div className="w-full text-center py-3">
                <span className="text-[10px] font-mono text-muted-foreground bg-black/40 px-3 py-1 border border-white/5">
                  {msg.content}
                </span>
              </div>
            ) : msg.role === 'user' ? (
              <div className="max-w-[75%] px-4 py-2.5 bg-primary/15 border border-primary/30 text-sm font-mono">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[75%] px-4 py-2.5 glass-panel border border-white/10 text-sm font-mono leading-relaxed">
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {/* Typing Indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="glass-panel border border-white/10 px-4 py-3 flex gap-1.5 items-center">
              {[0, 0.15, 0.3].map((delay, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Result Banners */}
      {gameStatus === 'won' && (
        <div className="flex items-center gap-3 p-4 border border-emerald-500/40 bg-emerald-500/10 flex-shrink-0">
          <Trophy className="w-6 h-6 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-mono font-bold text-sm text-emerald-400 uppercase tracking-widest">
              {t('simulation.attack_prevented')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">You identified and blocked the social engineering attempt.</p>
          </div>
          <Button size="sm" onClick={resetGame} variant="outline" className="ml-auto text-xs uppercase tracking-widest">
            {t('simulation.try_another')}
          </Button>
        </div>
      )}

      {gameStatus === 'lost' && (
        <div className="flex items-center gap-3 p-4 border border-red-500/40 bg-red-500/10 flex-shrink-0">
          <Skull className="w-6 h-6 text-red-400 flex-shrink-0" />
          <div>
            <p className="font-mono font-bold text-sm text-red-400 uppercase tracking-widest">
              {t('simulation.compromised')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">You revealed sensitive information. Study the debrief.</p>
          </div>
          <Button size="sm" onClick={resetGame} variant="outline" className="ml-auto text-xs uppercase tracking-widest">
            {t('simulation.try_another')}
          </Button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 p-4 border-t border-primary/20 flex-shrink-0">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={t('simulation.your_response') + '...'}
          disabled={gameStatus !== 'active' || loading}
          className="flex-1 font-mono text-sm"
          autoFocus
        />
        <Button
          type="submit"
          disabled={gameStatus !== 'active' || loading || !inputValue.trim()}
          className="px-4"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
