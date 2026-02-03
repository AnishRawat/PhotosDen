import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { CognitoService } from "../../shared/auth/CognitoService.js";
import { getConfig } from "../../shared/config/index.js";

function correlationIdFrom(event: APIGatewayProxyEventV2): string {
    return event.headers?.["x-correlation-id"]?.toString() ?? event.requestContext?.requestId ?? "unknown";
}

const DEFAULT_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Correlation-Id"
};

async function getCognitoService() {
    const config = await getConfig();
    const client = new CognitoIdentityProviderClient({});
    return new CognitoService({
        client,
        clientId: config.cognitoUserPoolClientId
    });
}

export async function signupHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        const result = await service.signup(body.identifier, body.password);
        
        return {
            statusCode: 201,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                verificationRequired: true, 
                userId: result.UserSub,
                correlationId 
            }),
        };
    } catch (err: any) {
        return {
            statusCode: err.$metadata?.httpStatusCode ?? 400,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function loginHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    console.log("reached");
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        const result = await service.login(body.identifier, body.password);
        
        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                idToken: result.AuthenticationResult?.IdToken,
                accessToken: result.AuthenticationResult?.AccessToken,
                refreshToken: result.AuthenticationResult?.RefreshToken,
                expiresIn: result.AuthenticationResult?.ExpiresIn,
                correlationId 
            }),
        };
    } catch (err: any) {
        return {
            statusCode: err.$metadata?.httpStatusCode ?? 401,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function confirmHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        await service.confirmSignup(body.identifier, body.code);
        
        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ ok: true, message: "Account confirmed", correlationId }),
        };
    } catch (err: any) {
        return {
            statusCode: err.$metadata?.httpStatusCode ?? 400,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}
