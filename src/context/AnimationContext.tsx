import React, { createContext, useContext, useMemo } from 'react';

export type AnimationScope = 'viewer' | 'background';

export interface AnimationPolicyState {
  /** The current animation scope: 'viewer' (interactive UI) or 'background' (offscreen / workers) */
  scope: AnimationScope;
  /** Whether animations are currently enabled for this active scope */
  isEnabled: boolean;
  /** Return CSS transition string */
  getTransitionStyle: (standardTransition: string, fallbackTransition?: string) => string;
  /** Return standard animation duration in ms */
  getDurationMs: (standardDurationMs: number) => number;
}

const AnimationScopeContext = createContext<AnimationScope>('viewer');

export interface AnimationScopeProviderProps {
  scope: AnimationScope;
  children: React.ReactNode;
}

/**
 * Provides an isolated animation scope ('viewer' or 'background').
 * Ensures components inside query policy specifically for their rendering context.
 */
export const AnimationScopeProvider: React.FC<AnimationScopeProviderProps> = ({
  scope,
  children,
}) => {
  return (
    <AnimationScopeContext.Provider value={scope}>
      {children}
    </AnimationScopeContext.Provider>
  );
};

/**
 * Authoritative hook for querying animation policies.
 * AXON's UI motion is permanently enabled as part of the interface.
 */
export const useAnimationPolicy = (): AnimationPolicyState => {
  const scope = useContext(AnimationScopeContext);

  return useMemo(
    () => ({
      scope,
      isEnabled: true,
      getTransitionStyle: (standardTransition: string) => {
        return standardTransition;
      },
      getDurationMs: (standardDurationMs: number) => {
        return standardDurationMs;
      },
    }),
    [scope]
  );
};
