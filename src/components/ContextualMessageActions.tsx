import React from 'react';
import { Eye, Check, Sparkles } from 'lucide-react';
import { ContextualMessageAction, ChatCommandOption } from '../types';

export interface ContextualMessageActionsProps {
  /** Optional contextual message actions */
  actions?: ContextualMessageAction[] | ChatCommandOption[] | null;
  /** Legacy command options collection for backwards compatibility */
  commandOptions?: ChatCommandOption[] | null;
  /** Message ID to scope stable element and button identifiers */
  messageId: string;
  /** Action click callback to dispatch the actionText through AXON's command/message pipeline */
  onActionClick: (actionText: string) => void;
}

/**
 * Smallest safe reusable rendering foundation for optional contextual message actions.
 * Renders nothing when actions/commandOptions are empty or undefined.
 * Preserves existing View Result visual language, categories/grouping, and actionText execution.
 */
export const ContextualMessageActions: React.FC<ContextualMessageActionsProps> = React.memo(({
  actions,
  commandOptions,
  messageId,
  onActionClick,
}) => {
  const actionsList = (actions && actions.length > 0) ? actions : commandOptions;
  if (!actionsList || actionsList.length === 0) return null;

  const renderActionButton = (opt: ContextualMessageAction | ChatCommandOption, optIdx: number) => {
    const buttonId = opt.destinationId
      ? `chat-cmd-opt-${opt.destinationId}`
      : `chat-action-btn-${messageId}-${opt.targetId || optIdx}`;
    const isSecondary = opt.variant === 'secondary';
    const isDanger = opt.variant === 'danger';
    const buttonStyle = isSecondary
      ? 'bg-neutral-200/90 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700'
      : isDanger
      ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/25'
      : 'bg-white text-black hover:bg-neutral-200';

    return (
      <button
        key={`cmd-opt-${messageId}-${opt.destinationId || opt.targetId || optIdx}`}
        id={buttonId}
        type="button"
        onClick={() => {
          onActionClick(opt.actionText);
        }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${buttonStyle} active:scale-95 transition-all text-xs font-semibold shadow-xs cursor-pointer`}
        title={opt.description || opt.label}
      >
        {opt.icon === 'eye' && <Eye className="w-3.5 h-3.5 shrink-0" />}
        {opt.icon === 'check' && <Check className="w-3.5 h-3.5 shrink-0" />}
        {opt.icon === 'sparkles' && <Sparkles className="w-3.5 h-3.5 shrink-0" />}
        <span>{opt.label}</span>
      </button>
    );
  };

  const hasCategories = actionsList.some((o) => Boolean(o.category));
  if (hasCategories) {
    const groups: { [cat: string]: (ContextualMessageAction | ChatCommandOption)[] } = {};
    for (const opt of actionsList) {
      const cat = opt.category || 'Destinations';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(opt);
    }

    return (
      <div className="mt-3 pt-2.5 border-t border-black/10 dark:border-white/10 space-y-3">
        {Object.entries(groups).map(([catName, opts]) => (
          <div key={catName} className="space-y-1.5">
            <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              {catName}
            </div>
            <div className="flex flex-wrap gap-2">
              {opts.map((opt, optIdx) => renderActionButton(opt, optIdx))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 pt-2.5 border-t border-black/10 dark:border-white/10 flex flex-wrap gap-2">
      {actionsList.map((opt, optIdx) => renderActionButton(opt, optIdx))}
    </div>
  );
});
