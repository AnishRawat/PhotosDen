# 🛠️ Lookups Configuration Guide

This guide explains how to manage the runtime configuration (Lookups) for PhotosDen.

## 📝 Overview
Lookups are key-value pairs stored in the DynamoDB table (`photosden-main`) with:
- **PK**: `SYSTEM#CONFIG`
- **SK**: The lookup key (e.g., `billing.pricing.photoView`)

These values control pricing, UI messages, and feature flags without requiring a code redeploy.

---

## 🔄 How Updates Work

### 1. Automated Updates (AWS Price Sync)
Most pricing lookups are updated automatically by a scheduled job (`SyncAwsPricesJob`).
- **Frequency**: Every 24 hours.
- **Logic**: 
  - Fetches latest rates from AWS Price List API.
  - Converts USD to INR.
  - **Loss Prevention**: Applies `Math.ceil(cost * 100) / 100 + 0.01` (rounds up to nearest paise and adds a small safety buffer).
  - Updates the DynamoDB table.

### 2. Manual Updates (Emergency/UI)
If you need to change a UI message or override a price manually:

#### Via AWS Console
1. Navigate to DynamoDB > Tables > `photosden-main`.
2. Use **Explore Items**.
3. Filter by **Partition Key (PK)** = `SYSTEM#CONFIG`.
4. Select the item and click **Edit**.
5. Update the `value` field.
6. **Important**: After manual update, call the refresh endpoint to clear the backend cache.

#### Via API (Refresh Cache)
```bash
curl -X POST https://YOUR_API_URL/dev/lookups/refresh \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 📋 Common Lookup Keys

| Key | Description | Managed By |
| --- | --- | --- |
| `billing.pricing.storagePerGBPerMonth` | Cost per GB/month for S3 storage | **AWS Sync Job** |
| `billing.pricing.photoView` | Cost for retrieving/viewing a photo | **AWS Sync Job** |
| `billing.pricing.zipDownload` | Cost for compute-heavy ZIP generation | Manual (Admin) |
| `ui.warnings.zeroBalance.title` | Warning title when wallet is empty | Manual (Admin) |
| `features.sharingEnabled` | Global toggle for sharing | Manual (Admin) |

---

## 🏗️ Seeding Defaults
If you are setting up a new environment, run the seed script:
```bash
cd backend
node scripts/seed-lookups.js
```

---

## ⚡ Cache Policy
The backend handlers cache lookups in memory for **30 minutes**.
- Changes in DynamoDB will take up to 30 mins to reflect in the API.
- Use `/lookups/refresh` to force an immediate update.
