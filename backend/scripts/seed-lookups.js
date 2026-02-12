#!/usr/bin/env node
/**
 * Seed Lookups - Initial Configuration Data
 * 
 * Run: node scripts/seed-lookups.js
 * 
 * Populates DynamoDB with initial runtime configuration values.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LookupsService } from '../dist/infrastructure/config/LookupsService.js';

const dynamoDB = new DynamoDBClient({ region: 'ap-south-1' });
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'photosden-main';
const lookupsService = new LookupsService(dynamoDB, TABLE_NAME);

const initialLookups = [
  // ===== Billing Pricing (Cost-Recovery, No Profit Margin) =====
  {
    key: 'billing.pricing.photoView',
    value: 0.10,
    category: 'billing',
    description: 'Cost to view/retrieve a single photo (INR) - covers S3 GET + bandwidth + Lambda',
  },
  {
    key: 'billing.pricing.zipDownload',
    value: 1.00,
    category: 'billing',
    description: 'Cost to download photos as ZIP (INR) - covers compute + bandwidth',
  },
  {
    key: 'billing.pricing.shareLink',
    value: 0.10,
    category: 'billing',
    description: 'Cost to create a share link (INR) - covers DynamoDB + Lambda + monitoring',
  },
  {
    key: 'billing.pricing.storagePerGBPerMonth',
    value: 2.00,
    category: 'billing',
    description: 'Monthly storage cost per GB (INR) - covers S3 + DynamoDB metadata',
  },

  // ===== Billing Thresholds =====
  {
    key: 'billing.thresholds.minimumBalance',
    value: 5.00,
    category: 'billing',
    description: 'Minimum balance threshold before warnings (INR) - enough for ~50 photo views',
  },
  {
    key: 'billing.thresholds.lowBalanceWarning',
    value: 20.00,
    category: 'billing',
    description: 'Balance level that triggers low-balance warnings (INR) - enough for ~10GB storage',
  },
  {
    key: 'billing.thresholds.gracePeriodDays',
    value: 7,
    category: 'billing',
    description: 'Days before account suspension after insufficient funds',
  },

  // ===== Billing Limits =====
  {
    key: 'billing.limits.minDeposit',
    value: 10.00,
    category: 'limits',
    description: 'Minimum deposit amount (INR)',
  },
  {
    key: 'billing.limits.maxDeposit',
    value: 10000.00,
    category: 'limits',
    description: 'Maximum deposit amount per transaction (INR)',
  },
  {
    key: 'billing.limits.minWithdrawal',
    value: 50.00,
    category: 'limits',
    description: 'Minimum withdrawal amount (INR)',
  },

  // ===== UI Messages - Zero Balance Warning =====
  {
    key: 'ui.warnings.zeroBalance.title',
    value: 'Zero Balance Warning',
    category: 'ui',
    description: 'Title for zero balance warning dialog',
  },
  {
    key: 'ui.warnings.zeroBalance.message',
    value: 'You can upload photos for FREE, but retrieving them later costs ₹0.10 per view. Add funds to your wallet to view uploaded photos.',
    category: 'ui',
    description: 'Message body for zero balance warning',
  },
  {
    key: 'ui.warnings.zeroBalance.uploadInfo',
    value: '• Storing photos costs ₹2/GB/month (cost-recovery pricing)\n• Retrieving photos costs ₹0.10 per view\n• ZIP downloads cost ₹1 each\n• Share links cost ₹0.10 each',
    category: 'ui',
    description: 'Cost breakdown info for zero balance warning',
  },

  // ===== UI Messages - Insufficient Balance =====
  {
    key: 'ui.messages.insufficientBalance.title',
    value: 'Insufficient Balance',
    category: 'ui',
    description: 'Title for insufficient balance dialog',
  },
  {
    key: 'ui.messages.insufficientBalance.template',
    value: 'You need ₹{amount} to {action}.\n\nCurrent balance: ₹{balance}',
    category: 'ui',
    description: 'Message template for insufficient balance (supports {amount}, {action}, {balance} placeholders)',
  },

  // ===== UI Messages - Grace Period =====
  {
    key: 'ui.messages.gracePeriod.title',
    value: 'Account in Grace Period',
    category: 'ui',
    description: 'Title for grace period warning',
  },
  {
    key: 'ui.messages.gracePeriod.template',
    value: 'Your account has insufficient funds. You have {days} days left to add funds before your account is suspended.',
    category: 'ui',
    description: 'Message template for grace period (supports {days} placeholder)',
  },

  // ===== Feature Flags =====
  {
    key: 'features.sharingEnabled',
    value: true,
    category: 'features',
    description: 'Enable/disable photo sharing feature',
  },
  {
    key: 'features.zipDownloadEnabled',
    value: true,
    category: 'features',
    description: 'Enable/disable ZIP download feature',
  },
  {
    key: 'features.multiCurrencyEnabled',
    value: false,
    category: 'features',
    description: 'Enable/disable multi-currency support (future)',
  },
];

async function seed() {
  console.log('🌱 Seeding lookups configuration...\n');

  for (const lookup of initialLookups) {
    console.log(`  Setting: ${lookup.key} = ${JSON.stringify(lookup.value)}`);
    await lookupsService.set(lookup);
  }

  console.log(`\n✅ Successfully seeded ${initialLookups.length} lookups!\n`);
  console.log('Test it: GET https://YOUR_API/dev/lookups\n');
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
