import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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
