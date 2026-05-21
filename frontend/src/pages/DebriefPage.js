import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileSearch, Brain, AlertTriangle, CheckCircle2, ArrowLeft, Sparkles, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import api from '../services/api';

export default function DebriefPage() {
  const { t } = useTranslation();
  const { simulationId } = useParams();
  const [debrief, setDebrief] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { loadDebrief(); }, [simulationId]);

  const loadDebrief = async () => {
    try {
      const response = await api.get(`/debrief/${simulationId}`);
      setDebrief(response.data);
    } catch (error) {
      console.error('Failed to load debrief', error);
    } finally {
      setLoading(false);
    }
  };

  const requestAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const response = await api.post(`/debrief/${simulationId}/ai-analysis`, {});
      setAiAnalysis(response.data.ai_analysis);
    } catch (error) {
      console.error('AI analysis failed', error);
    } finally {
      setAiLoading(false);
    }
  };

  const getRatingColor = (rating) => {
    const colors = { excellent: 'text-green-400', good: 'text-blue-400', fair: 'text-yellow-400', needs_improvement: 'text-red-400' };
    return colors[rating] || 'text-muted-foreground';
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="text-primary font-mono animate-pulse">ANALYZING...</div></div>;
  if (!debrief) return <div className="text-center py-12 text-muted-foreground font-mono">DEBRIEF NOT FOUND</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center gap-4 border-b border-primary/20 pb-6">
        <Link to="/simulations"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-primary flex items-center gap-3">
            <FileSearch className="w-8 h-8" /> MISSION DEBRIEF
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">{debrief.title}</p>
        </div>
      </div>

      {/* Score Overview */}
      <Card className="glass-panel border-primary/30">
        <CardContent className="p-8 text-center">
          <p className="text-6xl font-bold font-mono text-primary mb-2">{debrief.score}%</p>
          <p className={`text-lg font-mono uppercase tracking-widest ${getRatingColor(debrief.rating)}`}>
            {debrief.rating?.replace('_', ' ')}
          </p>
          <p className="text-sm text-muted-foreground mt-4 max-w-lg mx-auto">{debrief.summary}</p>
          <div className="flex justify-center gap-8 mt-6">
            <div>
              <p className="text-2xl font-mono text-green-400">{debrief.correct_actions}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Correct</p>
            </div>
            <div>
              <p className="text-2xl font-mono text-red-400">{debrief.incorrect_actions}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Incorrect</p>
            </div>
            <div>
              <p className="text-2xl font-mono">{debrief.total_events}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Total Events</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cialdini Analysis */}
      {debrief.cialdini_analysis?.length > 0 && (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase tracking-widest flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" /> PSYCHOLOGICAL TECHNIQUES USED
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {debrief.cialdini_analysis.map((item) => (
              <div key={item.principle} className="p-3 border-l-2 border-l-primary bg-primary/5">
                <h4 className="font-mono font-bold text-sm capitalize text-primary">{item.principle}</h4>
                <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Key Moments */}
      {debrief.key_moments?.length > 0 && (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase tracking-widest">KEY MOMENTS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {debrief.key_moments.map((moment, idx) => (
              <div key={idx} className={`p-3 border-l-2 ${moment.was_correct ? 'border-l-green-500 bg-green-500/5' : 'border-l-red-500 bg-red-500/5'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {moment.was_correct ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
                  <span className="font-mono text-sm capitalize">{moment.action}</span>
                </div>
                <p className="text-xs text-muted-foreground">{moment.tip}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {debrief.recommendations?.length > 0 && (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase tracking-widest">RECOMMENDATIONS</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {debrief.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-primary font-mono">{'>'}</span>
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* AI Deep Analysis */}
      <Card className="glass-panel">
        <CardContent className="p-6 text-center">
          {aiAnalysis ? (
            <div className="text-left">
              <h3 className="font-mono text-primary font-bold mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> AI ANALYSIS
              </h3>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-black/30 p-4 border border-white/10 max-h-64 overflow-y-auto">
                {aiAnalysis}
              </pre>
            </div>
          ) : (
            <>
              <Sparkles className="w-8 h-8 text-primary/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">Get AI-powered deep analysis of your performance</p>
              <Button onClick={requestAiAnalysis} disabled={aiLoading} variant="outline">
                <Sparkles className="w-4 h-4 mr-2" />
                {aiLoading ? 'ANALYZING...' : 'REQUEST AI ANALYSIS'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
