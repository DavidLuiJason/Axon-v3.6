/**
 * Core type definitions for AXON Interface Capture & Analysis System.
 * Implements the 6-stage pipeline: DISCOVERY → CAPTURE → SEGMENTATION → ANALYSIS → VERIFICATION → STORAGE
 */

export type CaptureJobStage =
  | 'DISCOVERED'
  | 'QUEUED'
  | 'CAPTURING'
  | 'CAPTURED'
  | 'SEGMENTING'
  | 'SEGMENTED'
  | 'ANALYZING'
  | 'ANALYZED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRY_REQUIRED';

export type FailureCategory =
  | 'RENDERING'
  | 'SEGMENTATION'
  | 'ANALYSIS'
  | 'TIMEOUT'
  | 'PARTIAL'
  | 'STORAGE'
  | 'UNKNOWN';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionAnalysis {
  title: string;
  archetype: 'dual_pane' | 'column' | 'panel' | 'card' | 'modal' | 'drawer' | 'tab_content' | 'overlay' | 'scroll_view' | 'general';
  description: string;
  headings: string[];
  buttons: string[];
  inputs: string[];
  badges: string[];
  interactiveCount: number;
  isSideBySide: boolean;
  columnPosition?: 'left' | 'center' | 'right';
  verified: boolean;
  notes?: string[];
}

export interface SegmentedRegion {
  id: string;
  parentId: string;
  name: string;
  type: 'side_by_side_column' | 'independent_panel' | 'card_interface' | 'modal_dialog' | 'drawer_sheet' | 'tab_view' | 'overlay' | 'scrollable_view';
  bounds: BoundingBox;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  isIndependentInterface: boolean;
  analysis?: RegionAnalysis;
}

export interface ItemTimingDiagnostics {
  discoveryMs: number;
  queueWaitMs: number;
  renderingMs: number;
  screenshotMs: number;
  segmentationMs: number;
  analysisMs: number;
  verificationMs: number;
  storageMs: number;
  retryMs: number;
  totalDurationMs: number;
}

export interface CaptureJobItem {
  id: string; // Interface ID
  name: string;
  route: string;
  category: string;
  stage: CaptureJobStage;
  priority: number;
  contentHash?: string;
  reusedFromCache?: boolean;
  
  // Full-screen master capture (ALWAYS preserved)
  fullScreenshot?: {
    dataUrl: string;
    width: number;
    height: number;
    sizeBytes: number;
    capturedAt: string;
  };

  // Layout-aware segmented sub-interfaces (e.g. side-by-side columns, cards, modals)
  segmentedRegions: SegmentedRegion[];
  
  // Pass 1: Fast Structural Analysis
  structuralSummary?: {
    totalColumns: number;
    isMultiColumn: boolean;
    hasOverlays: boolean;
    hasScrollables: boolean;
    detectedLayoutArchetype: string;
  };

  // Pass 2: Targeted Deep Analysis for overall interface
  deepAnalysis?: RegionAnalysis;

  // Verification findings
  verificationReport?: {
    passed: boolean;
    missedRegionsFound: number;
    notes: string[];
  };

  // Retries & Errors
  error?: string;
  failureCategory?: FailureCategory;
  retryCount: number;
  maxRetries: number;

  // Diagnostics
  timing: ItemTimingDiagnostics;
  timestamp: number;
}

export interface CaptureJobProgress {
  totalDiscovered: number;
  queued: number;
  capturing: number;
  segmenting: number;
  analyzing: number;
  verifying: number;
  completed: number;
  failed: number;
  retrying: number;
  percent: number;
  currentStage: CaptureJobStage;
  currentInterfaceName: string;
  estimatedRemainingSec: number;
}

export interface CaptureJob {
  id: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'interrupted';
  scope: 'all' | 'multiple' | 'current';
  createdAt: number;
  updatedAt: number;
  totalInterfaces: number;
  progress: CaptureJobProgress;
  items: Record<string, CaptureJobItem>;
  diagnostics: {
    totalDurationMs: number;
    avgTimePerItemMs: number;
    peakConcurrency: number;
    cacheHitCount: number;
    stageAverages: {
      discoveryMs: number;
      renderingMs: number;
      screenshotMs: number;
      segmentationMs: number;
      analysisMs: number;
      verificationMs: number;
      storageMs: number;
    };
  };
}
