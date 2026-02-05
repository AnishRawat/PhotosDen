import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { TrashService } from "../../shared/database/TrashService.js";
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
const trashService = new TrashService(docClient, tableName);
const albumService = new AlbumService(docClient, tableName);

export async function listTrashHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        // List all deleted items for authenticated user
        const trashItems = await trashService.listTrash(authResult.userId!);

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ items: trashItems }),
        };
    } catch (err: any) {
        console.error("Error listing trash:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function restoreItemsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const { items } = body;  // Array of { itemType, id }
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "items array is required and must not be empty",
                    correlationId,
                }),
            };
        }

        // Restore each item
        const restored = [];
        const failed = [];

        for (const item of items) {
            try {
                if (item.itemType === "album") {
                    await albumService.restoreAlbum(authResult.userId!, item.id);
                    restored.push(item);
                }
                // TODO: Add restore for photos and uploads
                else {
                    failed.push({ ...item, reason: "itemType not yet supported" });
                }
            } catch (err: any) {
                failed.push({ ...item, reason: err.message });
            }
        }

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                message: `Restored ${restored.length} items, ${failed.length} failed`,
                restored,
                failed,
                correlationId 
            }),
        };
    } catch (err: any) {
        console.error("Error restoring items:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function permanentPurgeHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const itemType = event.pathParameters?.itemType;
        const id = event.pathParameters?.id;
        
        if (!itemType || !id) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "itemType and id are required",
                    correlationId,
                }),
            };
        }

        // Hard delete the item permanently
        let sk = "";
        if (itemType === "album") sk = `ALBUM#${id}`;
        else if (itemType === "photo") sk = `PHOTO#${id}`;
        else if (itemType === "upload") sk = `UPLOAD#${id}`;
        else {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "Invalid itemType. Must be: album, photo, or upload",
                    correlationId,
                }),
            };
        }

        const command = new DeleteCommand({
            TableName: tableName,
            Key: {
                PK: `USER#${authResult.userId}`,
                SK: sk,
            },
            ConditionExpression: "attribute_exists(PK) AND isDeleted = :deleted",
            ExpressionAttributeValues: {
                ":deleted": true,
            },
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
                    message: "Item not found or not deleted",
                    correlationId,
                }),
            };
        }

        console.error("Error permanently purging item:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}
