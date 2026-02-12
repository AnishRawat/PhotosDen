/**
 * PricingConfig Entity
 * 
 * Versioned pricing configuration.
 * Immutable once activated - new prices require new version.
 */

import { Money } from '../value-objects/Money';
import { EventType } from '../enums';

export interface PricingRate {
  estimatedCost: Money;
  description?: string;
  awsCostBreakdown?: {
    awsCostUSD: number;
    markupMultiplier: number;
    exchangeRate: number;
  };
}

export type PricingRates = {
  [K in EventType]: PricingRate;
};

export interface PricingConfigProps {
  version: string; // 'v1', 'v2', etc.
  effectiveFrom: number; // Timestamp
  effectiveTo: number | null; // null = current active version
  isActive: boolean;
  currency: 'INR';
  rates: PricingRates;
  rounding: 'ROUND_HALF_UP';
  createdAt: number;
  createdBy: string; // adminId or 'SYSTEM'
  changeReason?: string;
}

export class PricingConfig {
  private constructor(private props: PricingConfigProps) {}

  /**
   * Create new pricing config (must be activated separately)
   */
  static create(params: {
    version: string;
    rates: PricingRates;
    effectiveFrom: number;
    createdBy: string;
    changeReason?: string;
  }): PricingConfig {
    return new PricingConfig({
      version: params.version,
      effectiveFrom: params.effectiveFrom,
      effectiveTo: null,
      isActive: false,
      currency: 'INR',
      rates: params.rates,
      rounding: 'ROUND_HALF_UP',
      createdAt: Date.now(),
      createdBy: params.createdBy,
      changeReason: params.changeReason,
    });
  }

  static reconstitute(props: PricingConfigProps): PricingConfig {
    return new PricingConfig(props);
  }

  // ===== Getters =====

  get version(): string {
    return this.props.version;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get effectiveFrom(): number {
    return this.props.effectiveFrom;
  }

  /**
   * Get cost for an event type
   */
  getCost(eventType: EventType, quantity: number = 1): Money {
    const rate = this.props.rates[eventType];
    if (!rate) {
      throw new Error(`No pricing configured for event type: ${eventType}`);
    }

    return rate.estimatedCost.multiply(quantity);
  }

  /**
   * Calculate all pricing differences compared to another version
   */
  calculateChanges(previousVersion: PricingConfig): Array<{
    eventType: EventType;
    oldPrice: Money;
    newPrice: Money;
    percentChange: number;
  }> {
    const changes: Array<{
      eventType: EventType;
      oldPrice: Money;
      newPrice: Money;
      percentChange: number;
    }> = [];

    for (const eventType of Object.values(EventType)) {
      const oldRate = previousVersion.props.rates[eventType];
      const newRate = this.props.rates[eventType];

      if (!oldRate || !newRate) continue;

      const oldPaise = oldRate.estimatedCost.amountInSmallestUnit;
      const newPaise = newRate.estimatedCost.amountInSmallestUnit;

      if (oldPaise !== newPaise) {
        const percentChange = ((newPaise - oldPaise) / oldPaise) * 100;
        changes.push({
          eventType,
          oldPrice: oldRate.estimatedCost,
          newPrice: newRate.estimatedCost,
          percentChange,
        });
      }
    }

    return changes;
  }

  // ===== Commands =====

  /**
   * Activate this pricing version (deactivates all others)
   */
  activate(): void {
    if (this.props.isActive) {
      throw new Error(`Pricing version ${this.props.version} is already active`);
    }

    this.props.isActive = true;
    this.props.effectiveFrom = Math.max(this.props.effectiveFrom, Date.now());
  }

  /**
   * Deactivate this pricing version (when newer version is activated)
   */
  deactivate(effectiveTo: number): void {
    if (!this.props.isActive) {
      throw new Error(`Pricing version ${this.props.version} is not active`);
    }

    this.props.isActive = false;
    this.props.effectiveTo = effectiveTo;
  }

  // ===== Serialization =====

  toJSON() {
    return {
      ...this.props,
      rates: Object.fromEntries(
        Object.entries(this.props.rates).map(([key, value]) => [
          key,
          {
            ...value,
            estimatedCost: value.estimatedCost.toJSON(),
          },
        ])
      ),
    };
  }

  toDynamoDBFormat() {
    return {
      PK: 'CONFIG#PRICING',
      SK: `VERSION#${this.props.version}`,
      EntityType: 'PricingConfig',
      GSI1PK: `CONFIG#PRICING#ACTIVE#${this.props.isActive}`,
      GSI1SK: `VERSION#${this. props.effectiveFrom}`,
      version: this.props.version,
      effectiveFrom: this.props.effectiveFrom,
      effectiveTo: this.props.effectiveTo,
      isActive: this.props.isActive,
      currency: this.props.currency,
      rates: Object.fromEntries(
        Object.entries(this.props.rates).map(([key, value]) => [
          key,
          {
            estimatedCostPaise: value.estimatedCost.amountInSmallestUnit,
            description: value.description,
            awsCostBreakdown: value.awsCostBreakdown,
          },
        ])
      ),
      rounding: this.props.rounding,
      createdAt: this.props.createdAt,
      createdBy: this.props.createdBy,
      changeReason: this.props.changeReason,
    };
  }
}
