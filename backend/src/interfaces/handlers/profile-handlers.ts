import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { UserService } from "../../shared/database/UserService.js";
import { getConfig } from "../../shared/config/index.js";

function correlationIdFrom(event: APIGatewayProxyEventV2): string {
    return event.headers?.["x-correlation-id"]?.toString() ?? event.requestContext?.requestId ?? "unknown";
}

const DEFAULT_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
};

async function getUserService() {
    const config = await getConfig();
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    // Note: We need to ensure the tableName is in the config
    return new UserService(docClient, `${config.env === "dev" ? "photosden" : "photosden"}-store-${config.env}`);
}

export async function getProfileHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    const userId = (event.requestContext as any).authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
        return {
            statusCode: 401,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: "Unauthorized", correlationId }),
        };
    }

    try {
        const service = await getUserService();
        const profile = await service.getProfile(userId);

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify(profile ?? { userId, message: "Profile not found in DB" }),
        };
    } catch (err: any) {
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: "InternalError", message: err.message, correlationId }),
        };
    }
}

export async function updateProfileHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    const userId = (event.requestContext as any).authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
        return {
            statusCode: 401,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: "Unauthorized", correlationId }),
        };
    }

    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getUserService();
        await service.updateProfile(userId, body);

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ ok: true, message: "Profile updated", correlationId }),
        };
    } catch (err: any) {
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: "InternalError", message: err.message, correlationId }),
        };
    }
}
