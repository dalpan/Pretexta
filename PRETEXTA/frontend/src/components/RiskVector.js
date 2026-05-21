import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  Tooltip,
} from 'recharts';

/**
 * RiskVector
 *
 * Visualizes a user's multi-dimensional susceptibility profile across
 * the 6 Cialdini principles.
 *
 * Scale: 0 = fully susceptible, 100 = fully resistant.
 *
 * Usage:
 *   <RiskVector vector={profile.current_vector} baseline={profile.baseline_vector} />
 */

const DIMENSION_LABELS = {
  reciprocity:   'Reciprocity',
  scarcity:      'Scarcity',
  authority:     'Authority',
  commitment:    'Commitment',
  liking:        'Liking',
  social_proof:  'Social Proof',
};

const DIMENSION_ORDER = [
  'authority', 'scarcity', 'reciprocity',
  'commitment', 'liking', 'social_proof',
];

function getRiskColor(value) {
  if (value >= 70) return '#10b981'; // emerald — resistant
  if (value >= 45) return '#f59e0b'; // amber — moderate
  return '#ef4444';                  // red — susceptible
}

function getRiskLabel(value) {
  if (value >= 70) return 'Resistant';
  if (value >= 45) return 'Moderate';
  return 'At Risk';
}

function DimensionBar({ label, value, baseline, trend }) {
  const color = getRiskColor(value);
  const riskLabel = getRiskLabel(value);

  const trendIcon = trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→';
  const trendColor = trend === 'improving'
    ? 'text-emerald-400'
    : trend === 'declining' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-2">
          {trend && (
            <span className={`text-[10px] ${trendColor}`} title={trend}>
              {trendIcon}
            </span>
          )}
          <span style={{ color }} className="font-bold">{value.toFixed(0)}</span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="h-1.5 bg-black/40 border border-white/5 overflow-hidden relative">
        {/* Baseline indicator */}
        {baseline !== undefined && (
          <div
            className="absolute top-0 h-full w-0.5 bg-white/20 z-10"
            style={{ left: `${baseline}%` }}
          />
        )}
        {/* Current value bar */}
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${value}%`, backgroundColor: color, opacity: 0.75 }}
        />
      </div>
      <p className="text-[9px] font-mono" style={{ color }}>{riskLabel}</p>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#0f1419',
  border: '1px solid rgba(0,229,255,0.15)',
  fontFamily: 'monospace',
  fontSize: 10,
};

export default function RiskVector({
  vector,
  baseline,
  trend = {},
  mode = 'bars', // 'bars' | 'radar' | 'both'
  compact = false,
}) {
  if (!vector) {
    return (
      <div className="flex items-center justify-center py-8 text-xs font-mono text-muted-foreground">
        No risk data available. Complete simulations to build your profile.
      </div>
    );
  }

  const radarData = DIMENSION_ORDER.map((key) => ({
    dimension: DIMENSION_LABELS[key],
    value: Math.round(vector[key] ?? 50),
    baseline: baseline ? Math.round(baseline[key] ?? 50) : undefined,
    fullMark: 100,
  }));

  const averageResistance = Math.round(
    DIMENSION_ORDER.reduce((sum, k) => sum + (vector[k] ?? 50), 0) / DIMENSION_ORDER.length
  );

  if (compact) {
    return (
      <div className="space-y-2">
        {DIMENSION_ORDER.map((key) => (
          <DimensionBar
            key={key}
            label={DIMENSION_LABELS[key]}
            value={vector[key] ?? 50}
            baseline={baseline?.[key]}
            trend={trend[key]}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">
            Average Resistance
          </p>
          <p
            className="text-3xl font-bold font-mono"
            style={{ color: getRiskColor(averageResistance) }}
          >
            {averageResistance}
            <span className="text-sm ml-1 text-muted-foreground font-normal">/ 100</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">
            Status
          </p>
          <p
            className="text-sm font-mono font-bold uppercase tracking-wider"
            style={{ color: getRiskColor(averageResistance) }}
          >
            {getRiskLabel(averageResistance)}
          </p>
        </div>
      </div>

      {/* Radar + Bars */}
      {(mode === 'radar' || mode === 'both') && (
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fill: '#888', fontSize: 9, fontFamily: 'monospace' }}
            />
            {baseline && (
              <Radar
                name="Baseline"
                dataKey="baseline"
                stroke="rgba(255,255,255,0.2)"
                fill="rgba(255,255,255,0.04)"
                strokeWidth={1}
                strokeDasharray="4 2"
              />
            )}
            <Radar
              name="Current"
              dataKey="value"
              stroke="#00e5ff"
              fill="#00e5ff"
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          </RadarChart>
        </ResponsiveContainer>
      )}

      {(mode === 'bars' || mode === 'both') && (
        <div className="space-y-3">
          {DIMENSION_ORDER.map((key) => (
            <DimensionBar
              key={key}
              label={DIMENSION_LABELS[key]}
              value={vector[key] ?? 50}
              baseline={baseline?.[key]}
              trend={trend[key]}
            />
          ))}
        </div>
      )}

      {/* Interpretation */}
      <p className="text-[10px] font-mono text-muted-foreground leading-relaxed border-l border-primary/20 pl-3">
        Higher scores mean stronger resistance to that influence technique.
        Complete targeted simulations to improve low-scoring dimensions.
      </p>
    </div>
  );
}
