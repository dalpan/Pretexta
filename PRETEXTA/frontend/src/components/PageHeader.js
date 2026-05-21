import React from 'react';

/**
 * Consistent page-level header used across all feature pages.
 * Supports an icon, title, subtitle/description line, and optional action slot.
 */
export default function PageHeader({ icon: Icon, title, description, badge, children }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-primary/20 pb-6 mb-8">
      <div>
        {badge && (
          <div className="flex items-center gap-2 mb-2">
            {badge}
          </div>
        )}
        <h1 className="text-xl md:text-3xl font-bold font-mono uppercase tracking-widest text-primary flex items-center gap-3">
          {Icon && <Icon className="w-7 h-7 flex-shrink-0" />}
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground font-mono text-sm mt-1.5 border-l-2 border-primary/40 pl-3">
            &gt; {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
