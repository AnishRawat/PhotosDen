import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ShareService } from "../../shared/database/ShareService.js";
import { AlbumService } from "../../shared/database/AlbumService.js";
import { DEFAULT_CORS_HEADERS } from "../../shared/http/cors.js";
import { verifyToken } from "../../shared/auth/jwt-verifier.js";
import { createHash } from "crypto";

function correlationIdFrom(event: APIGatewayProxyEventV2): string {
    return event.headers?.["x-correlation-id"]?.toString() ?? event.requestContext?.requestId ?? "unknown";
}

function hashIP(ip: string): string {
    return createHash("sha256").update(ip).digest("hex").substring(0, 16);
}

const DEFAULT_HEADERS = DEFAULT_CORS_HEADERS;

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const tableName = process.env.DYNAMODB_TABLE_NAME || "photosden-store-dev";
const shareService = new ShareService(docClient, tableName);
const albumService = new AlbumService(docClient, tableName);

export async function createShareHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const { targetType, targetId, allowedRes, expiresAt, blockScreenshots, watermark, viewTimer } = body;
        
        if (!targetType || !targetId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "targetType and targetId are required",
                    correlationId,
                }),
            };
        }

        // Verify ownership of the target
        if (targetType === "album") {
            const album = await albumService.getAlbum(authResult.userId!, targetId);
            if (!album || album.isDeleted) {
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
        }
        // TODO: Add similar check for photos

        // Generate share ID and token
        const shareId = `share_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const shareToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        // Create share
        const shareLink = await shareService.createShare(
            authResult.userId!,
            shareId,
            shareToken,
            targetType,
            targetId,
            allowedRes || ["1024x768", "512x384"],
            expiresAt,
            { blockScreenshots, watermark, viewTimer }
        );

        return {
            statusCode: 201,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify(shareLink),
        };
    } catch (err: any) {
        console.error("Error creating share:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function listActiveSharesHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        // List active shares for authenticated user
        const shares = await shareService.listShares(authResult.userId!, true);

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ items: shares }),
        };
    } catch (err: any) {
        console.error("Error listing shares:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function updateShareStatusHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const shareId = event.pathParameters?.id;
        const body = JSON.parse(event.body ?? "{}");
        const { status } = body;
        
        if (!shareId || !status || !["active", "paused", "stopped"].includes(status)) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "Valid shareId and status (active/paused/stopped) are required",
                    correlationId,
                }),
            };
        }

        // Update share status
        await shareService.updateShareStatus(authResult.userId!, shareId, status);

        // Fetch updated share to return
        const shares = await shareService.listShares(authResult.userId!, false);
        const updatedShare = shares.find(s => s.shareId === shareId);

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify(updatedShare || { message: "Share updated" }),
        };
    } catch (err: any) {
        console.error("Error updating share status:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function archiveShareHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const shareId = event.pathParameters?.id;
        
        if (!shareId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "shareId is required",
                    correlationId,
                }),
            };
        }

        // Archive share
        await shareService.archiveShare(authResult.userId!, shareId);
        
        return {
            statusCode: 204,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: "",
        };
    } catch (err: any) {
        console.error("Error archiving share:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function getShareVisitsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const shareId = event.pathParameters?.id;
        
        if (!shareId) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "shareId is required",
                    correlationId,
                }),
            };
        }

        // Get the share to find its token
        const shares = await shareService.listShares(authResult.userId!, false);
        const share = shares.find(s => s.shareId === shareId);

        if (!share) {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "NotFound",
                    message: "Share not found",
                    correlationId,
                }),
            };
        }

        // Get visit logs
        const visits = await shareService.getVisitLogs(share.shareToken);

        // Aggregate device info from user agents (simple implementation)
        const deviceCounts: Record<string, number> = {};
        visits.forEach(visit => {
            const ua = visit.userAgent.toLowerCase();
            let device = "Unknown";
            if (ua.includes("iphone")) device = "iPhone";
            else if (ua.includes("android")) device = "Android";
            else if (ua.includes("windows")) device = "Windows PC";
            else if (ua.includes("mac")) device = "Mac";
            
            deviceCounts[device] = (deviceCounts[device] || 0) + 1;
        });

        const deviceAggregation = Object.entries(deviceCounts).map(([friendlyName, count]) => ({
            friendlyName,
            count
        }));

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ items: visits, deviceAggregation }),
        };
    } catch (err: any) {
        console.error("Error getting share visits:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function publicShareAccessHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    
    // NO AUTH CHECK - This is a public endpoint
    
    try {
        const token = event.pathParameters?.token;
        
        if (!token) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "token is required",
                    correlationId,
                }),
            };
        }

        // Look up share by token
        const share = await shareService.getShareByToken(token);

        if (!share) {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "NotFound",
                    message: "Share not found",
                    correlationId,
                }),
            };
        }

        // Validate share status
        if (share.status !== "active") {
            return {
                statusCode: 410,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "Gone",
                    message: "This share link is no longer active",
                    correlationId,
                }),
            };
        }

        // Check expiration
        if (share.expiresAt && Date.now() / 1000 > share.expiresAt) {
            return {
                statusCode: 410,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "Gone",
                    message: "This share link has expired",
                    correlationId,
                }),
            };
        }

        // Fetch content from owner's partition
        let targetMetadata: any = {};
        let items: any[] = [];

        if (share.targetType === "album") {
            const album = await albumService.getAlbum(share.ownerId, share.targetId);
            if (!album || album.isDeleted) {
                return {
                    statusCode: 410,
                    headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                    body: JSON.stringify({
                        error: "Gone",
                        message: "The shared content is no longer available",
                        correlationId,
                    }),
                };
            }

            targetMetadata = {
                title: album.title,
                itemCount: 0  // TODO: Count photos in album
            };

            // TODO: Fetch photos from album
            items = [];
        }
        // TODO: Handle targetType === "photo"

        // Log visit
        const ip = event.requestContext?.http?.sourceIp || "unknown";
        const userAgent = event.headers?.["user-agent"] || "unknown";
        await shareService.logVisit(token, hashIP(ip), userAgent);

        // Increment access count
        await shareService.incrementAccessCount(share.ownerId, share.shareId);

        // Return content with constraints
        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({
                targetMetadata,
                items,
                constraints: {
                    blockScreenshots: share.blockScreenshots || false,
                    viewTimer: share.viewTimer,
                    watermark: share.watermark || false
                }
            }),
        };
    } catch (err: any) {
        console.error("Error accessing public share:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}
