import { ContextualMessageAction, ChatMessage } from '../types';

/**
 * Creates a structured contextual message action.
 */
export function createContextualAction(
  config: Partial<ContextualMessageAction> & { label: string; actionText: string }
): ContextualMessageAction {
  return {
    label: config.label,
    actionText: config.actionText,
    destinationId: config.destinationId,
    targetId: config.targetId,
    category: config.category,
    description: config.description,
    intent: config.intent,
    payload: config.payload,
    icon: config.icon,
    variant: config.variant || 'default',
  };
}

/**
 * Creates a single contextual shortcut action array.
 * Designed for responses where one obvious action makes the user's next step faster/easier.
 * e.g. User asks "How do I open calculator?", AXON responds with [Open Calculator].
 */
export function createSingleActionShortcut(
  label: string,
  actionText: string,
  options?: Partial<ContextualMessageAction>
): ContextualMessageAction[] {
  return [
    createContextualAction({
      label,
      actionText,
      ...options,
    }),
  ];
}

/**
 * Creates a list of alternative contextual actions when multiple meaningful next steps exist.
 * e.g. [ Open ] [ View Details ] [ Cancel ]
 * or [ Retry ] [ Try Another Method ] [ Stop ]
 */
export function createAlternativeActions(
  actions: Array<Partial<ContextualMessageAction> & { label: string; actionText: string }>
): ContextualMessageAction[] {
  return actions.map((a) => createContextualAction(a));
}

/**
 * Creates a confirmation action pair (e.g. Confirm / Cancel).
 */
export function createConfirmationActions(
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  options?: {
    confirmActionText?: string;
    cancelActionText?: string;
    targetId?: string;
  }
): ContextualMessageAction[] {
  return [
    createContextualAction({
      label: confirmText,
      actionText: options?.confirmActionText || 'yes',
      intent: 'confirm',
      targetId: options?.targetId,
      variant: 'default',
    }),
    createContextualAction({
      label: cancelText,
      actionText: options?.cancelActionText || 'cancel',
      intent: 'cancel',
      targetId: options?.targetId,
      variant: 'secondary',
    }),
  ];
}

/**
 * Creates a navigation shortcut to a specific destination/screen.
 */
export function createNavigationShortcut(
  targetId: string,
  targetName: string,
  category?: string
): ContextualMessageAction {
  return createContextualAction({
    label: `Open ${targetName}`,
    actionText: `/open ${targetId}`,
    destinationId: targetId,
    targetId,
    category,
    intent: 'open',
    description: `Navigate to ${targetName}`,
  });
}

/**
 * Safely extracts contextual actions from a ChatMessage, checking both
 * the modern 'actions' property and the backwards-compatible 'commandOptions' property.
 */
export function getMessageActions(message?: ChatMessage | null): ContextualMessageAction[] {
  if (!message) return [];
  if (Array.isArray(message.actions) && message.actions.length > 0) {
    return message.actions;
  }
  if (Array.isArray(message.commandOptions) && message.commandOptions.length > 0) {
    return message.commandOptions;
  }
  return [];
}

export type { ContextualMessageAction };
