import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AlbumService, Album } from "../../shared/database/AlbumService.js";
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

const albumService = new AlbumService(docClient, tableName);

/**
 * Helper to enrich album with presigned cover photo URL
 */
async function enrichAlbumWithCoverUrl(album: Album): Promise<Album & { coverPhotoUrl?: string }> {
    if (!album.coverPhotoKey) {
        return album;
    }

    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: album.coverPhotoKey,
        });
        
        // Generate presigned URL valid for 1 hour
        const coverPhotoUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        
        return { ...album, coverPhotoUrl };
    } catch (err) {
        console.error(`Failed to generate signed URL for cover ${album.coverPhotoKey}:`, err);
        return album;
    }
}

export async function createAlbumHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const { title, description } = body;
        
        if (!title) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "Title is required",
                    correlationId,
                }),
            };
        }

        // Check for duplicate album name (case-insensitive, per user)
        const existingAlbums = await albumService.listAlbums(authResult.userId!);
        const isDuplicate = existingAlbums.some(
            (a) => a.title.trim().toLowerCase() === title.trim().toLowerCase()
        );

        if (isDuplicate) {
            return {
                statusCode: 409,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "Conflict",
                    message: "An album with this name already exists",
                    correlationId,
                }),
            };
        }

        // Generate album ID
        const albumId = `album_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // Create album in DynamoDB
        const album = await albumService.createAlbum(authResult.userId!, albumId, title, description);

        return {
            statusCode: 201,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify(album),
        };
    } catch (err: any) {
        console.error("Error creating album:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function listAlbumsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        // List all albums for authenticated user
        const albums = await albumService.listAlbums(authResult.userId!);

        // Enrich albums with cover URLs in parallel
        const enrichedAlbums = await Promise.all(albums.map(enrichAlbumWithCoverUrl));

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ items: enrichedAlbums }),
        };
    } catch (err: any) {
        console.error("Error listing albums:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function getAlbumHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const albumId = event.pathParameters?.albumId;
        
        if (!albumId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "albumId is required",
                    correlationId,
                }),
            };
        }

        // Get album with ownership check
        const album = await albumService.getAlbum(authResult.userId!, albumId);
        
        if (!album || album.isDeleted) {
            // Return 404 whether album doesn't exist OR belongs to another user (don't leak info)
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "NotFound",
                    message: "Album not found",
                    correlationId,
                }),
            };
        }

        const enrichedAlbum = await enrichAlbumWithCoverUrl(album);

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify(enrichedAlbum),
        };
    } catch (err: any) {
        console.error("Error getting album:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function deleteAlbumHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const albumId = event.pathParameters?.albumId;
        
        if (!albumId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "albumId is required",
                    correlationId,
                }),
            };
        }

        // Verify ownership before deleting
        const album = await albumService.getAlbum(authResult.userId!, albumId);
        if (!album) {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "NotFound",
                    message: "Album not found",
                    correlationId,
                }),
            };
        }

        // Soft delete the album
        await albumService.deleteAlbum(authResult.userId!, albumId);
        
        return {
            statusCode: 204,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: "",
        };
    } catch (err: any) {
        console.error("Error deleting album:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function updateAlbumPhotosHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const albumId = event.pathParameters?.albumId;
        const body = JSON.parse(event.body ?? "{}");
        const { add = [], remove = [] } = body;
        
        if (!albumId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "albumId is required",
                    correlationId,
                }),
            };
        }

        // Verify ownership
        const album = await albumService.getAlbum(authResult.userId!, albumId);
        if (!album) {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "NotFound",
                    message: "Album not found",
                    correlationId,
                }),
            };
        }

        // Add photos
        if (add.length > 0) {
            // We need to fetch the S3 keys for these photos to store in the album-photo relation
            // This also verifies the photos exist and belong to the user
            const keys: { [key: string]: any }[] = add.map((photoId: string) => ({
                PK: `USER#${authResult.userId}`,
                SK: `PHOTO#${photoId}`
            }));

            // BatchGetItem has a limit of 100 items, we assume 'add' list is reasonable size for now
            // Production code should handle chunking
            const batchCommand = new BatchGetCommand({
                RequestItems: {
                    [tableName]: { Keys: keys }
                }
            });

            const result = await docClient.send(batchCommand);
            const foundPhotos = result.Responses?.[tableName] || [];
            
            if (foundPhotos.length !== add.length) {
                // Some photos were not found or don't belong to valid user
                // We'll proceed with only the valid ones
                console.warn(`Requested to add ${add.length} photos but found ${foundPhotos.length}`);
            }

            const validPhotos = foundPhotos.map(item => ({
                photoId: item.SK.replace('PHOTO#', ''),
                s3Key: item.s3Key
            }));

            if (validPhotos.length > 0) {
                await albumService.addPhotosToAlbum(authResult.userId!, albumId, validPhotos);
            }
        }

        // Remove photos
        if (remove.length > 0) {
            await albumService.removePhotosFromAlbum(authResult.userId!, albumId, remove);
        }
        
        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                message: `Album ${albumId} updated`,
                correlationId 
            }),
        };
    } catch (err: any) {
        console.error("Error updating album photos:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

/**
 * GET /albums/:albumId/photos
 * Returns all photos in an album with presigned thumbnail URLs.
 */
export async function getAlbumPhotosHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    console.log("getAlbumPhotosHandler");
    const correlationId = correlationIdFrom(event);

    const authResult = await verifyToken(event);
    if (!authResult.authorized) {
        return {
            statusCode: 401,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: "Unauthorized", message: authResult.error, correlationId }),
        };
    }

    try {
        const albumId = event.pathParameters?.albumId;
        if (!albumId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ error: "BadRequest", message: "albumId is required", correlationId }),
            };
        }

        // Verify album ownership
        const album = await albumService.getAlbum(authResult.userId!, albumId);
        if (!album || album.isDeleted) {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ error: "NotFound", message: "Album not found", correlationId }),
            };
        }

        // Fetch album-photo join records
        const albumPhotos = await albumService.getAlbumPhotos(authResult.userId!, albumId);

        // Enrich with presigned thumbnail URLs and photo metadata from PHOTO# records
        const enriched = await Promise.all(
            albumPhotos.map(async (ap) => {
                let thumbnailDownloadUrl: string | undefined;

                // Prefer thumbnailS3Key stored on the join record, fall back to s3Key
                const thumbKey = ap.thumbnailS3Key ?? (ap.s3Key ? `${ap.s3Key}_thumb` : undefined);
                if (thumbKey) {
                    try {
                        thumbnailDownloadUrl = await getSignedUrl(
                            s3Client,
                            new GetObjectCommand({ Bucket: bucketName, Key: thumbKey }),
                            { expiresIn: 3600 }
                        );
                    } catch { /* ignore — no thumbnail */ }
                }

                return {
                    photoId: ap.photoId,
                    thumbnailDownloadUrl,
                    originalFilename: (ap as any).originalFilename ?? '',
                    addedAt: ap.addedAt,
                };
            })
        );

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ items: enriched, correlationId }),
        };
    } catch (err: any) {
        console.error("Error fetching album photos:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}
