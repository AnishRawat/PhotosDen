/**
 * Get Wallet Balance Use Case
 */

import { Wallet } from '../../../domain/billing/entities/Wallet';
import { WalletRepository } from '../../../domain/billing/repositories';
import { Money } from '../../../domain/billing/value-objects/Money';

export interface WalletBalanceDTO {
  userId: string;
  balanceTotalPaise: number;
  balanceReservedPaise: number;
  balanceOwedPaise: number;
  balanceAvailablePaise: number;
  minimumBalanceThresholdPaise: number;
  accountStatus: string;
  isInGracePeriod: boolean;
  gracePeriodUntil: number | null;
  version: number;
  lastDepositAt: number | null;
}

export class GetWalletBalanceUseCase {
  constructor(private walletRepo: WalletRepository) {}

  async execute(userId: string): Promise<WalletBalanceDTO> {
    const wallet = await this.walletRepo.get(userId);
    
    if (!wallet) {
      throw new Error(`Wallet not found for user ${userId}`);
    }

    return {
      userId,
      balanceTotalPaise: wallet.balanceTotal.amountInSmallestUnit,
      balanceReservedPaise: wallet.balanceReserved.amountInSmallestUnit,
      balanceOwedPaise: wallet.balanceOwed.amountInSmallestUnit,
      balanceAvailablePaise: wallet.balanceAvailable.amountInSmallestUnit,
      minimumBalanceThresholdPaise: wallet.minimumBalanceThreshold.amountInSmallestUnit,
      accountStatus: wallet.accountStatus,
      isInGracePeriod: wallet.isInGracePeriod,
      gracePeriodUntil: wallet.gracePeriodUntil,
      version: wallet.version,
      lastDepositAt: wallet['props'].lastDepositAt,
    };
  }
}
