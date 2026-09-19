import { ScreenId } from '../types';
import {
  resolveInterfaceFromQuery,
  discoverAvailableInterfaces,
  InterfaceMetadata,
} from './interfaceRegistry';
import { tryEvaluateMathExpression } from './storageChatHandler';

export interface CommandRouterActions {
  navigateTo: (
    screen: ScreenId,
    options?: {
      panel?: string | null;
      payload?: any;
      preserveMenu?: boolean;
      screenState?: Record<string, any>;
    }
  ) => void;
}

export interface CommandExecutionResult {
  handled: boolean;
  executed?: boolean;
  response: string;
  targetScreen?: ScreenId;
  commandName?: string;
  modelUsed?: string;
}

/**
 * Evaluates chat input for supported AXON application commands.
 * Resolves targets via existing registries and invokes supplied application actions.
 */
export function evaluateChatCommand(
  input: string,
  actions: CommandRouterActions,
  currentScreen?: ScreenId
): CommandExecutionResult {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return { handled: false, response: '' };
  }

  // 1. Explicit slash command: /open [target]
  if (/^\/open(?:\s|$)/i.test(trimmed)) {
    const rawTarget = trimmed.replace(/^\/open/i, '').trim();
    return handleOpenCommand(rawTarget, actions, currentScreen, true);
  }

  // 2. Natural language navigation forms: "open <target>", "go to <target>", "navigate to <target>"
  const naturalMatch = trimmed.match(
    /^(?:please\s+)?(?:open|go\s+to|navigate\s+to)\s+([a-z0-9_\-\s]+)$/i
  );
  if (naturalMatch && naturalMatch[1]) {
    const candidateTarget = naturalMatch[1].trim();
    return handleOpenCommand(candidateTarget, actions, currentScreen, false);
  }

  // 3. Fast-path offline arithmetic calculation (reusing existing tryEvaluateMathExpression)
  const mathResult = tryEvaluateMathExpression(trimmed);
  if (mathResult) {
    return {
      handled: true,
      executed: true,
      response: mathResult,
      commandName: 'math',
      modelUsed: 'AXON Offline Calculator Engine',
    };
  }

  return { handled: false, response: '' };
}

/**
 * Handles the "/open <target>" navigation command using AXON's interface registry.
 */
function handleOpenCommand(
  rawTarget: string,
  actions: CommandRouterActions,
  currentScreen?: ScreenId,
  isExplicit: boolean = true
): CommandExecutionResult {
  // Case A: Missing target (e.g. "/open" with no target)
  if (!rawTarget) {
    if (!isExplicit) {
      return { handled: false, response: '' };
    }
    return {
      handled: true,
      executed: false,
      response:
        'Please specify an interface to open.\n\nExamples:\n- `/open settings`\n- `/open tools`\n- `/open code`\n- `/open notes`\n- `/open storage`\n- `/open automation`',
      commandName: '/open',
    };
  }

  // Case B: Resolve target using existing interfaceRegistry
  const resolution = resolveInterfaceFromQuery(rawTarget, currentScreen);

  // Intent to open all screens at once cannot map to a single navigation screen
  if (resolution.isAll) {
    if (!isExplicit) {
      return { handled: false, response: '' };
    }
    return {
      handled: true,
      executed: false,
      response:
        'Cannot navigate to multiple interfaces simultaneously. Please specify a single interface (e.g. `/open settings` or `/open tools`).',
      commandName: '/open',
    };
  }

  // Case C: Confident match found
  if (resolution.match && !resolution.isAmbiguous) {
    const targetRoute = resolution.match.route as ScreenId;
    if (targetRoute) {
      actions.navigateTo(targetRoute, {
        screenState: resolution.match.subState,
      });

      return {
        handled: true,
        executed: true,
        response: `Opened **${resolution.match.name}**.`,
        targetScreen: targetRoute,
        commandName: '/open',
      };
    }
  }

  // If this is natural language and not a confident match, do NOT hijack conversation
  if (!isExplicit) {
    return { handled: false, response: '' };
  }

  // Case D: Explicit /open was used, but resolution was ambiguous or unrecognized
  if (resolution.candidates && resolution.candidates.length > 0) {
    const candidateList = resolution.candidates
      .slice(0, 5)
      .map((c) => `- **${c.name}** (\`/open ${c.id}\`)`)
      .join('\n');

    return {
      handled: true,
      executed: false,
      response: `Could not uniquely identify an interface for "${rawTarget}".\n\nDid you mean one of these?\n${candidateList}`,
      commandName: '/open',
    };
  }

  // Case E: Completely unrecognized target
  return {
    handled: true,
    executed: false,
    response: `Unrecognized interface "${rawTarget}".\n\nSupported interfaces include: Settings (\`/open settings\`), Tools (\`/open tools\`), Code Editor (\`/open code\`), Project Notes (\`/open notes\`), Storage (\`/open storage\`), Automation (\`/open automation\`).`,
    commandName: '/open',
  };
}
