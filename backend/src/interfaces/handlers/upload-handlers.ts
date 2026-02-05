import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UploadService } from "../../shared/database/UploadService.js";
import { DEFAULT_CORS_HEADERS } from "../../shared/http/cors.js";
import { verifyToken } from "../../shared/auth/jwt-verifier.js";

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
        const body = JSON.parse(event.body ?? "{}");
        const { photoCount } = body;
        
        if (!photoCount || photoCount < 1) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "photoCount is required and must be >= 1",
                    correlationId,
                }),
            };
        }

        // Generate upload ID
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // Create upload record
        const upload = await uploadService.createUpload(authResult.userId!, uploadId, photoCount);

        // Generate presigned URLs for each photo
        const presignedUrls = [];
        for (let i = 0; i < photoCount; i++) {
            const photoId = `photo_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}`;
            const s3Key = `users/${authResult.userId}/uploads/${uploadId}/${photoId}.jpg`;
            
            // Generate presigned URL for S3 upload
            const command = new PutObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
                ContentType: "image/jpeg",
            });

            const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

            // Store photo metadata
            await uploadService.addPhotoToUpload(authResult.userId!, uploadId, photoId, s3Key, presignedUrl);

            presignedUrls.push({
                photoId,
                presignedUrl,
            });
        }

        return {
            statusCode: 201,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({
                uploadId,
                presignedUrls,
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
