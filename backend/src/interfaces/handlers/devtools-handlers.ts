import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DEFAULT_CORS_HEADERS } from "../../shared/http/cors.js";
import { verifyToken } from "../../shared/auth/jwt-verifier.js";

function correlationIdFrom(event: APIGatewayProxyEventV2): string {
    return event.headers?.["x-correlation-id"]?.toString() ?? event.requestContext?.requestId ?? "unknown";
}

const DEFAULT_HEADERS = DEFAULT_CORS_HEADERS;

export async function generateSwaggerTestHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const { endpoint, method, description } = body;
        
        if (!endpoint || !method) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({
                    error: "BadRequest",
                    message: "endpoint and method are required",
                    correlationId,
                }),
            };
        }

        // Mock OpenAI response - generate test steps
        // In production, this would call OpenAI API
        const mockTestSteps = [
            {
                step: 1,
                action: "Setup authentication",
                request: {
                    method: "POST",
                    path: "/auth/login",
                    body: {
                        email: "test@example.com",
                        password: "TestPassword123!"
                    }
                },
                expectedStatus: 200,
                extractTokenFrom: "response.body.accessToken"
            },
            {
                step: 2,
                action: `Test ${method} ${endpoint}`,
                request: {
                    method,
                    path: endpoint,
                    headers: {
                        "Authorization": "Bearer {accessToken}"
                    },
                    body: description ? { description } : undefined
                },
                expectedStatus: method === "POST" ? 201 : method === "DELETE" ? 204 : 200,
                assertions: [
                    "Response contains X-Correlation-Id header",
                    "Response body matches schema",
                    method !== "DELETE" ? "Response contains expected data" : "No content returned"
                ]
            },
            {
                step: 3,
                action: "Verify without authentication",
                request: {
                    method,
                    path: endpoint,
                },
                expectedStatus: 401,
                assertions: [
                    "Returns Unauthorized error",
                    "Error message indicates missing token"
                ]
            }
        ];

        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                testSteps: mockTestSteps,
                generatedAt: new Date().toISOString(),
                correlationId 
            }),
        };
    } catch (err: any) {
        console.error("Error generating swagger test:", err);
        return {
            statusCode: 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}
