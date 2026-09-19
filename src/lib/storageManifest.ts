import {
  AssetCategory,
  AssetManifestItem,
  SaveMode,
  StorageBudgetConfig,
  TrimCategoryPriority,
} from '../types';

export interface StorageBreakdown {
  totalOriginalBytes: number;
  totalStoredBytes: number;
  totalSavingsBytes: number;
  categoryTotals: Record<AssetCategory, number>;
  itemCounts: Record<AssetCategory, number>;
  overallCompressionRatio: number;
}

export interface DeviceStorageEstimate {
  quotaBytes?: number;
  usageBytes?: number;
  freeBytes?: number;
  recommendedBudgetBytes: number;
  recommendedGb: number;
  recommendedLabel: string;
  calculationExplanation: string;
  source: 'storage_estimate' | 'device_memory' | 'default';
}

export interface BudgetPresetOption {
  label: string;
  bytes: number;
  isRecommended?: boolean;
  subtitle?: string;
}

/**
 * Calculates a device-aware budget recommendation based on actual storage / quota.
 * Floor: 4 GB, Ceiling: 30 GB, ~25% of available free space.
 */
export function calculateDeviceAwareBudget(
  quotaBytes?: number,
  usageBytes?: number,
  deviceMemoryGb?: number
): DeviceStorageEstimate {
  if (typeof quotaBytes === 'number' && quotaBytes > 0) {
    const freeBytes = Math.max(0, quotaBytes - (usageBytes || 0));
    // 25% of free space as sensible quota allocation for offline models & cached assets
    const calculatedBytes = freeBytes * 0.25;
    const floorBytes = 4 * 1024 * 1024 * 1024; // 4 GB floor
    const ceilingBytes = 30 * 1024 * 1024 * 1024; // 30 GB ceiling
    const clampedBytes = Math.max(floorBytes, Math.min(ceilingBytes, calculatedBytes));
    const recommendedGb = Math.max(1, Math.round(clampedBytes / (1024 * 1024 * 1024)));
    const recommendedBudgetBytes = recommendedGb * 1024 * 1024 * 1024;

    return {
      quotaBytes,
      usageBytes: usageBytes || 0,
      freeBytes,
      recommendedBudgetBytes,
      recommendedGb,
      recommendedLabel: `${recommendedGb} GB (Recommended)`,
      calculationExplanation: `Based on ~25% of ${formatBytes(freeBytes)} free device storage (${formatBytes(quotaBytes)} quota)`,
      source: 'storage_estimate',
    };
  }

  // Fallback if browser storage estimate is unavailable: use RAM heuristic
  if (typeof deviceMemoryGb === 'number' && deviceMemoryGb > 0) {
    let gb = 10;
    if (deviceMemoryGb <= 2) gb = 4;
    else if (deviceMemoryGb <= 4) gb = 8;
    else if (deviceMemoryGb <= 8) gb = 12;
    else gb = 16;

    return {
      recommendedBudgetBytes: gb * 1024 * 1024 * 1024,
      recommendedGb: gb,
      recommendedLabel: `${gb} GB (Recommended)`,
      calculationExplanation: `Calculated for device with ${deviceMemoryGb} GB RAM`,
      source: 'device_memory',
    };
  }

  // Baseline standard fallback
  return {
    recommendedBudgetBytes: 10 * 1024 * 1024 * 1024,
    recommendedGb: 10,
    recommendedLabel: '10 GB (Recommended)',
    calculationExplanation: 'Standard balanced baseline allocation',
    source: 'default',
  };
}

export async function getDeviceStorageRecommendation(): Promise<DeviceStorageEstimate> {
  if (typeof navigator !== 'undefined') {
    try {
      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        if (est && typeof est.quota === 'number' && est.quota > 0) {
          return calculateDeviceAwareBudget(est.quota, est.usage || 0, (navigator as any).deviceMemory);
        }
      }
    } catch (err) {
      console.warn('Storage estimate API error:', err);
    }

    const deviceMem = (navigator as any).deviceMemory;
    if (typeof deviceMem === 'number' && deviceMem > 0) {
      return calculateDeviceAwareBudget(undefined, undefined, deviceMem);
    }
  }

  return calculateDeviceAwareBudget();
}

/**
 * Returns a sorted list of budget preset options adapted to the device's recommendation.
 */
export function getDeviceAwarePresets(recommendation: DeviceStorageEstimate): BudgetPresetOption[] {
  const recGb = recommendation.recommendedGb;
  const recBytes = recommendation.recommendedBudgetBytes;

  const map = new Map<number, BudgetPresetOption>();

  // Baseline low
  if (recGb > 6) {
    map.set(5 * 1024 * 1024 * 1024, {
      label: '5 GB',
      bytes: 5 * 1024 * 1024 * 1024,
      subtitle: 'Minimal allocation for constrained devices',
    });
  } else {
    map.set(4 * 1024 * 1024 * 1024, {
      label: '4 GB',
      bytes: 4 * 1024 * 1024 * 1024,
      subtitle: 'Minimal budget for lightweight offline models',
    });
  }

  // Intermediate tier if applicable
  if (recGb !== 10 && recGb > 7) {
    map.set(10 * 1024 * 1024 * 1024, {
      label: '10 GB',
      bytes: 10 * 1024 * 1024 * 1024,
      subtitle: 'Compact quota for general offline use',
    });
  }

  // The Device-Aware Recommended Preset
  map.set(recBytes, {
    label: `${recGb} GB (Recommended)`,
    bytes: recBytes,
    isRecommended: true,
    subtitle: recommendation.calculationExplanation,
  });

  // Power User
  if (recGb < 23) {
    map.set(25 * 1024 * 1024 * 1024, {
      label: '25 GB (Power User)',
      bytes: 25 * 1024 * 1024 * 1024,
      subtitle: 'Deep archives, multiple models & knowledge packs',
    });
  } else {
    map.set(35 * 1024 * 1024 * 1024, {
      label: '35 GB (Power User)',
      bytes: 35 * 1024 * 1024 * 1024,
      subtitle: 'Maximum performance for large local datasets',
    });
  }

  return Array.from(map.values()).sort((a, b) => a.bytes - b.bytes);
}

export interface DownloadablePack {
  id: string;
  name: string;
  sizeBytes: number;
  category: AssetCategory;
  description: string;
}

export const DEFAULT_STORAGE_BUDGET_CONFIG: StorageBudgetConfig = {
  budgetBytes: calculateDeviceAwareBudget().recommendedBudgetBytes,
  warningThresholdPercent: 85,
  hasCompletedOnboarding: false,
  trimPriority: ['cache', 'chat_history', 'user_file', 'knowledge_pack', 'model'],
  autoTrimEnabled: false,
};

export const DEFAULT_ASSET_MANIFEST: AssetManifestItem[] = [
  {
    id: 'asset-sys-wasm',
    name: 'AXON Micro-Kernel & WASM Engine',
    category: 'system',
    storageLocation: '/sys/bin/axon-core.wasm',
    mimeType: 'application/wasm',
    originalSizeBytes: 48 * 1024 * 1024,
    storedSizeBytes: 48 * 1024 * 1024,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    knowledgeStatus: 'not_applicable',
    isCore: true,
    isEnabled: true,
    description: 'Core offline runtime compilation environment and isolated execution engine.',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'asset-core-app-shell',
    name: 'AXON Web Shell & PWA Runtime',
    category: 'system',
    storageLocation: '/sys/shell/pwa-manifest.json',
    mimeType: 'application/json',
    originalSizeBytes: 6 * 1024 * 1024,
    storedSizeBytes: 6 * 1024 * 1024,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    knowledgeStatus: 'not_applicable',
    isCore: true,
    isEnabled: true,
    description: 'Pre-installed mobile web application shell, icon registry, and service worker.',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'asset-core-text-tools',
    name: 'AXON Text Processing & Formatting Module',
    category: 'system',
    storageLocation: '/sys/tools/text-tools.wasm',
    mimeType: 'application/wasm',
    originalSizeBytes: 14 * 1024 * 1024,
    storedSizeBytes: 14 * 1024 * 1024,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    knowledgeStatus: 'not_applicable',
    isCore: true,
    isEnabled: true,
    description: 'Core text manipulation, regex parsing, markdown formatting, and string transformers.',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'asset-core-calc-tools',
    name: 'AXON Math & Expression Evaluator',
    category: 'system',
    storageLocation: '/sys/tools/calc-evaluator.wasm',
    mimeType: 'application/wasm',
    originalSizeBytes: 16 * 1024 * 1024,
    storedSizeBytes: 16 * 1024 * 1024,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    knowledgeStatus: 'not_applicable',
    isCore: true,
    isEnabled: true,
    description: 'Core arithmetic, unit converter, formula engine, and numerical calculation pipeline.',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'asset-core-color-tools',
    name: 'AXON WCAG & Color Contrast Engine',
    category: 'system',
    storageLocation: '/sys/tools/color-engine.wasm',
    mimeType: 'application/wasm',
    originalSizeBytes: 10 * 1024 * 1024,
    storedSizeBytes: 10 * 1024 * 1024,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    knowledgeStatus: 'not_applicable',
    isCore: true,
    isEnabled: true,
    description: 'Core WCAG contrast validation, APCA color calculation, and palette generation engine.',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'asset-model-offline',
    name: 'AXON 0.5B Offline Weights',
    category: 'model',
    storageLocation: '/models/axon-mobile-0.5b.q4',
    mimeType: 'application/octet-stream',
    originalSizeBytes: 1200 * 1024 * 1024,
    storedSizeBytes: 480 * 1024 * 1024,
    saveMode: 'space_saver',
    isOriginalPreserved: false,
    qualityState: 'downsampled',
    knowledgeStatus: 'not_applicable',
    isCore: false,
    isEnabled: true,
    description: '4-bit quantized local neural model for offline responses on 4GB RAM devices.',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  },
  {
    id: 'asset-knowledge-bible',
    name: 'Offline World Bible & Concordance',
    category: 'knowledge_pack',
    storageLocation: '/knowledge/bible-concordance.db',
    mimeType: 'application/x-sqlite3',
    originalSizeBytes: 65 * 1024 * 1024,
    storedSizeBytes: 65 * 1024 * 1024,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    knowledgeStatus: 'current',
    isCore: false,
    isEnabled: true,
    description: 'Complete cross-reference scripture database with Greek/Hebrew strongs lexicon.',
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  },
  {
    id: 'asset-knowledge-stale-docs',
    name: 'Android SDK 34 Reference Index',
    category: 'knowledge_pack',
    storageLocation: '/knowledge/android-sdk-34.pack',
    mimeType: 'application/octet-stream',
    originalSizeBytes: 85 * 1024 * 1024,
    storedSizeBytes: 85 * 1024 * 1024,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    knowledgeStatus: 'stale',
    isCore: false,
    isEnabled: true,
    description: 'Documentation offline pack needing periodic schema revision checks.',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  },
  {
    id: 'asset-user-diagram',
    name: 'System Architecture Diagram.png',
    category: 'user_file',
    storageLocation: '/user/files/System Architecture Diagram.png',
    mimeType: 'image/png',
    originalSizeBytes: 14 * 1024 * 1024,
    storedSizeBytes: 14 * 1024 * 1024,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    knowledgeStatus: 'not_applicable',
    isCore: false,
    isEnabled: true,
    description: 'High-resolution diagram uploaded for application development.',
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
  },
  {
    id: 'asset-chat-archive',
    name: 'Session Logs 2026 Q3 Archive',
    category: 'chat_history',
    storageLocation: '/history/sessions-q3-2026.jsonl',
    mimeType: 'application/json',
    originalSizeBytes: 8 * 1024 * 1024,
    storedSizeBytes: 8 * 1024 * 1024,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    knowledgeStatus: 'not_applicable',
    isCore: false,
    isEnabled: true,
    description: 'Consolidated message archive of past discussions and code generations.',
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  },
  {
    id: 'asset-cache-preview',
    name: 'Compiler Render Buffer & Thumbnails',
    category: 'cache',
    storageLocation: '/cache/build-previews/',
    mimeType: 'application/octet-stream',
    originalSizeBytes: 120 * 1024 * 1024,
    storedSizeBytes: 42 * 1024 * 1024,
    saveMode: 'space_saver',
    isOriginalPreserved: false,
    qualityState: 'downsampled',
    knowledgeStatus: 'not_applicable',
    isCore: false,
    isEnabled: true,
    description: 'Temporary compilation intermediates and live visual preview thumbnails.',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  },
];

export const AVAILABLE_DOWNLOADABLE_PACKS: DownloadablePack[] = [
  {
    id: 'pack-bible-lexicon',
    name: 'Complete Scripture & Lexicon Bundle',
    sizeBytes: 110 * 1024 * 1024,
    category: 'knowledge_pack',
    description: 'High-speed offline concordance, cross-references, and morphology dictionaries.',
  },
  {
    id: 'pack-code-snippets',
    name: 'Full-Stack Developer Knowledge Pack',
    sizeBytes: 45 * 1024 * 1024,
    category: 'knowledge_pack',
    description: 'Essential offline patterns for React, Tailwind, TypeScript, Node.js, and Algorithms.',
  },
  {
    id: 'pack-voice-synthesis',
    name: 'Neural Speech Synthesizer Voice Pack',
    sizeBytes: 85 * 1024 * 1024,
    category: 'model',
    description: 'Natural voice synthesis models for offline speech rate testing and auditory playback.',
  },
  {
    id: 'pack-color-math',
    name: 'WCAG 2.2 Palette & Contrast Library',
    sizeBytes: 15 * 1024 * 1024,
    category: 'knowledge_pack',
    description: 'Exhaustive color space lookup tables (APCA, CIE-L*a*b*, OKLCH) for design verification.',
  },
  {
    id: 'pack-math-stats',
    name: 'Math & Numerical Algorithms Library',
    sizeBytes: 34 * 1024 * 1024,
    category: 'knowledge_pack',
    description: 'Offline linear algebra, statistics tables, and numerical optimization formulas.',
  },
  {
    id: 'pack-templates',
    name: 'Mobile UI Kit & Code Templates',
    sizeBytes: 26 * 1024 * 1024,
    category: 'knowledge_pack',
    description: 'Ready-to-use mobile-first interface templates and reactive component blueprints.',
  },
];

export interface BudgetCheckResult {
  fitsInBudget: boolean;
  wouldExceedBudget: boolean;
  wouldTriggerWarning: boolean;
  remainingBytes: number;
  usagePercentAfter: number;
  message?: string;
}

export function checkStorageBudget(
  currentStoredBytes: number,
  newAssetBytes: number,
  budgetBytes: number,
  warningThresholdPercent: number = 85
): BudgetCheckResult {
  const projectedStoredBytes = currentStoredBytes + newAssetBytes;
  const remainingBytes = Math.max(0, budgetBytes - currentStoredBytes);
  const usagePercentAfter = budgetBytes > 0 ? (projectedStoredBytes / budgetBytes) * 100 : 100;
  const wouldExceedBudget = projectedStoredBytes > budgetBytes;
  const wouldTriggerWarning = usagePercentAfter >= warningThresholdPercent;

  let message: string | undefined;
  if (wouldExceedBudget) {
    message = `Storage budget exceeded: Asset requires ${formatBytes(newAssetBytes)}, but only ${formatBytes(remainingBytes)} remaining in ${formatBytes(budgetBytes, 0)} budget.`;
  } else if (wouldTriggerWarning) {
    message = `Storage warning: Adding this asset will reach ${Math.round(usagePercentAfter)}% of the ${formatBytes(budgetBytes, 0)} device budget.`;
  }

  return {
    fitsInBudget: !wouldExceedBudget,
    wouldExceedBudget,
    wouldTriggerWarning,
    remainingBytes,
    usagePercentAfter,
    message,
  };
}

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  return `${val} ${sizes[i] || 'B'}`;
}

export function calculateStorageBreakdown(manifest: AssetManifestItem[]): StorageBreakdown {
  const categories: AssetCategory[] = [
    'model',
    'knowledge_pack',
    'user_file',
    'chat_history',
    'cache',
    'system',
  ];

  const categoryTotals: Record<AssetCategory, number> = {
    model: 0,
    knowledge_pack: 0,
    user_file: 0,
    chat_history: 0,
    cache: 0,
    system: 0,
  };

  const itemCounts: Record<AssetCategory, number> = {
    model: 0,
    knowledge_pack: 0,
    user_file: 0,
    chat_history: 0,
    cache: 0,
    system: 0,
  };

  let totalOriginalBytes = 0;
  let totalStoredBytes = 0;

  for (const item of manifest) {
    totalOriginalBytes += item.originalSizeBytes || 0;
    totalStoredBytes += item.storedSizeBytes || 0;

    const cat = categories.includes(item.category) ? item.category : 'system';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (item.storedSizeBytes || 0);
    itemCounts[cat] = (itemCounts[cat] || 0) + 1;
  }

  const totalSavingsBytes = Math.max(0, totalOriginalBytes - totalStoredBytes);
  const overallCompressionRatio = totalOriginalBytes > 0 ? totalStoredBytes / totalOriginalBytes : 1;

  return {
    totalOriginalBytes,
    totalStoredBytes,
    totalSavingsBytes,
    categoryTotals,
    itemCounts,
    overallCompressionRatio,
  };
}

export function changeAssetSaveMode(item: AssetManifestItem, mode: SaveMode): AssetManifestItem {
  if (mode === 'space_saver') {
    return {
      ...item,
      saveMode: 'space_saver',
      isOriginalPreserved: false,
      qualityState: 'downsampled',
      storedSizeBytes: Math.round(item.originalSizeBytes * 0.35),
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...item,
    saveMode: 'archive',
    isOriginalPreserved: true,
    qualityState: 'lossless',
    storedSizeBytes: item.originalSizeBytes,
    updatedAt: new Date().toISOString(),
  };
}

export function performEnhanceOrRevert(item: AssetManifestItem): {
  updatedItem: AssetManifestItem;
  resultType: string;
  message: string;
} {
  if (item.saveMode === 'space_saver') {
    const updated: AssetManifestItem = {
      ...item,
      qualityState: item.isOriginalPreserved ? 'lossless' : 'enhanced',
      storedSizeBytes: item.originalSizeBytes,
      saveMode: item.isOriginalPreserved ? 'archive' : 'space_saver',
      updatedAt: new Date().toISOString(),
    };
    return {
      updatedItem: updated,
      resultType: 'enhanced',
      message: item.isOriginalPreserved
        ? `Reverted "${item.name}" to lossless original archive.`
        : `Neural enhancement applied to "${item.name}" (approximated fidelity restored).`,
    };
  }

  return {
    updatedItem: item,
    resultType: 'already_optimal',
    message: `"${item.name}" is already preserved at full lossless archive quality.`,
  };
}

export function simulateTrimPlan(
  manifest: AssetManifestItem[],
  targetBytesToFree: number,
  priority: TrimCategoryPriority[]
): {
  itemsToPrune: Array<{ item: AssetManifestItem; savingsBytes: number }>;
  totalSimulatedSavingsBytes: number;
} {
  const itemsToPrune: Array<{ item: AssetManifestItem; savingsBytes: number }> = [];
  let totalSimulatedSavingsBytes = 0;

  // Filter out core/system protected assets
  const pruneCandidates = manifest.filter((item) => !item.isCore && item.category !== 'system');

  // Sort candidates by the priority list order
  pruneCandidates.sort((a, b) => {
    const pA = priority.indexOf(a.category as TrimCategoryPriority);
    const pB = priority.indexOf(b.category as TrimCategoryPriority);
    const orderA = pA === -1 ? 999 : pA;
    const orderB = pB === -1 ? 999 : pB;
    if (orderA !== orderB) return orderA - orderB;
    // Secondary sort: larger items first
    return b.storedSizeBytes - a.storedSizeBytes;
  });

  for (const candidate of pruneCandidates) {
    if (targetBytesToFree > 0 && totalSimulatedSavingsBytes >= targetBytesToFree) {
      break;
    }
    const savings = candidate.storedSizeBytes;
    itemsToPrune.push({ item: candidate, savingsBytes: savings });
    totalSimulatedSavingsBytes += savings;
  }

  return {
    itemsToPrune,
    totalSimulatedSavingsBytes,
  };
}
