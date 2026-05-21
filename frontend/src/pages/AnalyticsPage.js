import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, TrendingUp, Target, Brain, PieChart, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart as RePieChart, Pie, Cell,
} from 'recharts';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import SectionCard from '../components/SectionCard';
import RiskVector from '../components/RiskVector';
import { useApi } from '../hooks/useApi';

const COLORS = ['#90EE90', '#3B82F6', '#A855F7', '#EC4899', '#F59E0B', '#06B6D4'];

const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#0f1419',
  border: '1px solid rgba(0,229,255,0.2)',
  fontFamily: 'monospace',
  fontSize: 11,
  borderRadius: 0,
};

const CHART_TICK = { fill: '#888', fontSize: 10, fontFamily: 'monospace' };

function ChartCard({ icon: Icon, title, children }) {
  return (
    <Card className="glass-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs uppercase tracking-widest flex items-center gap-2 text-primary">
          {Icon && <Icon className="w-4 h-4" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { data, loading, error } = useApi('/analytics/personal');
  const { data: riskProfileRaw } = useApi('/risk-profile/me');

  // Null-safe: riskProfile might not exist yet for new users
  const riskProfile = riskProfileRaw ?? null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-primary font-mono animate-pulse">LOADING_DATA...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8 animate-in fade-in duration-700">
        <PageHeader icon={BarChart3} title={t('analytics.title')} description={t('analytics.page_description')} />
        <EmptyState icon={BarChart3} title={t('errors.network')} description={error} />
      </div>
    );
  }

  if (!data || data.total_simulations === 0) {
    return (
      <div className="space-y-8 animate-in fade-in duration-700">
        <PageHeader icon={BarChart3} title={t('analytics.title')} description={t('analytics.page_description')} />
        <EmptyState
          icon={BarChart3}
          title={t('analytics.no_data').split('.')[0]}
          description={t('analytics.no_data')}
        />
      </div>
    );
  }

  // Prepare chart data
  const pieData = Object.entries(data.type_distribution || {}).map(([key, value]) => ({
    name: key.replace(/_/g, ' '),
    value,
  }));

  const difficultyData = Object.entries(data.difficulty_breakdown || {}).map(([key, val]) => ({
    name: t(`scenarios.${key}`, key.charAt(0).toUpperCase() + key.slice(1)),
    avg_score: Math.round(val.avg_score),
    count: val.count,
  }));

  const improvementPositive = (data.improvement_rate ?? 0) >= 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <PageHeader icon={BarChart3} title={t('analytics.title')} description={t('analytics.page_description')} />

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          icon={Target}
          label={t('analytics.total_missions')}
          value={data.total_simulations}
          colorClass="border-primary shadow-[0_0_8px_rgba(0,229,255,0.1)]"
          textClass="text-primary"
        />
        <StatCard
          icon={BarChart3}
          label={t('analytics.avg_score')}
          value={data.avg_score}
          suffix="%"
          colorClass="border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.15)]"
          textClass="text-blue-400"
        />
        <StatCard
          icon={TrendingUp}
          label={t('analytics.improvement')}
          value={Math.abs(data.improvement_rate ?? 0)}
          suffix="%"
          colorClass={improvementPositive ? 'border-emerald-500' : 'border-red-500'}
          textClass={improvementPositive ? 'text-emerald-400' : 'text-red-400'}
        />
        <StatCard
          icon={Brain}
          label="Cialdini"
          value={`${Object.keys(data.cialdini_radar || {}).length}/6`}
          animate={false}
          colorClass="border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.15)]"
          textClass="text-purple-400"
        />
      </div>

      {/* Risk Profile — the primary behavioral view */}
      {riskProfile && (
        <SectionCard title={t('analytics.cialdini_radar')} icon={Shield}>
          <RiskVector
            vector={riskProfile.current_vector}
            baseline={riskProfile.baseline_vector}
            trend={riskProfile.trend}
            mode="both"
          />
          {riskProfile.recommendations?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5 space-y-1.5">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">
                Training Recommendations
              </p>
              {riskProfile.recommendations.map((rec, i) => (
                <p key={i} className="text-xs font-mono text-foreground/70 leading-relaxed pl-3 border-l border-primary/20">
                  {rec}
                </p>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Score Over Time */}
        {data.score_over_time?.length > 0 && (
          <ChartCard icon={TrendingUp} title={t('analytics.performance_trend')}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.score_over_time}>
                <XAxis
                  dataKey="date"
                  tick={CHART_TICK}
                  tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                />
                <YAxis domain={[0, 100]} tick={CHART_TICK} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(val) => [`${val}%`, t('analytics.score')]}
                  labelFormatter={(v) => new Date(v).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#00e5ff"
                  strokeWidth={1.5}
                  dot={{ fill: '#00e5ff', r: 2.5 }}
                  activeDot={{ r: 4, fill: '#00e5ff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Difficulty Breakdown */}
        {difficultyData.length > 0 && (
          <ChartCard icon={Target} title={t('analytics.difficulty_breakdown')}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={difficultyData} barSize={28}>
                <XAxis dataKey="name" tick={CHART_TICK} />
                <YAxis domain={[0, 100]} tick={CHART_TICK} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(val, name) => [
                    name === 'avg_score' ? `${val}%` : val,
                    name === 'avg_score' ? t('analytics.avg_score') : t('analytics.count'),
                  ]}
                />
                <Bar dataKey="avg_score" fill="#00e5ff" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Type Distribution */}
        {pieData.length > 0 && (
          <ChartCard icon={PieChart} title={t('analytics.type_distribution')}>
            <ResponsiveContainer width="100%" height={240}>
              <RePieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} fillOpacity={0.8} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              </RePieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
