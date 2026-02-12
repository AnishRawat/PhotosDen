/**
 * Money Value Object
 * 
 * Represents monetary amounts with precision and currency.
 * Uses integer arithmetic (smallest unit: paise for INR, cents for USD) to avoid floating-point errors.
 * 
 * Critical Fix Applied: Integer-based amounts instead of floating point
 */

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'SGD' | 'AED';

export interface CurrencyMetadata {
  code: CurrencyCode;
  symbol: string;
  name: string;
  decimals: number; // 2 for most currencies, 0 for JPY, KRW
  smallestUnit: string; // 'paise' for INR, 'cents' for USD
}

export const CURRENCY_METADATA: Record<CurrencyCode, CurrencyMetadata> = {
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2, smallestUnit: 'paise' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, smallestUnit: 'cents' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, smallestUnit: 'cents' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2, smallestUnit: 'pence' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0, smallestUnit: 'yen' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2, smallestUnit: 'cents' },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2, smallestUnit: 'cents' },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2, smallestUnit: 'cents' },
  AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham', decimals: 2, smallestUnit: 'fils' }
};

/**
 * Money value object using integer arithmetic
 */
export class Money {
  private constructor(
    private readonly _amountInSmallestUnit: number, // Integer: paise, cents, etc.
    private readonly _currency: CurrencyCode
  ) {
    // Validate
    if (!Number.isInteger(_amountInSmallestUnit)) {
      throw new Error('Amount must be an integer (smallest currency unit)');
    }
    
    if (_amountInSmallestUnit < 0) {
      throw new Error('Amount cannot be negative');
    }
    
    if (!CURRENCY_METADATA[_currency]) {
      throw new Error(`Unsupported currency: ${_currency}`);
    }
  }
  
  // ===== Factory Methods =====
  
  /**
   * Create Money from smallest unit (paise, cents, etc.)
   * @example Money.fromSmallestUnit(10050, 'INR') // ₹100.50
   */
  static fromSmallestUnit(amount: number, currency: CurrencyCode = 'INR'): Money {
    return new Money(amount, currency);
  }
  
  /**
   * Create Money from major unit (rupees, dollars, etc.)
   * @example Money.fromMajorUnit(100.50, 'INR') // ₹100.50 (stored as 10050 paise)
   */
  static fromMajorUnit(amount: number, currency: CurrencyCode = 'INR'): Money {
    const decimals = CURRENCY_METADATA[currency].decimals;
    const multiplier = Math.pow(10, decimals);
    const amountInSmallestUnit = Math.round(amount * multiplier);
    
    return new Money(amountInSmallestUnit, currency);
  }
  
  /**
   * Create zero money
   */
  static zero(currency: CurrencyCode = 'INR'): Money {
    return new Money(0, currency);
  }
  
  // ===== Getters =====
  
  get amountInSmallestUnit(): number {
    return this._amountInSmallestUnit;
  }
  
  get currency(): CurrencyCode {
    return this._currency;
  }
  
  get amountInMajorUnit(): number {
    const decimals = CURRENCY_METADATA[this._currency].decimals;
    const divisor = Math.pow(10, decimals);
    return this._amountInSmallestUnit / divisor;
  }
  
  get symbol(): string {
    return CURRENCY_METADATA[this._currency].symbol;
  }
  
  get metadata(): CurrencyMetadata {
    return CURRENCY_METADATA[this._currency];
  }
  
  // ===== Operations (Immutable) =====
  
  /**
   * Add two Money values (must be same currency)
   */
  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(
      this._amountInSmallestUnit + other._amountInSmallestUnit,
      this._currency
    );
  }
  
  /**
   * Subtract another Money value (must be same currency)
   */
  subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    const result = this._amountInSmallestUnit - other._amountInSmallestUnit;
    
    if (result < 0) {
      throw new Error('Subtraction would result in negative amount');
    }
    
    return new Money(result, this._currency);
  }
  
  /**
   * Multiply by a scalar (e.g., quantity)
   */
  multiply(multiplier: number): Money {
    if (multiplier < 0) {
      throw new Error('Multiplier cannot be negative');
    }
    
    return new Money(
      Math.round(this._amountInSmallestUnit * multiplier),
      this._currency
    );
  }
  
  /**
   * Divide by a scalar
   */
  divide(divisor: number): Money {
    if (divisor <= 0) {
      throw new Error('Divisor must be positive');
    }
    
    return new Money(
      Math.round(this._amountInSmallestUnit / divisor),
      this._currency
    );
  }
  
  // ===== Comparison =====
  
  equals(other: Money): boolean {
    return (
      this._amountInSmallestUnit === other._amountInSmallestUnit &&
      this._currency === other._currency
    );
  }
  
  isGreaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amountInSmallestUnit > other._amountInSmallestUnit;
  }
  
  isGreaterThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amountInSmallestUnit >= other._amountInSmallestUnit;
  }
  
  isLessThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amountInSmallestUnit < other._amountInSmallestUnit;
  }
  
  isLessThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amountInSmallestUnit <= other._amountInSmallestUnit;
  }
  
  isZero(): boolean {
    return this._amountInSmallestUnit === 0;
  }
  
  isPositive(): boolean {
    return this._amountInSmallestUnit > 0;
  }
  
  // ===== Formatting =====
  
  /**
   * Format as string with currency symbol
   * @example money.toString() // "₹100.50"
   */
  toString(): string {
    const decimals = CURRENCY_METADATA[this._currency].decimals;
    const formatted = this.amountInMajorUnit.toFixed(decimals);
    return `${this.symbol}${formatted}`;
  }
  
  /**
   * Format with locale-specific formatting
   * @example money.toLocaleString('en-IN') // "₹1,00,000.50"
   */
  toLocaleString(locale: string = 'en-IN'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this._currency
    }).format(this.amountInMajorUnit);
  }
  
  /**
   * Convert to plain object for serialization
   */
  toJSON() {
    return {
      amountInSmallestUnit: this._amountInSmallestUnit,
      currency: this._currency,
      amountInMajorUnit: this.amountInMajorUnit
    };
  }
  
  /**
   * Create Money from JSON
   */
  static fromJSON(json: { amountInSmallestUnit: number; currency: CurrencyCode }): Money {
    return new Money(json.amountInSmallestUnit, json.currency);
  }
  
  // ===== Private Helpers =====
  
  private ensureSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Cannot operate on different currencies: ${this._currency} and ${other._currency}`
      );
    }
  }
}
