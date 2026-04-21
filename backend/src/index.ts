import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Router } from "./shared/router/Router.js";
import { signupHandler, loginHandler, confirmHandler, resendCodeHandler, forgotPasswordHandler, resetPasswordHandler } from "./interfaces/handlers/auth-handlers.js";
import { getProfileHandler, updateProfileHandler } from "./interfaces/handlers/profile-handlers.js";
import { initiateUploadHandler, listUploadsHandler, getUploadPhotosHandler, completeUploadHandler } from "./interfaces/handlers/upload-handlers.js";
import { createAlbumHandler, listAlbumsHandler, getAlbumHandler, deleteAlbumHandler, updateAlbumPhotosHandler, getAlbumPhotosHandler } from "./interfaces/handlers/album-handlers.js";
import { getPhotoDownloadUrlHandler, deletePhotoHandler, toggleFavoriteHandler, listFavoritesHandler } from "./interfaces/handlers/photo-handlers.js";
import { listTrashHandler, restoreItemsHandler, permanentPurgeHandler } from "./interfaces/handlers/trash-handlers.js";
import { createShareHandler, listActiveSharesHandler, updateShareStatusHandler, archiveShareHandler, getShareVisitsHandler, publicShareAccessHandler } from "./interfaces/handlers/share-handlers.js";
import { generateSwaggerTestHandler } from "./interfaces/handlers/devtools-handlers.js";
import { getWalletHandler, createDepositHandler, getDepositsHandler } from "./interfaces/handlers/billing-handlers.js";
import { getLookupsHandler, refreshLookupsHandler } from "./interfaces/handlers/lookups-handlers.js";
import { getBillingStatusHandler } from "./interfaces/handlers/billing-status-handlers.js";
import { syncAwsPricesHandler, manualPriceSyncHandler } from "./interfaces/handlers/pricing-handlers.js";
import { BillingGuard } from "./infrastructure/billing/BillingGuard.js";
import { LookupsService } from "./infrastructure/config/LookupsService.js";
import { DynamoDBWalletRepository } from "./infrastructure/database/repositories/DynamoDBWalletRepository.js";
import { DEFAULT_CORS_HEADERS } from "./shared/http/cors.js";

// DI for use cases (This is a simplified approach, in a larger app we'd have a container)
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBUsageEventRepository } from "./infrastructure/database/repositories/DynamoDBUsageEventRepository.js";
import { DynamoDBBillingPeriodRepository } from "./infrastructure/database/repositories/DynamoDBBillingPeriodRepository.js";
import { GetBillingStatusUseCase } from "./application/billing/use-cases/GetBillingStatusUseCase.js";

const ddb = new DynamoDBClient({});
const TABLE = process.env.DYNAMODB_TABLE_NAME || 'photosden-main';
const usageRepo = new DynamoDBUsageEventRepository(ddb, TABLE);
const periodRepo = new DynamoDBBillingPeriodRepository(ddb, TABLE);
const walletRepo = new DynamoDBWalletRepository(ddb, TABLE);
const lookupsService = new LookupsService(ddb, TABLE);

const billingGuard = new BillingGuard(walletRepo, usageRepo, lookupsService);
const getBillingStatusUseCase = new GetBillingStatusUseCase(usageRepo, periodRepo);

const router = new Router();

// Authentication Routes
router.on("POST", "/auth/signup", signupHandler);
router.on("POST", "/auth/login", loginHandler);
router.on("POST", "/auth/confirm", confirmHandler);
router.on("POST", "/auth/resend-code", resendCodeHandler);
router.on("POST", "/auth/password/forgot", forgotPasswordHandler);
router.on("POST", "/auth/password/reset", resetPasswordHandler);

// Profile Routes
router.on("GET", "/profile", getProfileHandler);
router.on("PATCH", "/profile", updateProfileHandler); // Fixed: OpenAPI spec uses PATCH, not PUT

// Upload Routes
router.on("POST", "/uploads", initiateUploadHandler);
router.on("GET", "/uploads", listUploadsHandler);
router.on("GET", "/uploads/:uploadId", getUploadPhotosHandler);
router.on("POST", "/uploads/:uploadId/complete", completeUploadHandler);

// Album Routes
router.on("POST", "/albums", createAlbumHandler);
router.on("GET", "/albums", listAlbumsHandler);
router.on("GET", "/albums/:albumId", getAlbumHandler);
router.on("DELETE", "/albums/:albumId", deleteAlbumHandler);
router.on("PUT", "/albums/:albumId/photos", updateAlbumPhotosHandler);
router.on("GET", "/albums/:albumId/photos", getAlbumPhotosHandler);

// Photo Routes
// NOTE: Static paths must be registered before dynamic :photoId to avoid capture conflicts.
router.on("GET", "/photos/favorites", listFavoritesHandler);
router.on("GET", "/photos/:photoId", (event) => getPhotoDownloadUrlHandler(event, billingGuard));
router.on("DELETE", "/photos/:photoId", deletePhotoHandler);
router.on("PUT", "/photos/:photoId/favorite", toggleFavoriteHandler);

// Trash Routes
router.on("GET", "/trash", listTrashHandler);
router.on("POST", "/trash/restore", restoreItemsHandler);
router.on("DELETE", "/trash/:itemType/:id", permanentPurgeHandler);

// Share Routes
router.on("POST", "/shares", (event) => createShareHandler(event, billingGuard));
router.on("GET", "/shares/active", listActiveSharesHandler);
router.on("PUT", "/shares/:id/status", updateShareStatusHandler);
router.on("DELETE", "/shares/:id", archiveShareHandler);
router.on("GET", "/shares/:id/visits", getShareVisitsHandler);
router.on("GET", "/share/:token", (event) => publicShareAccessHandler(event, billingGuard)); // Public endpoint (no auth)

// Billing & Wallet Routes
router.on("GET", "/wallet", getWalletHandler);
router.on("GET", "/wallet/deposits", getDepositsHandler);
router.on("POST", "/wallet/deposits", createDepositHandler);
router.on("GET", "/billing/status", (event) => getBillingStatusHandler(event, getBillingStatusUseCase));

// Lookups / Configuration Routes
router.on("GET", "/lookups", getLookupsHandler);
router.on("POST", "/lookups/refresh", refreshLookupsHandler);

// Admin / System Routes
router.on("POST", "/admin/pricing/sync", manualPriceSyncHandler);

// Devtools Routes
router.on("POST", "/devtools/openai/generate-swagger-test", generateSwaggerTestHandler);

/**
 * Main entrance for the PhotosDen Monolith Lambda.
 */
export async function handler(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
    try {
        return await router.handle(event);
    } catch (err) {
        console.error("Monolith Handler Error:", err);
        return {
            statusCode: 500,
            headers: DEFAULT_CORS_HEADERS,
            body: JSON.stringify({ 
                error: "InternalServerError", 
                message: err instanceof Error ? err.message : "An unexpected error occurred"
            }),
        };
    }
}
