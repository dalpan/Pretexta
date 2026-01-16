import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Activity, TrendingUp, Calendar, Download, Eye, Filter, BarChart3, Trash2, Shield, AlertTriangle, CheckCircle2, Clock, Search, FolderOpen, FileText } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SimulationsPage() {
  const { t } = useTranslation();
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSimulation, setSelectedSimulation] = useState(null);

  useEffect(() => {
    loadSimulations();
  }, []);

  const loadSimulations = async () => {
    try {
      const token = localStorage.getItem('soceng_token');
      const response = await axios.get(`${API}/simulations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSimulations(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to load logs', error);
      toast.error('Failed to retrieve mission logs');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return "text-primary border-primary/50 bg-primary/10"; // Green/Primary
    if (score >= 60) return "text-yellow-500 border-yellow-500/50 bg-yellow-500/10";
    return "text-destructive border-destructive/50 bg-destructive/10"; // Red
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'ai_challenge': return <Shield className="w-4 h-4" />;
      case 'quiz': return <FileText className="w-4 h-4" />;
      case 'simulation': return <Activity className="w-4 h-4" />;
      default: return <FolderOpen className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleDateString();
  };

  const formatTime = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? "Invalid Time" : date.toLocaleTimeString();
  };

  const getResultLabel = (sim) => {
    const type = sim.simulation_type || sim.type;
    const score = sim.score || 0;

    // Logic for Scenarios and AI Challenges
    if (type === 'simulation' || type === 'ai_challenge' || type === 'scenarios') {
      if (score >= 95) return { label: "Perfect (Sempurna)", color: "text-primary border-primary bg-primary/20" };
      if (score >= 80) return { label: "Very Good (Sangat Bagus)", color: "text-primary border-green-500 bg-green-500/20" };
      if (score >= 50) return { label: "Good (Bagus)", color: "text-yellow-500 border-yellow-500 bg-yellow-500/20" };
      return { label: "Poor (Tidak Bagus)", color: "text-destructive border-destructive bg-destructive/20" };
    }

    // Logic for Quizzes
    if (type === 'quiz') {
      // Fallback if metadata is missing
      if (!sim.metadata || !sim.metadata.total_questions) {
        return {
          label: score >= 70 ? "PASSED" : "FAILED",
          color: score >= 70 ? "text-primary border-primary bg-primary/20" : "text-destructive border-destructive bg-destructive/20"
        };
      }

      const correct = sim.metadata.correct_count;
      const total = sim.metadata.total_questions;
      const wrong = total - correct;

      return {
        label: `Correct: ${correct} / Wrong: ${wrong}`,
        color: "text-blue-400 border-blue-400 bg-blue-400/20"
      };
    }

    return { label: score >= 70 ? "PASSED" : "FAILED", color: "text-muted-foreground" };
  };

  const filteredSimulations = simulations.filter(s => {
    if (filterType !== 'all' && (s.simulation_type || s.type) !== filterType) return false;
    if (searchTerm) {
      const title = s.challenge_Title || s.title || "Untitled";
      if (!title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

  if (loading) return <div className="flex h-screen items-center justify-center"><Activity className="animate-spin w-10 h-10 text-primary" /></div>;

  return (
    <div className="container mx-auto p-6 max-w-7xl animate-in fade-in space-y-8">
      {/* Global Scanline Overlay handled in Layout, but we can add specific page effects */}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-primary/20">
        <div>
          <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-primary" data-text="MISSION_LOGS">
            MISSION_LOGS
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs">&gt; DECLASSIFIED OPERATIONAL HISTORY</p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-primary/70" />
            <input
              type="text"
              placeholder="SEARCH_LOGS..."
              className="w-full bg-black/40 border border-primary/30 rounded-none pl-9 pr-4 py-2 text-sm focus:border-primary text-primary font-mono outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={loadSimulations} className="rounded-none border-primary/30 hover:bg-primary/10 text-primary">
            <Activity className="w-4 h-4 mr-2" /> SYNC
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* List Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {['all', 'ai_challenge', 'quiz', 'simulation'].map(type => (
              <Button
                key={type}
                variant={filterType === type ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilterType(type)}
                className={`capitalize rounded-none font-mono text-xs ${filterType === type ? 'neon-border bg-primary/20 text-primary' : 'text-muted-foreground hover:text-primary'}`}
              >
                {type.replace('_', ' ')}
              </Button>
            ))}
          </div>

          {filteredSimulations.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-primary/20 bg-black/20">
              <FolderOpen className="w-12 h-12 text-primary/30 mx-auto mb-3" />
              <p className="text-primary/50 font-mono">NO_DATA_FOUND</p>
            </div>
          ) : (
            filteredSimulations.map((sim, idx) => (
              <div
                key={sim.id || idx}
                className={`p-4 cursor-pointer transition-all glass-panel group relative border-l-[3px] ${selectedSimulation?.id === sim.id
                  ? 'border-l-primary bg-primary/10'
                  : 'border-l-transparent hover:border-l-primary/50 hover:bg-white/5'
                  }`}
                onClick={() => setSelectedSimulation(sim)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-none border ${getScoreColor(sim.score || 0)}`}>
                      {getTypeIcon(sim.simulation_type || sim.type)}
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground font-mono uppercase tracking-wide group-hover:text-primary transition-colors text-sm">
                        {sim.title || sim.challenge_Title || "CLASSIFIED_MISSION"}
                      </h3>
                      <div className="flex gap-3 mt-1 items-center text-[10px] text-muted-foreground font-mono">
                        <span className="uppercase text-primary/70 border border-primary/20 px-1">{sim.difficulty || 'NOR'}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(sim.completed_at || sim.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[10px] font-bold px-2 py-0.5 border ${sim.status === 'completed' ? 'text-green-500 border-green-500/30' : 'text-yellow-500 border-yellow-500/30'}`}>
                      {sim.status === 'completed' ? 'COMPLETED' : 'IN_PROGRESS'}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Details Column */}
        <div className="lg:col-span-1">
          {selectedSimulation ? (
            <div className="sticky top-6 glass-panel border border-primary/30 animate-in slide-in-from-right-10 duration-500">
              <div className="p-6 border-b border-primary/20 bg-black/40 relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-white/[0.02]" />
                <h2 className="text-lg font-bold mb-4 font-mono text-primary uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> MISSION_DEBRIEF
                </h2>

                <h3 className="text-xl font-bold text-white mb-4">{selectedSimulation.challenge_Title || "Mission Detail"}</h3>

                <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm font-mono">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Type</span>
                    <span className="capitalize text-foreground">{selectedSimulation.simulation_type || selectedSimulation.type}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Mode</span>
                    <span className="capitalize text-foreground">{selectedSimulation.challenge_type || "Standard"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Timestamp</span>
                    <span className="text-foreground">{formatTime(selectedSimulation.completed_at || selectedSimulation.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Status</span>
                    <span className={selectedSimulation.score >= 70 ? 'text-green-500' : 'text-red-500'}>
                      {selectedSimulation.score >= 70 ? 'SUCCESS' : 'FAILURE'}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10">
                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider mb-2">Performance Result</span>
                  <div className={`p-3 border text-center font-bold uppercase tracking-widest ${getResultLabel(selectedSimulation).color}`}>
                    {getResultLabel(selectedSimulation).label}
                  </div>
                </div>
              </div>

              <div className="p-6 max-h-[50vh] overflow-y-auto space-y-4 custom-scrollbar">
                <h3 className="font-bold flex items-center gap-2 text-sm uppercase font-mono text-primary/80">
                  <FileText className="w-4 h-4" /> Tactical Log
                </h3>
                {/* AI Challenge Results */}
                {(selectedSimulation.simulation_type === 'ai_challenge' || selectedSimulation.type === 'ai_challenge') && selectedSimulation.evaluation_results ? (
                  Object.entries(selectedSimulation.evaluation_results).map(([qid, res], i) => (
                    <div key={i} className={`text-xs p-3 border-l-2 ${res.isCorrect ? 'border-l-green-500 bg-green-500/5' : 'border-l-red-500 bg-red-500/5'}`}>
                      <div className="font-semibold mb-1 text-primary">Sequence {i + 1}</div>
                      <p className="text-muted-foreground mb-2 font-mono leading-relaxed">{res.feedback}</p>
                      <div className={`text-[10px] font-mono uppercase ${res.isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                        {res.isCorrect ? '>> THREAT_NEUTRALIZED' : '>> DEFENSE_BREACHED'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground font-mono p-4 border border-dashed border-white/10 text-center">
                    NO_TACTICAL_DATA_AVAILABLE
                  </div>
                )}
              </div>

              <div className="p-4 bg-black/60 border-t border-primary/20 flex justify-end">
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs uppercase" onClick={async () => {
                  if (!window.confirm("CONFIRM_DELETION: This action cannot be undone.")) return;
                  try {
                    await axios.delete(`${API}/simulations/${selectedSimulation.id}`, {
                      headers: { Authorization: `Bearer ${localStorage.getItem('soceng_token')}` }
                    });
                    setSimulations(prev => prev.filter(s => s.id !== selectedSimulation.id));
                    setSelectedSimulation(null);
                    toast.success("LOG_PURGED");
                  } catch (e) { toast.error("PURGE_FAILED"); }
                }}>
                  <Trash2 className="w-3 h-3 mr-2" /> PURGE_RECORD
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-primary/30 border border-dashed border-primary/30 bg-primary/5">
              <div className="text-center">
                <Activity className="w-12 h-12 mx-auto mb-2 opacity-50 animate-pulse-slow" />
                <p className="font-mono text-xs uppercase tracking-widest">AWAITING_SELECTION</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
