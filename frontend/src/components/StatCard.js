import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from './ui/card';

/**
 * Animated stat card for dashboards and analytics.
 * Counts up the value on mount for a smooth reveal effect.
 */
function useCountUp(target, duration = 800, enabled = true) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!enabled || typeof target !== 'number') {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration, enabled]);

  return value;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  colorClass = 'border-primary',
  textClass = 'text-foreground',
  animate = true,
}) {
  const numericValue = typeof value === 'number' ? value : null;
  const displayValue = useCountUp(numericValue ?? 0, 900, animate && numericValue !== null);

  return (
    <Card className={`glass-panel border-l-4 ${colorClass} hover:bg-white/5 transition-all duration-300 group`}>
      <CardContent className="p-4 md:p-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1 truncate">
            {label}
          </p>
          <p className={`text-2xl md:text-3xl font-bold font-mono tracking-tighter neon-text ${textClass}`}>
            {numericValue !== null ? displayValue : value}
            {suffix && <span className="text-sm ml-0.5 opacity-70">{suffix}</span>}
          </p>
        </div>
        {Icon && (
          <div className="p-2 md:p-3 rounded-none bg-background/50 border border-white/10 flex-shrink-0 group-hover:border-primary/30 transition-colors">
            <Icon className="w-5 h-5 md:w-6 md:h-6 text-white/60 group-hover:text-white/80 transition-colors" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
