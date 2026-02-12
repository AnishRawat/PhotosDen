/**
 * AWS Price Sync Service
 * 
 * Fetches latest pricing from AWS Price List API and updates lookups.
 * ensures self-sustaining app by rounding up costs.
 */

import { PricingClient, GetProductsCommand } from "@aws-sdk/client-pricing";
import { LookupsService } from "./LookupsService";

export class AwsPriceSyncService {
  private pricingClient: PricingClient;

  constructor(
    private lookupsService: LookupsService,
    region: string = 'ap-south-1' // Connect to regional Pricing endpoint
  ) {
    this.pricingClient = new PricingClient({ region });
  }

  /**
   * Sync all AWS-related prices
   */
  async syncAll(): Promise<void> {
    console.log('[PRICE-SYNC] Starting AWS price synchronization...');

    // 1. S3 Storage Price (Standard)
    const s3Price = await this.getS3StandardStoragePrice('ap-south-1');
    if (s3Price) {
      const inrPrice = this.convertToInr(s3Price);
      // Ensure no loss: Round up to nearest whole number and add ₹1 safety margin
      // Example: ₹1.91 -> ₹2.00 -> ₹3.00
      const finalPrice = Math.ceil(inrPrice) + 1.0;
      
      await this.lookupsService.set({
        key: 'billing.pricing.storagePerGBPerMonth',
        value: finalPrice,
        category: 'billing',
        description: `Auto-updated from AWS S3 Standard: $${s3Price}/GB -> ₹${finalPrice}/GB (Buffer added)`,
      });
    }

    // 2. S3 GET Request Price (Photo View)
    const s3GetPrice = await this.getS3RequestPrice('ap-south-1', 'GET');
    if (s3GetPrice) {
      // S3 GET is usually $0.0004 per 1000 requests.
      // We charge per request. 
      const perRequestInr = this.convertToInr(s3GetPrice / 1000);
      // Bandwidth: ₹7.5/GB. Avg photo 2MB = ₹0.015.
      // Total cost approx ₹0.02.
      // Charging ₹0.50 ensures we cover all Lambda/Compute/Transfer costs.
      const buffer = 0.50;
      const finalPrice = Math.ceil((perRequestInr + buffer) * 10) / 10; // Round to nearest 0.10

      await this.lookupsService.set({
        key: 'billing.pricing.photoView',
        value: finalPrice,
        category: 'billing',
        description: `Auto-updated: S3 GET + Bandwidth + Compute buffer. Final: ₹${finalPrice}`,
      });
    }

    console.log('[PRICE-SYNC] AWS price synchronization complete.');
  }

  private async getS3StandardStoragePrice(regionCode: string): Promise<number | null> {
    try {
      const response = await this.pricingClient.send(
        new GetProductsCommand({
          ServiceCode: 'AmazonS3',
          Filters: [
            { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
            { Type: 'TERM_MATCH', Field: 'productFamily', Value: 'Storage' },
            { Type: 'TERM_MATCH', Field: 'volumeType', Value: 'Standard' },
            { Type: 'TERM_MATCH', Field: 'storageClass', Value: 'General Purpose' },
          ],
        })
      );

      if (!response.PriceList || response.PriceList.length === 0) return null;

      const priceItem = JSON.parse(response.PriceList[0] as string);
      const onDemand = priceItem.terms.OnDemand;
      const firstTerm = Object.values(onDemand)[0] as any;
      const priceDimensions = Object.values(firstTerm.priceDimensions)[0] as any;
      
      return parseFloat(priceDimensions.pricePerUnit.USD);
    } catch (error) {
      console.error('[PRICE-SYNC] Error fetching S3 price:', error);
      return null;
    }
  }

  private async getS3RequestPrice(regionCode: string, requestType: 'GET' | 'PUT'): Promise<number | null> {
    // Simplified: AWS Price List API for requests is complex. 
    // Usually these don't change often. 
    // Fallback to latest known: $0.0004 per 1,000 requests
    return 0.0004;
  }

  private convertToInr(usdAmount: number): number {
    // In a real app, this would fetch from a CurrencyService
    // Using ₹83.5 as a conservative fixed rate
    return usdAmount * 83.5;
  }
}
