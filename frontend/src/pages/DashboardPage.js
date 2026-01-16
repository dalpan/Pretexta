import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Activity, FileCode, ListChecks, Zap, Shield, Target, Clock, AlertTriangle } from 'lucide-react';
import { AI_PERSONAS } from '../data/aiPersonas';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DashboardPage() {
  const { t } = useTranslation();
  const [simulations, setSimulations] = useState([]);
  const [stats, setStats] = useState({ challenges: 0, quizzes: 0, simulations: 0, ai_personas: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('soceng_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [simsRes, challengesRes, quizzesRes] = await Promise.all([
        axios.get(`${API}/simulations`, { headers }),
        axios.get(`${API}/challenges`, { headers }),
        axios.get(`${API}/quizzes`, { headers })
      ]);

      const sims = Array.isArray(simsRes.data) ? simsRes.data : [];
      setSimulations(sims.slice(0, 5)); // Recent 5

      setStats({
        challenges: challengesRes.data.length,
        quizzes: quizzesRes.data.length,
        simulations: sims.length,
        ai_personas: AI_PERSONAS.length
      });
    } catch (error) {
      console.error('Failed to load dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, label, value, colorClass }) => (
    <Card className={`glass-panel border-l-4 ${colorClass} hover:bg-white/5 transition-all duration-300`}>
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">{label}</p>
          <p className="text-4xl font-bold font-mono text-foreground tracking-tighter neon-text">{value}</p>
        </div>
        <div className={`p-3 rounded-none bg-background/50 border border-white/10`}>
          <Icon className="w-8 h-8 text-white/80" />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-primary/20 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-6 h-6 text-primary animate-pulse-slow" />
            <span className="text-xs font-mono text-primary uppercase tracking-[0.2em]">System Online</span>
          </div>
          <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-primary">
            {t('dashboard.welcome')}
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-1 border-l-2 border-primary/50 pl-3">
            &gt; Ready for psychological operations.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/ai-challenge">
            <Button size="lg" className="neon-border">
              <Zap className="w-5 h-5 mr-2" /> INIT_SIMULATION
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Shield}
          label="AI Scenarios"
          value={stats.ai_personas}
          colorClass="border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
        />
        <StatCard
          icon={Target}
          label="Scenarios"
          value={stats.challenges}
          colorClass="border-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.2)]"
        />
        <StatCard
          icon={ListChecks}
          label="Quizzes"
          value={stats.quizzes}
          colorClass="border-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.2)]"
        />
        <StatCard
          icon={Activity}
          label="Logs"
          value={stats.simulations}
          colorClass="border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="lg:col-span-1 space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2 font-mono uppercase tracking-wider text-primary">
            <Zap className="w-5 h-5" /> Quick Actions
          </h2>
          <div className="grid gap-3">
            <Link to="/ai-challenge">
              <Button className="w-full justify-start h-14 text-lg font-semibold relative overflow-hidden group border-primary/50" variant="default">
                <div className="absolute inset-0 bg-primary/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
                <span className="relative z-10 flex items-center">
                  <Zap className="w-5 h-5 mr-3 text-primary-foreground" />
                  START_AI_OPS
                </span>
              </Button>
            </Link>
            <Link to="/scenarios">
              <Button className="w-full justify-start h-12" variant="outline">
                <Target className="w-5 h-5 mr-3" />
                BROWSE_SCENARIOS
              </Button>
            </Link>
            <Link to="/quizzes">
              <Button className="w-full justify-start h-12" variant="outline">
                <ListChecks className="w-5 h-5 mr-3" />
                TAKE_QUIZ
              </Button>
            </Link>
          </div>

          <div className="p-4 glass-panel border border-yellow-500/30 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10">
              <AlertTriangle className="w-16 h-16 text-yellow-500" />
            </div>
            <h3 className="font-semibold mb-2 text-sm text-yellow-500 uppercase tracking-widest flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Tip of the Day
            </h3>
            <p className="text-sm text-foreground/80 font-mono leading-relaxed">
              Use the new <span className="text-primary font-bold">AI Voice Clone</span> scenario to test deepfake defense mechanisms.
            </p>
          </div>
        </div>

        {/* Recent Simulations */}
        <div className="lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold font-mono uppercase tracking-wider text-primary flex items-center gap-2">
              <Activity className="w-5 h-5" /> Operation Logs
            </h2>
            <Link to="/simulations">
              <Button variant="ghost" size="sm" className="text-xs">VIEW_ALL_LOGS <Activity className="w-3 h-3 ml-2" /></Button>
            </Link>
          </div>

          <div className="space-y-4">
            {simulations.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center">
                <Activity className="w-12 h-12 mb-4 text-primary/30" />
                <p className="text-muted-foreground font-mono mb-4">No operations logged in database.</p>
                <Link to="/ai-challenge">
                  <Button variant="default">INIT_FIRST_OP</Button>
                </Link>
              </div>
            ) : (
              simulations.map((sim, i) => (
                <div
                  key={sim.id || i}
                  className="flex items-center justify-between p-4 glass-panel hover:bg-white/5 transition-all group border-l-2 border-l-transparent hover:border-l-primary"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`p-2 ${sim.completed_at ? 'bg-emerald-500/10 text-emerald-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                      {(sim.simulation_type === 'ai_challenge' || sim.type === 'ai_challenge') ? <Shield className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-bold text-foreground group-hover:text-primary transition-colors font-mono text-sm uppercase tracking-wide">
                        {sim.challenge_Title || sim.title || "Untitled Operation"}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" /> {new Date(sim.completed_at || sim.created_at || sim.started_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground uppercase block mb-1">Success Rate</span>
                      <span className={`font-mono font-bold text-xl ${sim.score >= 70 ? 'text-emerald-500 text-shadow-green' : 'text-orange-500'}`}>
                        {sim.score || 0}%
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}