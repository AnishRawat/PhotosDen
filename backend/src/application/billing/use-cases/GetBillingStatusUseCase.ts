/**
 * Get Billing Status Use Case
 * 
 * Calculates current month usage and expected projected bill.
 */

import { Money } from '../../../domain/billing/value-objects/Money';
import { UsageEventRepository, BillingPeriodRepository } from '../../../domain/billing/repositories';
import { EventType } from '../../../domain/billing/enums';

export interface BillingStatusDTO {
  userId: string;
  currentMonth: string; // YYYY-MM
  currentBillPaise: number;
  expectedBillPaise: number; // Current + Projected storage for remainder of month
  breakdown: Array<{
    type: EventType;
    count: number;
    totalPaise: number;
  }>;
  storageUsageGB: number;
  lastUpdated: number;
}

export class GetBillingStatusUseCase {
  constructor(
    private usageRepo: UsageEventRepository,
    private periodRepo: BillingPeriodRepository
  ) {}

  async execute(userId: string): Promise<BillingStatusDTO> {
    const currentPeriodId = this.getCurrentPeriodId();
    const period = await this.periodRepo.get(userId, currentPeriodId);

    const currentMonth = currentPeriodId;
    if (!period) {
      // If no period exists, it means no usage yet this month
      return this.createEmptyStatus(userId, currentMonth);
    }

    const usageEvents = await this.usageRepo.findByPeriod(userId, currentPeriodId);
    
    const breakdown = this.calculateBreakdown(usageEvents);
    const storageUsage = this.getStorageUsage(usageEvents);

    // Calculation for expected bill:
    // We'll refine this in the PricingService later.
    const expectedBillPaise = period.currentBill.amountInSmallestUnit; // Fallback for now

    return {
      userId,
      currentMonth: currentPeriodId,
      currentBillPaise: period.currentBill.amountInSmallestUnit,
      expectedBillPaise,
      breakdown,
      storageUsageGB: storageUsage,
      lastUpdated: period['props'].updatedAt,
    };
  }

  private getCurrentPeriodId(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private calculateBreakdown(events: any[]): any[] {
    const map = new Map<EventType, { count: number; total: number }>();
    
    for (const event of events) {
      const type = event.props.eventType;
      const cost = event.props.estimatedCost.amountInSmallestUnit;
      
      if (!map.has(type)) {
        map.set(type, { count: 0, total: 0 });
      }
      
      const stats = map.get(type)!;
      stats.count++;
      stats.total += cost;
    }

    return Array.from(map.entries()).map(([type, stats]) => ({
      type,
      count: stats.count,
      totalPaise: stats.total
    }));
  }

  private getStorageUsage(events: any[]): number {
    // Placeholder: In a real system, we'd have a specific record for storage usage
    // For now, we look for the latest storage event
    const storageEvents = events.filter(e => e.props.eventType === EventType.UPLOAD_STORE_GB_MONTH);
    if (storageEvents.length === 0) return 0;
    
    // Sort by timestamp desc and get quantity
    return storageEvents[storageEvents.length - 1].props.quantity || 0;
  }

  private createEmptyStatus(userId: string, currentMonth: string): BillingStatusDTO {
    return {
      userId,
      currentMonth,
      currentBillPaise: 0,
      expectedBillPaise: 0,
      breakdown: [],
      storageUsageGB: 0,
      lastUpdated: Date.now(),
    };
  }

  private getDaysInMonth(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }
}
