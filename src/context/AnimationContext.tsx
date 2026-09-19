import React, { createContext, useContext, useMemo } from 'react';
import { useApp } from './AppContext';

export type AnimationScope = 'viewer' | 'background';

export interface AnimationPolicyState {
  /** The current animation scope: 'viewer' (interactive UI) or 'background' (offscreen / workers) */
  scope: AnimationScope;
  /** Whether animations are currently enabled for this active scope */
  isEnabled: boolean;
  /** Value of the user-facing Viewer Animation setting */
  viewerAnimationEnabled: boolean;
  /** Value of the Background Animation setting */
  backgroundAnimationEnabled: boolean;
  /** Persistently update viewer animation setting */
  setViewerAnimationEnabled: (enabled: boolean) => void;
  /** Persistently update background animation setting */
  setBackgroundAnimationEnabled: (enabled: boolean) => void;
  /** Return CSS transition string if enabled, or fallback (e.g. 'none') */
  getTransitionStyle: (standardTransition: string, fallbackTransition?: string) => string;
  /** Return standard animation duration in ms if enabled, or 0 ms if disabled */
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
 * Authoritative hook for querying and controlling the independent animation policies.
 */
export const useAnimationPolicy = (): AnimationPolicyState => {
  const scope = useContext(AnimationScopeContext);
  const { generalSettings, updateGeneralSettings } = useApp();

  const viewerAnimationEnabled = generalSettings.viewerAnimationEnabled !== false;
  const backgroundAnimationEnabled = generalSettings.backgroundAnimationEnabled === true;

  const isEnabled = scope === 'viewer' ? viewerAnimationEnabled : backgroundAnimationEnabled;

  return useMemo(
    () => ({
      scope,
      isEnabled,
      viewerAnimationEnabled,
      backgroundAnimationEnabled,
      setViewerAnimationEnabled: (enabled: boolean) => {
        updateGeneralSettings({ viewerAnimationEnabled: enabled });
      },
      setBackgroundAnimationEnabled: (enabled: boolean) => {
        updateGeneralSettings({ backgroundAnimationEnabled: enabled });
      },
      getTransitionStyle: (standardTransition: string, fallbackTransition: string = 'none') => {
        return isEnabled ? standardTransition : fallbackTransition;
      },
      getDurationMs: (standardDurationMs: number) => {
        return isEnabled ? standardDurationMs : 0;
      },
    }),
    [scope, isEnabled, viewerAnimationEnabled, backgroundAnimationEnabled, updateGeneralSettings]
  );
};
