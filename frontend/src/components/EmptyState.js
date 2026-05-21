import React from 'react';
import { Button } from './ui/button';

/**
 * Consistent empty state component used when a list or dataset is empty.
 * Replaces ad-hoc empty states scattered across pages.
 */
export default function EmptyState({ icon: Icon, title, description, action, actionLabel }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 border border-dashed border-primary/25 bg-primary/3 text-center px-6">
      {Icon && (
        <div className="p-4 rounded-none border border-primary/20 bg-primary/5 mb-5">
          <Icon className="w-10 h-10 text-primary/40" />
        </div>
      )}
      <h3 className="font-mono font-bold text-primary uppercase tracking-widest text-sm mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-muted-foreground font-mono text-xs max-w-xs leading-relaxed mb-6">
          {description}
        </p>
      )}
      {action && actionLabel && (
        <Button variant="default" onClick={action} className="text-xs uppercase tracking-widest">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
