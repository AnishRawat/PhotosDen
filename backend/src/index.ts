import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Router } from "./shared/router/Router.js";
import { signupHandler, loginHandler, confirmHandler, resendCodeHandler, forgotPasswordHandler, resetPasswordHandler } from "./interfaces/handlers/auth-handlers.js";
import { getProfileHandler, updateProfileHandler } from "./interfaces/handlers/profile-handlers.js";
import { initiateUploadHandler, listUploadsHandler, getUploadPhotosHandler, completeUploadHandler } from "./interfaces/handlers/upload-handlers.js";
import { createAlbumHandler, listAlbumsHandler, getAlbumHandler, deleteAlbumHandler, updateAlbumPhotosHandler } from "./interfaces/handlers/album-handlers.js";
import { deletePhotoHandler } from "./interfaces/handlers/photo-handlers.js";
import { listTrashHandler, restoreItemsHandler, permanentPurgeHandler } from "./interfaces/handlers/trash-handlers.js";
import { createShareHandler, listActiveSharesHandler, updateShareStatusHandler, archiveShareHandler, getShareVisitsHandler, publicShareAccessHandler } from "./interfaces/handlers/share-handlers.js";
import { generateSwaggerTestHandler } from "./interfaces/handlers/devtools-handlers.js";
import { DEFAULT_CORS_HEADERS } from "./shared/http/cors.js";

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

// Photo Routes
router.on("DELETE", "/photos/:photoId", deletePhotoHandler);

// Trash Routes
router.on("GET", "/trash", listTrashHandler);
router.on("POST", "/trash/restore", restoreItemsHandler);
router.on("DELETE", "/trash/:itemType/:id", permanentPurgeHandler);

// Share Routes
router.on("POST", "/shares", createShareHandler);
router.on("GET", "/shares/active", listActiveSharesHandler);
router.on("PUT", "/shares/:id/status", updateShareStatusHandler);
router.on("DELETE", "/shares/:id", archiveShareHandler);
router.on("GET", "/shares/:id/visits", getShareVisitsHandler);
router.on("GET", "/share/:token", publicShareAccessHandler); // Public endpoint (no auth)

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
