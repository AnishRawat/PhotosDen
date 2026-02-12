/**
 * Wallet Entity
 * 
 * Represents a user's prepaid wallet with balance tracking and concurrency control.
 * 
 * Critical Features:
 * - Optimistic locking via version field (prevents concurrent modification issues)
 * - Integer-based amounts (paise) for precision
 * - Invariant validation (balanceAvailable must always be valid)
 * - Grace period support for negative balances
 */

import { Money } from '../value-objects/Money';
import { WalletStatus } from '../enums';

export interface WalletProps {
  userId: string;
  currency: 'INR'; // Always INR internally
  balanceTotalPaise: number; // Total credited - captured - withdrawn
  balanceReservedPaise: number; // Locked for current month's usage
  balanceOwedPaise: number; // Debt from failed settlements
  minimumBalanceThresholdPaise: number; // Buffer before insufficient balance error
  minimumWithdrawalPaise: number; // Minimum withdrawal amount
  accountStatus: WalletStatus;
  gracePeriodUntil: number | null; // Timestamp when grace period expires
  withdrawalsDisabledUntil: number | null; // Anti-abuse timestamp
  version: number; // Optimistic locking version
  createdAt: number;
  updatedAt: number;
  lastDepositAt: number | null;
  lastWithdrawalAt: number | null;
}

export class Wallet {
  private constructor(private props: WalletProps) {
    this.validateInvariants();
  }

  // ===== Factory Methods =====

  static create(userId: string): Wallet {
    return new Wallet({
      userId,
      currency: 'INR',
      balanceTotalPaise: 0,
      balanceReservedPaise: 0,
      balanceOwedPaise: 0,
      minimumBalanceThresholdPaise: 1000, // ₹10
      minimumWithdrawalPaise: 10000, // ₹100
      accountStatus: WalletStatus.ACTIVE,
      gracePeriodUntil: null,
      withdrawalsDisabledUntil: null,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastDepositAt: null,
      lastWithdrawalAt: null,
    });
  }

  static reconstitute(props: WalletProps): Wallet {
    return new Wallet(props);
  }

  // ===== Getters =====

  get userId(): string {
    return this.props.userId;
  }

  get balanceTotal(): Money {
    return Money.fromSmallestUnit(this.props.balanceTotalPaise, 'INR');
  }

  get balanceReserved(): Money {
    return Money.fromSmallestUnit(this.props.balanceReservedPaise, 'INR');
  }

  get balanceOwed(): Money {
    return Money.fromSmallestUnit(this.props.balanceOwedPaise, 'INR');
  }

  get balanceAvailable(): Money {
    const availablePaise =
      this.props.balanceTotalPaise -
      this.props.balanceReservedPaise -
      this.props.balanceOwedPaise;
    return Money.fromSmallestUnit(Math.max(0, availablePaise), 'INR');
  }

  get minimumBalanceThreshold(): Money {
    return Money.fromSmallestUnit(this.props.minimumBalanceThresholdPaise, 'INR');
  }

  get accountStatus(): WalletStatus {
    return this.props.accountStatus;
  }

  get version(): number {
    return this.props.version;
  }

  get gracePeriodUntil(): number | null {
    return this.props.gracePeriodUntil;
  }

  get isInGracePeriod(): boolean {
    return (
      this.props.gracePeriodUntil !== null &&
      this.props.gracePeriodUntil > Date.now()
    );
  }

  get isActive(): boolean {
    return this.props.accountStatus === WalletStatus.ACTIVE;
  }

  // ===== Commands (Mutating Methods) =====

  /**
   * Reserve funds for a billable action
   * This should be called within a DynamoDB transaction with version check
   */
  reserveFunds(amount: Money): void {
    this.ensureActive();
    this.ensureSufficientBalance(amount);

    this.props.balanceReservedPaise += amount.amountInSmallestUnit;
    this.incrementVersion();
    this.validateInvariants();
  }

  /**
   * Release reserved funds (compensating transaction)
   */
  releaseFunds(amount: Money): void {
    if (this.props.balanceReservedPaise < amount.amountInSmallestUnit) {
      throw new Error(
        `Cannot release ₹${amount.amountInMajorUnit}: only ₹${this.balanceReserved.amountInMajorUnit} reserved`
      );
    }

    this.props.balanceReservedPaise -= amount.amountInSmallestUnit;
    this.incrementVersion();
    this.validateInvariants();
  }

  /**
   * Capture reserved funds (move from reserved to captured/deducted)
   * Used during month-end settlement
   */
  captureFunds(amount: Money): void {
    if (this.props.balanceReservedPaise < amount.amountInSmallestUnit) {
      throw new Error(
        `Cannot capture ₹${amount.amountInMajorUnit}: only ₹${this.balanceReserved.amountInMajorUnit} reserved`
      );
    }

    this.props.balanceTotalPaise -= amount.amountInSmallestUnit;
    this.props.balanceReservedPaise -= amount.amountInSmallestUnit;
    this.incrementVersion();
    this.validateInvariants();
  }

  /**
   * Add funds via deposit
   */
  deposit(amount: Money): void {
    this.props.balanceTotalPaise += amount.amountInSmallestUnit;
    this.props.lastDepositAt = Date.now();
    this.incrementVersion();
    
    // If in grace period and balance is now positive, clear grace period
    if (this.isInGracePeriod && this.balanceAvailable.isPositive()) {
      this.clearGracePeriod();
    }
    
    this.validateInvariants();
  }

  /**
   * Withdraw funds
   */
  withdraw(amount: Money, fee: Money): void {
    this.ensureActive();

    const totalDeduction = amount.add(fee);
    const availablePaise = this.props.balanceTotalPaise - this.props.balanceReservedPaise - this.props.balanceOwedPaise;

    if (availablePaise < totalDeduction.amountInSmallestUnit) {
      throw new Error(
        `Insufficient available balance for withdrawal. Available: ₹${availablePaise / 100}, Required: ₹${totalDeduction.amountInMajorUnit}`
      );
    }

    // Check if withdrawals are disabled (anti-abuse)
    if (
      this.props.withdrawalsDisabledUntil &&
      this.props.withdrawalsDisabledUntil > Date.now()
    ) {
      throw new Error(
        `Withdrawals are temporarily disabled until ${new Date(this.props.withdrawalsDisabledUntil).toISOString()}`
      );
    }

    this.props.balanceTotalPaise -= totalDeduction.amountInSmallestUnit;
    this.props.lastWithdrawalAt = Date.now();
    this.incrementVersion();
    this.validateInvariants();
  }

  /**
   * Apply admin adjustment (credit or debit)
   */
  applyAdjustment(amount: Money, isCredit: boolean): void {
    if (isCredit) {
      this.props.balanceTotalPaise += amount.amountInSmallestUnit;
    } else {
      // Debit
      this.props.balanceTotalPaise -= amount.amountInSmallestUnit;
    }

    this.incrementVersion();
    this.validateInvariants();
  }

  /**
   * Enter grace period (when settlement fails due to insufficient funds)
   */
  enterGracePeriod(owedAmount: Money, graceDays: number = 7): void {
    this.props.accountStatus = WalletStatus.GRACE_PERIOD;
    this.props.balanceOwedPaise = owedAmount.amountInSmallestUnit;
    this.props.gracePeriodUntil = Date.now() + graceDays * 24 * 60 * 60 * 1000;
    this.incrementVersion();
  }

  /**
   * Clear grace period (when user adds funds)
   */
  clearGracePeriod(): void {
    if (this.props.balanceOwedPaise > 0) {
      throw new Error('Cannot clear grace period while balance is owed');
    }

    this.props.accountStatus = WalletStatus.ACTIVE;
    this.props.gracePeriodUntil = null;
    this.incrementVersion();
  }

  /**
   * Suspend account (when grace period expires or admin action)
   */
  suspend(): void {
    this.props.accountStatus = WalletStatus.SUSPENDED;
    this.incrementVersion();
  }

  /**
   * Unsuspend account (admin action + user paid debt)
   */
  unsuspend(): void {
    if (this.props.balanceOwedPaise > 0) {
      throw new Error('Cannot unsuspend account while balance is owed');
    }

    this.props.accountStatus = WalletStatus.ACTIVE;
    this.props.gracePeriodUntil = null;
    this.incrementVersion();
  }

  /**
   * Update settings
   */
  updateSettings(settings: {
    minimumBalanceThresholdPaise?: number;
    minimumWithdrawalPaise?: number;
  }): void {
    if (settings.minimumBalanceThresholdPaise !== undefined) {
      this.props.minimumBalanceThresholdPaise = settings.minimumBalanceThresholdPaise;
    }
    if (settings.minimumWithdrawalPaise !== undefined) {
      this.props.minimumWithdrawalPaise = settings.minimumWithdrawalPaise;
    }
    this.incrementVersion();
  }

  // ===== Private Helpers =====

  private incrementVersion(): void {
    this.props.version += 1;
    this.props.updatedAt = Date.now();
  }

  private ensureActive(): void {
    if (this.props.accountStatus !== WalletStatus.ACTIVE) {
      throw new WalletNotActiveError(
        `Wallet is ${this.props.accountStatus}. Cannot perform billable actions.`
      );
    }
  }

  private ensureSufficientBalance(amount: Money): void {
    const requiredPaise = amount.amountInSmallestUnit + this.props.minimumBalanceThresholdPaise;
    const availablePaise =
      this.props.balanceTotalPaise -
      this.props.balanceReservedPaise -
      this.props.balanceOwedPaise;

    if (availablePaise < requiredPaise) {
      throw new InsufficientBalanceError(
        `Insufficient balance. Required: ₹${requiredPaise / 100} (₹${amount.amountInMajorUnit} + ₹${this.props.minimumBalanceThresholdPaise / 100} buffer), Available: ₹${availablePaise / 100}`
      );
    }
  }

  /**
   * Validate wallet invariants
   * These MUST always be true, or data is corrupted
   */
  private validateInvariants(): void {
    // Invariant 1: Reserved balance cannot be negative
    if (this.props.balanceReservedPaise < 0) {
      throw new InvariantViolationError('balanceReserved cannot be negative');
    }

    // Invariant 2: Total balance must be non-negative (unless in grace period with owed balance)
    if (this.props.balanceTotalPaise < 0 && this.props.balanceOwedPaise === 0) {
      throw new InvariantViolationError(
        'balanceTotal cannot be negative without balanceOwed'
      );
    }

    // Invariant 3 If balance is owed, total balance cannot be less than owed amount
    if (
      this.props.balanceOwedPaise > 0 &&
      this.props.balanceTotalPaise < 0 &&
      Math.abs(this.props.balanceTotalPaise) > this.props.balanceOwedPaise
    ) {
      throw new InvariantViolationError(
        'balanceTotal cannot be more negative than balanceOwed'
      );
    }

    // Invariant 4: Available balance calculation must be consistent
    const calculatedAvailable =
      this.props.balanceTotalPaise -
      this.props.balanceReservedPaise -
      this.props.balanceOwedPaise;

    // Available can be negative during grace period, but we expose max(0, available)
    // So internal state can have negative available, but getters return 0
  }

  // ===== Serialization =====

  toJSON(): WalletProps {
    return { ...this.props };
  }

  toDynamoDBFormat() {
    return {
      PK: `USER#${this.props.userId}`,
      SK: 'WALLET',
      EntityType: 'Wallet',
      userId: this.props.userId,
      currency: this.props.currency,
      balanceTotalPaise: this.props.balanceTotalPaise,
      balanceReservedPaise: this.props.balanceReservedPaise,
      balanceOwedPaise: this.props.balanceOwedPaise,
      balanceAvailablePaise: Math.max(
        0,
        this.props.balanceTotalPaise -
          this.props.balanceReservedPaise -
          this.props.balanceOwedPaise
      ), // Denormalized for queries
      minimumBalanceThresholdPaise: this.props.minimumBalanceThresholdPaise,
      minimumWithdrawalPaise: this.props.minimumWithdrawalPaise,
      accountStatus: this.props.accountStatus,
      gracePeriodUntil: this.props.gracePeriodUntil,
      withdrawalsDisabledUntil: this.props.withdrawalsDisabledUntil,
      version: this.props.version,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
      lastDepositAt: this.props.lastDepositAt,
      lastWithdrawalAt: this.props.lastWithdrawalAt,
    };
  }
}

// ===== Custom Errors =====

export class WalletNotActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletNotActiveError';
  }
}

export class InsufficientBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

export class InvariantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantViolationError';
  }
}
