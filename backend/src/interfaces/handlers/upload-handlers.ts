import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ulid } from "ulid";
import { UploadService } from "../../shared/database/UploadService.js";
import { DEFAULT_CORS_HEADERS } from "../../shared/http/cors.js";
import { verifyToken } from "../../shared/auth/jwt-verifier.js";
import { DynamoDBWalletRepository } from "../../infrastructure/database/repositories/DynamoDBWalletRepository.js";
import { WalletStatus } from "../../domain/billing/enums.js";

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
const uploadService = new UploadService(docClient, tableName);

export async function initiateUploadHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        // --- BILLING: Basic wallet check before upload ---
        try {
            const walletRepo = new DynamoDBWalletRepository(dynamoClient, tableName);
            const wallet = await walletRepo.get(authResult.userId!);
            if (!wallet) {
                return {
                    statusCode: 402,
                    headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                    body: JSON.stringify({
                        error: "WalletNotFound",
                        message: "Please initialize your wallet before uploading.",
                        correlationId,
                    }),
                };
            }
            if (wallet.accountStatus === 'SUSPENDED') {
                return {
                    statusCode: 402,
                    headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                    body: JSON.stringify({
                        error: "AccountSuspended",
                        message: "Your account is suspended due to insufficient funds.",
                        correlationId,
                    }),
                };
            }
        } catch (billingErr) {
            console.warn('[BILLING] Wallet check failed during upload initiation:', billingErr);
            // We'll allow it for now if it's a technical error, but log it.
        }

        const body = JSON.parse(event.body ?? "{}");
        const { photos } = body;
        
        // Expect array of photo metadata with encryption IVs
        if (!photos || !Array.isArray(photos) || photos.length === 0) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "photos array is required and must not be empty",
                    correlationId,
                }),
            };
        }
        
        // Validate each photo has required encryption parameters
        for (const photo of photos) {
            if (!photo.iv || !photo.encryptedSize || !photo.originalFilename || !photo.mimeType) {
                return {
                    statusCode: 400,
                    headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                    body: JSON.stringify({
                        error: "BadRequest",
                        message: "Each photo must have: iv, encryptedSize, originalFilename, mimeType",
                        correlationId,
                    }),
                };
            }
        }

        // Generate upload ID
        const uploadId = ulid();
        
        // Create upload record
        const upload = await uploadService.createUpload(authResult.userId!, uploadId, photos.length);

        // Generate presigned URLs for each photo with ULID keys
        const presignedUrls = [];
        for (const photo of photos) {
            // Generate ULID for photo (collision-proof)
            const photoUlid = ulid();
            
            // S3 key pattern: users/{userId}/private/{ULID}
            const s3Key = `users/${authResult.userId}/private/${photoUlid}`;
            
            // Generate thumbnail key if thumbnail exists
            let thumbnailS3Key: string | undefined;
            if (photo.hasThumbnail && photo.thumbnailIV) {
                thumbnailS3Key = `users/${authResult.userId}/private/${photoUlid}_thumb`;
            }
            
            // Generate presigned URL for full-res encrypted photo
            const fullResCommand = new PutObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
                ContentType: "application/octet-stream", // Encrypted blob
            });
            const presignedUrl = await getSignedUrl(s3Client, fullResCommand, { expiresIn: 3600 }); // 1 hour

            // Generate presigned URL for thumbnail if exists
            let thumbnailPresignedUrl: string | undefined;
            if (thumbnailS3Key) {
                const thumbCommand = new PutObjectCommand({
                    Bucket: bucketName,
                    Key: thumbnailS3Key,
                    ContentType: "application/octet-stream",
                });
                thumbnailPresignedUrl = await getSignedUrl(s3Client, thumbCommand, { expiresIn: 3600 });
            }

            // Store photo metadata in DynamoDB
            await uploadService.addPhotoToUpload(
                authResult.userId!,
                uploadId,
                photoUlid,
                s3Key,
                presignedUrl,
                {
                    iv: photo.iv,
                    encryptedSize: photo.encryptedSize,
                    originalFilename: photo.originalFilename,
                    mimeType: photo.mimeType,
                    thumbnailS3Key,
                    thumbnailIV: photo.thumbnailIV,
                    capturedAt: photo.capturedAt || new Date().toISOString(),
                }
            );

            presignedUrls.push({
                photoId: photoUlid,
                presignedUrl,
                thumbnailPresignedUrl,
                s3Key,
                thumbnailS3Key,
            });
        }

        return {
            statusCode: 201,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({
                uploadId,
                photos: presignedUrls,
            }),
        };
    } catch (err: any) {
        console.error("Error initiating upload:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function listUploadsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        // List all uploads for authenticated user
        const uploads = await uploadService.listUploads(authResult.userId!);

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ items: uploads }),
        };
    } catch (err: any) {
        console.error("Error listing uploads:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function getUploadPhotosHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const uploadId = event.pathParameters?.uploadId;
        
        if (!uploadId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "uploadId is required",
                    correlationId,
                }),
            };
        }

        // Verify ownership
        const upload = await uploadService.getUpload(authResult.userId!, uploadId);
        if (!upload) {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "NotFound",
                    message: "Upload not found",
                    correlationId,
                }),
            };
        }

        // Get photos in upload
        const photos = await uploadService.getUploadPhotos(authResult.userId!, uploadId);

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ items: photos }),
        };
    } catch (err: any) {
        console.error("Error getting upload photos:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function completeUploadHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const uploadId = event.pathParameters?.uploadId;
        
        if (!uploadId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "uploadId is required",
                    correlationId,
                }),
            };
        }

        // Verify ownership
        const upload = await uploadService.getUpload(authResult.userId!, uploadId);
        if (!upload) {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "NotFound",
                    message: "Upload not found",
                    correlationId,
                }),
            };
        }

        // Mark upload as completed
        await uploadService.completeUpload(authResult.userId!, uploadId);

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                message: "Upload completed successfully",
                uploadId,
                correlationId 
            }),
        };
    } catch (err: any) {
        console.error("Error completing upload:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}
