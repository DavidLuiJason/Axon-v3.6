/**
 * AXON Usage & Quota Engine
 *
 * Generic, reusable quota and rate-limit tracking engine for external AI accounts.
 *
 * Key Capabilities:
 * - Tracks per-account and per-service request counts, timestamps, and rate limits
 * - Exposes clean read/check methods (isAvailable, isAccountInCooldown, getRemainingCooldownString, etc.)
 * - Emits standardized limit-hit / cooldown / request events to subscribers
 * - Persists tracking data seamlessly across browser sessions via localStorage
 * - Prepares signals for the Multi-AI delegation router
 * - Strict Rule: AXON's internal local core has NO limits and is explicitly excluded from tracking.
 */

import { AIAccount, AIProvider } from '../types';

export interface AccountUsageRecord {
  accountId: string;
  provider: AIProvider;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitHits: number;
  lastRequestTimestamp?: number;
  lastSuccessTimestamp?: number;
  lastFailureTimestamp?: number;
  lastError?: string;
  cooldownUntil?: number;
  cooldownStartedAt?: number;
  cooldownReason?: string;
}

export interface ServiceUsageSummary {
  provider: AIProvider;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitHits: number;
  activeAccountsCount: number;
  accountsInCooldownCount: number;
}

export type UsageQuotaEventType =
  | 'limit-hit'
  | 'cooldown-expired'
  | 'cooldown-cleared'
  | 'request-recorded'
  | 'request-succeeded'
  | 'request-failed'
  | 'state-reset';

export interface UsageQuotaEvent {
  type: UsageQuotaEventType;
  accountId?: string;
  provider?: AIProvider;
  cooldownUntil?: number;
  cooldownRemainingMs?: number;
  reason?: string;
  timestamp: number;
}

export type UsageQuotaListener = (event: UsageQuotaEvent) => void;

const USAGE_QUOTA_STORAGE_KEY = 'axon_usage_quota_v1';

export class UsageQuotaEngine {
  private static instance: UsageQuotaEngine | null = null;
  private records: Map<string, AccountUsageRecord> = new Map();
  private listeners: Set<UsageQuotaListener> = new Set();
  private isBrowser: boolean;

  private constructor() {
    this.isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    this.loadState();
  }

  public static getInstance(): UsageQuotaEngine {
    if (!UsageQuotaEngine.instance) {
      UsageQuotaEngine.instance = new UsageQuotaEngine();
    }
    return UsageQuotaEngine.instance;
  }

  /**
   * Loads persisted quota records from localStorage
   */
  private loadState(): void {
    if (!this.isBrowser) return;
    try {
      const raw = localStorage.getItem(USAGE_QUOTA_STORAGE_KEY);
      if (raw) {
        const parsed: Record<string, AccountUsageRecord> = JSON.parse(raw);
        Object.entries(parsed).forEach(([accId, rec]) => {
          // Never persist cooldowns for AXON local core
          if (rec.provider === 'axon' || accId.includes('axon')) {
            return;
          }
          this.records.set(accId, rec);
        });
      }
    } catch (e) {
      console.warn('[UsageQuotaEngine] Error loading state from localStorage:', e);
    }
  }

  /**
   * Persists quota records to localStorage
   */
  private saveState(): void {
    if (!this.isBrowser) return;
    try {
      const obj: Record<string, AccountUsageRecord> = {};
      this.records.forEach((rec, id) => {
        if (rec.provider !== 'axon' && !id.includes('axon')) {
          obj[id] = rec;
        }
      });
      localStorage.setItem(USAGE_QUOTA_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('[UsageQuotaEngine] Error saving state to localStorage:', e);
    }
  }

  private emit(event: UsageQuotaEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[UsageQuotaEngine] Listener error:', err);
      }
    });
  }

  /**
   * Subscribes to standardized quota and cooldown events
   */
  public subscribe(listener: UsageQuotaListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Checks if an account is internal AXON core (which has NO limits)
   */
  public isAxonCore(accountOrProvider?: AIAccount | AIProvider | string): boolean {
    if (!accountOrProvider) return false;
    if (typeof accountOrProvider === 'string') {
      const lower = accountOrProvider.toLowerCase();
      return lower === 'axon' || lower.includes('axon') || lower === 'axon-offline-core';
    }
    return accountOrProvider.provider === 'axon' || accountOrProvider.id?.includes('axon');
  }

  /**
   * Checks whether an account or target is currently in a rate-limit cooldown
   */
  public isAccountInCooldown(account?: AIAccount | string): boolean {
    if (!account) return false;
    if (this.isAxonCore(account)) return false;

    const accountId = typeof account === 'string' ? account : account.id;
    const directCooldown = typeof account === 'object' ? account.cooldownUntil : undefined;

    const now = Date.now();
    if (directCooldown && now < directCooldown) {
      return true;
    }

    const record = this.records.get(accountId);
    if (!record || !record.cooldownUntil) return false;

    if (now >= record.cooldownUntil) {
      // Cooldown expired naturally
      record.cooldownUntil = undefined;
      record.cooldownStartedAt = undefined;
      record.cooldownReason = undefined;
      this.saveState();
      this.emit({
        type: 'cooldown-expired',
        accountId,
        provider: record.provider,
        timestamp: now,
      });
      return false;
    }

    return true;
  }

  /**
   * Returns remaining cooldown milliseconds (0 if none)
   */
  public getRemainingCooldownMs(account?: AIAccount | string): number {
    if (!account || this.isAxonCore(account)) return 0;

    const now = Date.now();
    let cooldownUntil: number | undefined;

    if (typeof account === 'object' && account.cooldownUntil) {
      cooldownUntil = account.cooldownUntil;
    } else {
      const accountId = typeof account === 'string' ? account : account.id;
      const record = this.records.get(accountId);
      cooldownUntil = record?.cooldownUntil;
    }

    if (!cooldownUntil || now >= cooldownUntil) {
      return 0;
    }

    return cooldownUntil - now;
  }

  /**
   * Formats remaining cooldown into a human-readable string (e.g. "23h 45m", "15m")
   */
  public getRemainingCooldownString(accountOrCooldownUntil?: AIAccount | number | string): string {
    if (!accountOrCooldownUntil) return '';
    if (this.isAxonCore(accountOrCooldownUntil as any)) return '';

    let cooldownUntil: number | undefined;

    if (typeof accountOrCooldownUntil === 'number') {
      cooldownUntil = accountOrCooldownUntil;
    } else if (typeof accountOrCooldownUntil === 'string') {
      const record = this.records.get(accountOrCooldownUntil);
      cooldownUntil = record?.cooldownUntil;
    } else {
      cooldownUntil =
        accountOrCooldownUntil.cooldownUntil ||
        this.records.get(accountOrCooldownUntil.id)?.cooldownUntil;
    }

    if (!cooldownUntil) return '';

    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs <= 0) return '';

    const remainingMin = Math.ceil(remainingMs / (1000 * 60));
    if (remainingMin >= 60) {
      const hours = Math.floor(remainingMin / 60);
      const mins = remainingMin % 60;
      return `${hours}h ${mins}m`;
    }
    return `${remainingMin}m`;
  }

  /**
   * Determines if an account is eligible and available to receive dispatched queries
   */
  public isAvailable(account: AIAccount, service?: AIProvider): boolean {
    if (this.isAxonCore(account) || service === 'axon') return true;
    if (!account.isActive) return false;
    if (this.isAccountInCooldown(account)) return false;
    return true;
  }

  /**
   * Retrieves an account's usage record
   */
  public getAccountUsage(accountId: string): AccountUsageRecord | undefined {
    return this.records.get(accountId);
  }

  /**
   * Aggregates usage across all accounts for a specific provider
   */
  public getServiceUsage(provider: AIProvider): ServiceUsageSummary {
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let rateLimitHits = 0;
    let activeAccountsCount = 0;
    let accountsInCooldownCount = 0;

    this.records.forEach((rec) => {
      if (rec.provider === provider) {
        totalRequests += rec.totalRequests;
        successfulRequests += rec.successfulRequests;
        failedRequests += rec.failedRequests;
        rateLimitHits += rec.rateLimitHits;
        if (this.isAccountInCooldown(rec.accountId)) {
          accountsInCooldownCount++;
        } else {
          activeAccountsCount++;
        }
      }
    });

    return {
      provider,
      totalRequests,
      successfulRequests,
      failedRequests,
      rateLimitHits,
      activeAccountsCount,
      accountsInCooldownCount,
    };
  }

  private getOrCreateRecord(accountId: string, provider: AIProvider): AccountUsageRecord {
    let record = this.records.get(accountId);
    if (!record) {
      record = {
        accountId,
        provider,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitHits: 0,
      };
      this.records.set(accountId, record);
    }
    return record;
  }

  /**
   * Records an outgoing request for tracking
   */
  public recordRequest(accountId: string, provider: AIProvider): void {
    if (this.isAxonCore(provider) || this.isAxonCore(accountId)) return;

    const record = this.getOrCreateRecord(accountId, provider);
    record.totalRequests++;
    record.lastRequestTimestamp = Date.now();
    this.saveState();

    this.emit({
      type: 'request-recorded',
      accountId,
      provider,
      timestamp: record.lastRequestTimestamp,
    });
  }

  /**
   * Records a successful request completion
   */
  public recordSuccess(accountId: string, provider: AIProvider): void {
    if (this.isAxonCore(provider) || this.isAxonCore(accountId)) return;

    const record = this.getOrCreateRecord(accountId, provider);
    record.successfulRequests++;
    record.lastSuccessTimestamp = Date.now();
    this.saveState();

    this.emit({
      type: 'request-succeeded',
      accountId,
      provider,
      timestamp: record.lastSuccessTimestamp,
    });
  }

  /**
   * Records a failed request (non-rate-limit)
   */
  public recordFailure(accountId: string, provider: AIProvider, error?: string): void {
    if (this.isAxonCore(provider) || this.isAxonCore(accountId)) return;

    const record = this.getOrCreateRecord(accountId, provider);
    record.failedRequests++;
    record.lastFailureTimestamp = Date.now();
    record.lastError = error;
    this.saveState();

    this.emit({
      type: 'request-failed',
      accountId,
      provider,
      reason: error,
      timestamp: record.lastFailureTimestamp,
    });
  }

  /**
   * Records a rate-limit hit (HTTP 429) and establishes a standardized cooldown period
   * Default cooldown: 24 hours (86,400,000 ms)
   */
  public recordRateLimitHit(
    accountId: string,
    provider: AIProvider,
    cooldownMs: number = 24 * 60 * 60 * 1000,
    reason: string = 'HTTP 429 Rate Limit Reached'
  ): UsageQuotaEvent {
    // AXON local core cannot be rate limited
    if (this.isAxonCore(provider) || this.isAxonCore(accountId)) {
      return {
        type: 'limit-hit',
        accountId,
        provider,
        timestamp: Date.now(),
      };
    }

    const now = Date.now();
    const cooldownUntil = now + cooldownMs;

    const record = this.getOrCreateRecord(accountId, provider);
    record.rateLimitHits++;
    record.cooldownStartedAt = now;
    record.cooldownUntil = cooldownUntil;
    record.cooldownReason = reason;
    record.lastError = reason;
    this.saveState();

    const event: UsageQuotaEvent = {
      type: 'limit-hit',
      accountId,
      provider,
      cooldownUntil,
      cooldownRemainingMs: cooldownMs,
      reason,
      timestamp: now,
    };

    this.emit(event);
    return event;
  }

  /**
   * Clears cooldown for an account (e.g. manual user reset in Settings)
   */
  public clearCooldown(accountId: string): void {
    const record = this.records.get(accountId);
    if (record) {
      record.cooldownUntil = undefined;
      record.cooldownStartedAt = undefined;
      record.cooldownReason = undefined;
      this.saveState();

      this.emit({
        type: 'cooldown-cleared',
        accountId,
        provider: record.provider,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Resets all usage data for an account
   */
  public resetAccountUsage(accountId: string): void {
    this.records.delete(accountId);
    this.saveState();
    this.emit({
      type: 'state-reset',
      accountId,
      timestamp: Date.now(),
    });
  }

  /**
   * Returns a copy of all current usage records
   */
  public getAllRecords(): Record<string, AccountUsageRecord> {
    const out: Record<string, AccountUsageRecord> = {};
    this.records.forEach((v, k) => {
      out[k] = { ...v };
    });
    return out;
  }
}

// Global singleton instance
export const usageQuotaEngine = UsageQuotaEngine.getInstance();
