import { ScreenId, ChatCommandOption } from '../types';
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
  options?: ChatCommandOption[];
}

export interface PendingChoiceState {
  command: string;
  promptType: 'confirm' | 'select';
  target?: InterfaceMetadata;
  candidates?: InterfaceMetadata[];
  timestamp: number;
}

// In-memory pending-choice state surviving between consecutive chat messages
let activePendingChoice: PendingChoiceState | null = null;

export const PENDING_CHOICE_EXPIRATION_MS = 60000;

export function getPendingChoice(): PendingChoiceState | null {
  if (
    activePendingChoice &&
    (typeof activePendingChoice.timestamp !== 'number' ||
      Date.now() - activePendingChoice.timestamp >= PENDING_CHOICE_EXPIRATION_MS)
  ) {
    activePendingChoice = null;
  }
  return activePendingChoice;
}

export function setPendingChoice(choice: PendingChoiceState | null): void {
  activePendingChoice = choice;
}

export function clearPendingChoice(): void {
  activePendingChoice = null;
}

/**
 * Checks if input represents confirmation intent relative to a pending target.
 */
function isConfirmationIntent(input: string, target?: InterfaceMetadata): boolean {
  const norm = input.trim().toLowerCase();

  // Affirmation words and short phrases
  const affirmationRegex =
    /^(?:yes|yeah|yep|yup|yea|sure|okay|ok|correct|right|that'?s\s+right|that'?s\s+the\s+one|that\s+one|this\s+one|open\s+it|go\s+there|take\s+me\s+there|do\s+it|proceed|confirm|sounds\s+good|affirmative|please|the\s+first\s+one|first\s+one|number\s+1|1)(?:[!.?,]|\s+.*)?$/i;

  if (affirmationRegex.test(norm)) {
    return true;
  }

  // Compound affirmations like "yes, source", "yeah open it", "sure, take me there"
  if (/^(?:yes|yeah|sure|okay|ok)[,\s]+.+/i.test(norm)) {
    return true;
  }

  if (target) {
    const targetName = target.name.toLowerCase();
    const cleanName = targetName.replace(/^axon\s+/i, '').trim();
    const targetId = target.id.toLowerCase();

    // Direct reference to the target or its clean name
    if (
      norm === targetName ||
      norm === cleanName ||
      norm === targetId ||
      norm === `open ${cleanName}` ||
      norm === `open ${targetName}` ||
      norm === `go to ${cleanName}` ||
      norm === `go to ${targetName}` ||
      norm === `i mean ${targetName}` ||
      norm === `i mean ${cleanName}`
    ) {
      return true;
    }

    // Matching any of the target's distinctive keywords
    for (const kw of target.keywords) {
      const kwLower = kw.toLowerCase();
      if (norm === kwLower || norm === `open ${kwLower}` || norm === `go to ${kwLower}`) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if input represents rejection or cancellation intent.
 */
function isRejectionIntent(input: string): { isRejection: boolean; newTarget?: string } {
  const norm = input.trim().toLowerCase();

  // Check for rejection followed by new command: "no, Tools", "no, open Tools", "actually open Code", "instead open settings"
  const correctionMatch = norm.match(
    /^(?:no|nope|nah)[,\s]+(?:actually\s+)?(?:open\s+|go\s+to\s+)?(.+)$/i
  );
  if (correctionMatch && correctionMatch[1]) {
    return { isRejection: true, newTarget: correctionMatch[1].trim() };
  }

  const actuallyMatch = norm.match(/^(?:actually|instead)[,\s]+(?:open\s+|go\s+to\s+)?(.+)$/i);
  if (actuallyMatch && actuallyMatch[1]) {
    return { isRejection: true, newTarget: actuallyMatch[1].trim() };
  }

  // Pure rejection
  if (/^(?:no|nope|nah|cancel|nevermind|never\s+mind|stop|neither|none|none\s+of\s+these)[!.?,]*$/i.test(norm)) {
    return { isRejection: true };
  }

  return { isRejection: false };
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

  // -------------------------------------------------------------
  // 0. Check Pending Choice State (Awaiting Confirmation or Selection)
  // -------------------------------------------------------------
  const pending = getPendingChoice();
  if (pending) {
    // Check if user is issuing a rejection or redirection
    const rejectionCheck = isRejectionIntent(trimmed);
    if (rejectionCheck.isRejection) {
      clearPendingChoice();
      if (rejectionCheck.newTarget) {
        // Evaluate the newly specified destination immediately
        return handleOpenCommand(rejectionCheck.newTarget, actions, currentScreen, true);
      }
      return {
        handled: true,
        executed: false,
        response: 'Navigation cancelled.',
        commandName: '/open',
      };
    }

    // Check if user is confirming a pending single target
    if (pending.promptType === 'confirm' && pending.target) {
      if (isConfirmationIntent(trimmed, pending.target)) {
        const target = pending.target;
        clearPendingChoice();
        actions.navigateTo(target.route as ScreenId, {
          screenState: target.subState,
        });
        return {
          handled: true,
          executed: true,
          response: `Opened **${target.name}**.`,
          targetScreen: target.route as ScreenId,
          commandName: '/open',
        };
      }
    }

    // Check if user is selecting from multiple candidates
    if (pending.promptType === 'select' && pending.candidates && pending.candidates.length > 0) {
      const candidates = pending.candidates;

      // Check numeric selection: "1", "first one", "the first one", "2", etc.
      let selectedIdx = -1;
      const numMatch = trimmed.match(/^(?:the\s+)?(?:number\s+)?([1-9])(?:st|nd|rd|th)?(?:\s+one)?$/i);
      if (numMatch) {
        const n = parseInt(numMatch[1], 10);
        if (n >= 1 && n <= candidates.length) {
          selectedIdx = n - 1;
        }
      } else if (/^first(?:\s+one)?$/i.test(trimmed)) {
        selectedIdx = 0;
      } else if (/^second(?:\s+one)?$/i.test(trimmed) && candidates.length > 1) {
        selectedIdx = 1;
      } else if (/^third(?:\s+one)?$/i.test(trimmed) && candidates.length > 2) {
        selectedIdx = 2;
      }

      if (selectedIdx >= 0) {
        const chosen = candidates[selectedIdx];
        clearPendingChoice();
        actions.navigateTo(chosen.route as ScreenId, {
          screenState: chosen.subState,
        });
        return {
          handled: true,
          executed: true,
          response: `Opened **${chosen.name}**.`,
          targetScreen: chosen.route as ScreenId,
          commandName: '/open',
        };
      }

      // Check if user typed the name or keyword of one of the candidates
      const normTrimmed = trimmed.toLowerCase();
      const matchedCand = candidates.find((c) => {
        const cName = c.name.toLowerCase();
        const cClean = cName.replace(/^axon\s+/i, '').trim();
        return (
          normTrimmed === cName ||
          normTrimmed === cClean ||
          normTrimmed === c.id.toLowerCase() ||
          normTrimmed === `open ${cClean}` ||
          normTrimmed === `open ${cName}` ||
          c.keywords.some((k) => k.toLowerCase() === normTrimmed)
        );
      });

      if (matchedCand) {
        clearPendingChoice();
        actions.navigateTo(matchedCand.route as ScreenId, {
          screenState: matchedCand.subState,
        });
        return {
          handled: true,
          executed: true,
          response: `Opened **${matchedCand.name}**.`,
          targetScreen: matchedCand.route as ScreenId,
          commandName: '/open',
        };
      }

      // If user typed generic affirmation like "yes" when multiple choices were offered
      if (/^(?:yes|yeah|sure|okay|ok)$/i.test(trimmed)) {
        return {
          handled: true,
          executed: false,
          response: `Which destination would you like to open? (Enter the number 1-${candidates.length} or type the destination name).`,
          commandName: '/open',
          options: candidates.map((c) => ({
            label: c.name,
            actionText: `/open ${c.id}`,
            destinationId: c.id,
            description: c.description,
          })),
        };
      }
    }

    // If input is an explicit slash command or fast-path math, clear pending choice and proceed
    if (trimmed.startsWith('/') || tryEvaluateMathExpression(trimmed)) {
      clearPendingChoice();
    } else {
      // Unrelated input: clear pending choice and let it fall through to normal processing
      clearPendingChoice();
    }
  }

  // -------------------------------------------------------------
  // 1. Explicit slash command: /open [target]
  // -------------------------------------------------------------
  if (/^\/open(?:\s|$)/i.test(trimmed)) {
    const rawTarget = trimmed.replace(/^\/open/i, '').trim();
    return handleOpenCommand(rawTarget, actions, currentScreen, true);
  }

  // -------------------------------------------------------------
  // 2. Natural language navigation lead-in forms:
  // "open <target>", "go to <target>", "take me to <target>", "navigate to <target>", "show <target>"
  // -------------------------------------------------------------
  const naturalMatch = trimmed.match(
    /^(?:please\s+)?(?:open(?:\s+up)?(?:\s+the)?|go\s+(?:to|into)(?:\s+the)?|take\s+me\s+to(?:\s+the)?|navigate\s+to(?:\s+the)?|show(?:\s+me)?(?:\s+the)?)\s+(.+)$/i
  );
  if (naturalMatch && naturalMatch[1]) {
    const candidateTarget = naturalMatch[1].trim();

    // Guard: Do not intercept questions or natural conversation
    if (
      !/^(?:how|why|what|who|where|when|can\s+you|could\s+you|tell\s+me)\b/i.test(candidateTarget) &&
      !candidateTarget.endsWith('?')
    ) {
      return handleOpenCommand(candidateTarget, actions, currentScreen, false);
    }
  }

  // -------------------------------------------------------------
  // 3. Direct interface name inputs (e.g. "Axon source", "AXON source", "tools", "settings")
  // -------------------------------------------------------------
  if (
    !trimmed.endsWith('?') &&
    !/^(?:how|why|what|who|where|when|can|could|would|is|are|do|does|explain|tell\s+me)\b/i.test(trimmed)
  ) {
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount <= 4) {
      const directResolution = resolveInterfaceFromQuery(trimmed, currentScreen);
      if (directResolution.isExact && directResolution.match) {
        return handleOpenCommand(trimmed, actions, currentScreen, false);
      }
    }
  }

  // -------------------------------------------------------------
  // 4. Fast-path offline arithmetic calculation
  // -------------------------------------------------------------
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

    const interfaces = discoverAvailableInterfaces();
    const rootInterfaces = interfaces.filter((i) => i.level === 'root' && i.isAvailable !== false);
    const subToolInterfaces = interfaces.filter((i) => i.level === 'sub_tool' && i.isAvailable !== false);

    const rootOptions: ChatCommandOption[] = rootInterfaces.map((i) => ({
      label: i.name,
      actionText: `/open ${i.id}`,
      destinationId: i.id,
      description: i.description,
      category: 'Core Workspace Screens',
    }));

    const toolOptions: ChatCommandOption[] = subToolInterfaces.map((i) => ({
      label: i.name,
      actionText: `/open ${i.id}`,
      destinationId: i.id,
      description: i.description,
      category: 'Specialized Utility Suites',
    }));

    // Set pending choice so typing any listed destination resolves immediately
    setPendingChoice({
      command: '/open',
      promptType: 'select',
      candidates: [...rootInterfaces, ...subToolInterfaces],
      timestamp: Date.now(),
    });

    return {
      handled: true,
      executed: false,
      response: `### AXON Interface Directory\n\nChoose a destination:`,
      commandName: '/open',
      options: [...rootOptions, ...toolOptions],
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
        'Cannot navigate to multiple interfaces simultaneously. Please specify a single destination (e.g. `/open settings` or `/open tools`).',
      commandName: '/open',
    };
  }

  // Case C: Exact match found -> Navigate immediately
  if (resolution.match && resolution.isExact) {
    clearPendingChoice();
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

  // Case D: Strong unique inferred match (e.g. "/open axon sou") -> Ask for confirmation with clickable button
  if (resolution.match && resolution.isInferred && !resolution.isAmbiguous) {
    setPendingChoice({
      command: '/open',
      promptType: 'confirm',
      target: resolution.match,
      timestamp: Date.now(),
    });

    const option: ChatCommandOption = {
      label: resolution.match.name,
      actionText: `/open ${resolution.match.id}`,
      destinationId: resolution.match.id,
      description: resolution.match.description,
    };

    return {
      handled: true,
      executed: false,
      response: `Did you mean **${resolution.match.name}**?`,
      commandName: '/open',
      options: [option],
    };
  }

  // If this is natural language and not an explicit /open command or confident match, do NOT hijack conversation
  if (!isExplicit) {
    return { handled: false, response: '' };
  }

  // Case E: Explicit /open was used, but resolution was ambiguous
  if (resolution.candidates && resolution.candidates.length > 0) {
    const candidates = resolution.candidates.slice(0, 5);
    setPendingChoice({
      command: '/open',
      promptType: 'select',
      candidates,
      timestamp: Date.now(),
    });

    const options: ChatCommandOption[] = candidates.map((c) => ({
      label: c.name,
      actionText: `/open ${c.id}`,
      destinationId: c.id,
      description: c.description,
    }));

    return {
      handled: true,
      executed: false,
      response: `Could not uniquely identify an interface for "${rawTarget}".\n\nDid you mean one of these?`,
      commandName: '/open',
      options,
    };
  }

  // Case F: Completely unrecognized target
  return {
    handled: true,
    executed: false,
    response: `Unrecognized interface "${rawTarget}".\n\nSupported destinations include: AXON Source (\`/open source\`), Settings (\`/open settings\`), Tools (\`/open tools\`), Code Editor (\`/open code\`), Project Notes (\`/open notes\`), Storage (\`/open storage\`), Automation (\`/open automation\`).`,
    commandName: '/open',
  };
}
