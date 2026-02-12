import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DEFAULT_CORS_HEADERS } from "../../shared/http/cors.js";
import { verifyToken } from "../../shared/auth/jwt-verifier.js";
import { BillingGuard } from "../../infrastructure/billing/BillingGuard.js";
import { EventType } from "../../domain/billing/enums.js";

function correlationIdFrom(event: APIGatewayProxyEventV2): string {
    return event.headers?.["x-correlation-id"]?.toString() ?? event.requestContext?.requestId ?? "unknown";
}

const DEFAULT_HEADERS = DEFAULT_CORS_HEADERS;

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const tableName = process.env.DYNAMODB_TABLE_NAME || "photosden-store-dev";
const bucketName = process.env.S3_BUCKET_NAME || "photosden-uploads-dev";

/**
 * Get presigned download URL for encrypted photo
 * 
 * Returns presigned S3 URLs for both full-resolution and thumbnail.
 * Client will:
 * 1. Download encrypted blob from S3
 * 2. Decrypt locally using their DEK
 * 3. Display decrypted image
 * 
 * This maintains zero-knowledge: server generates URL but never decrypts.
 */
export async function getPhotoDownloadUrlHandler(
    event: APIGatewayProxyEventV2,
    billingGuard: BillingGuard
): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    
    // Verify JWT token
    const authResult = await verifyToken(event);
    if (!authResult.authorized) {
        return {
            statusCode: 401,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({
                error: "Unauthorized",
                message: authResult.error || "Invalid or missing authentication token",
                correlationId,
            }),
        };
    }

    try {
        const photoId = event.pathParameters?.photoId;
        
        if (!photoId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "photoId is required",
                    correlationId,
                }),
            };
        }

        // Get photo metadata from DynamoDB
        const getCommand = new GetCommand({
            TableName: tableName,
            Key: {
                PK: `USER#${authResult.userId}`,
                SK: `PHOTO#${photoId}`,
            },
        });

        const result = await docClient.send(getCommand);
        
        if (!result.Item) {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "NotFound",
                    message: "Photo not found",
                    correlationId,
                }),
            };
        }

        const photo = result.Item;

        // Check if photo is deleted
        if (photo.isDeleted) {
            return {
                statusCode: 410,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "Gone",
                    message: "Photo has been deleted",
                    correlationId,
                }),
            };
        }

        // --- BILLING: Reserve funds for photo retrieval ---
        let reservationId: string | null = null;
        try {
            reservationId = await billingGuard.checkAndReserve(authResult.userId!, EventType.RETRIEVE_PHOTO, 1);
        } catch (billingErr: any) {
            console.warn(`[BILLING] Reservation failed for user ${authResult.userId}:`, billingErr.message);
            return {
                statusCode: 402, // Payment Required
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "InsufficientFunds",
                    message: billingErr.message,
                    correlationId,
                }),
            };
        }

        try {
            // Generate presigned download URL for full-resolution photo
            const downloadCommand = new GetObjectCommand({
                Bucket: bucketName,
                Key: photo.s3Key,
            });

            const downloadUrl = await getSignedUrl(s3Client, downloadCommand, {
                expiresIn: 3600, // 1 hour
            });

            // Generate presigned URL for thumbnail if exists
            let thumbnailDownloadUrl: string | undefined;
            if (photo.thumbnailS3Key) {
                const thumbnailCommand = new GetObjectCommand({
                    Bucket: bucketName,
                    Key: photo.thumbnailS3Key,
                });

                thumbnailDownloadUrl = await getSignedUrl(s3Client, thumbnailCommand, {
                    expiresIn: 3600, // 1 hour
                });
            }

            return {
                statusCode: 200,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    photoId,
                    downloadUrl,
                    thumbnailDownloadUrl,
                    
                    // Include encryption params for client-side decryption
                    iv: photo.iv,
                    thumbnailIV: photo.thumbnailIV,
                    
                    // Additional metadata
                    originalFilename: photo.originalFilename,
                    mimeType: photo.mimeType,
                    encryptedSize: photo.encryptedSize,
                    capturedAt: photo.capturedAt,
                    
                    correlationId,
                }),
            };
        } catch (err: any) {
            // --- BILLING: Release funds if something failed before generating URL ---
            if (reservationId) {
                await billingGuard.release(reservationId, authResult.userId!).catch(e => 
                    console.error(`[BILLING] Failed to release reservation ${reservationId}:`, e)
                );
                reservationId = null; // Prevent double handling in finally
            }

            console.error("Error generating download URL:", err);
            return {
                statusCode: 500,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
            };
        } finally {
            // --- BILLING: Capture funds if successful ---
            if (reservationId) {
                await billingGuard.capture(reservationId, authResult.userId!).catch(e => 
                    console.error(`[BILLING] Failed to capture reservation ${reservationId}:`, e)
                );
            }
        }
    } catch (outerErr: any) {
        console.error("Outer Error in photo handler:", outerErr);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: "InternalServerError", message: outerErr.message, correlationId }),
        };
    }
}

export async function deletePhotoHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    
    // Verify JWT token
    const authResult = await verifyToken(event);
    if (!authResult.authorized) {
        return {
            statusCode: 401,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({
                error: "Unauthorized",
                message: authResult.error || "Invalid or missing authentication token",
                correlationId,
            }),
        };
    }

    try {
        const photoId = event.pathParameters?.photoId;
        
        if (!photoId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "photoId is required",
                    correlationId,
                }),
            };
        }

        const now = new Date();
        const purgeAt = Math.floor((now.getTime() + 30 * 24 * 60 * 60 * 1000) / 1000); // 30 days

        // Soft delete photo (set isDeleted flag and TTL)
        const command = new UpdateCommand({
            TableName: tableName,
            Key: {
                PK: `USER#${authResult.userId}`,
                SK: `PHOTO#${photoId}`,
            },
            UpdateExpression: "SET isDeleted = :deleted, deletedAt = :deletedAt, purgeAt = :purgeAt, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":deleted": true,
                ":deletedAt": now.toISOString(),
                ":purgeAt": purgeAt,
                ":updatedAt": now.toISOString(),
            },
            ConditionExpression: "attribute_exists(PK)", // Ensures photo exists and belongs to user
        });

        await docClient.send(command);
        
        return {
            statusCode: 204,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: "",
        };
    } catch (err: any) {
        if (err.name === "ConditionalCheckFailedException") {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "NotFound",
                    message: "Photo not found",
                    correlationId,
                }),
            };
        }

        console.error("Error deleting photo:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}
