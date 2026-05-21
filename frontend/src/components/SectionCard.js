import React from 'react';

/**
 * Consistent section wrapper for grouped content blocks.
 * Replaces the varying `glass-panel p-6 space-y-4` patterns across pages.
 */
export default function SectionCard({ title, icon: Icon, actions, children, className = '' }) {
  return (
    <div className={`glass-panel p-5 md:p-6 space-y-4 ${className}`}>
      {(title || Icon || actions) && (
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-primary flex-shrink-0" />}
            {title && (
              <h3 className="font-mono font-bold text-xs uppercase tracking-widest text-primary">
                {title}
              </h3>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
