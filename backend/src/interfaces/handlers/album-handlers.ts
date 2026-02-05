import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AlbumService } from "../../shared/database/AlbumService.js";
import { DEFAULT_CORS_HEADERS } from "../../shared/http/cors.js";
import { verifyToken } from "../../shared/auth/jwt-verifier.js";

function correlationIdFrom(event: APIGatewayProxyEventV2): string {
    return event.headers?.["x-correlation-id"]?.toString() ?? event.requestContext?.requestId ?? "unknown";
}

const DEFAULT_HEADERS = DEFAULT_CORS_HEADERS;

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const tableName = process.env.DYNAMODB_TABLE_NAME || "photosden-store-dev";
const albumService = new AlbumService(docClient, tableName);

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

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ items: albums }),
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

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify(album),
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
            await albumService.addPhotosToAlbum(authResult.userId!, albumId, add);
        }

        // Remove photos
        if (remove.length > 0) {
            await albumService.removePhotosFromAlbum(authResult.userId!, albumId, remove);
        }
        
        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                message: `Album ${albumId} updated: added ${add.length} photos, removed ${remove.length} photos`,
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
