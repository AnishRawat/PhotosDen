import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CognitoService } from "../../shared/auth/CognitoService.js";
import { UserService } from "../../shared/database/UserService.js";
import { getConfig } from "../../shared/config/index.js";
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
const userService = new UserService(docClient, tableName);

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
        const { identifier, password, encryptedDEK, kdfSalt, kdfIterations } = body;
        
        // Validate required encryption parameters
        if (!encryptedDEK || !kdfSalt || !kdfIterations) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "BadRequest",
                    message: "Encryption parameters required: encryptedDEK, kdfSalt, kdfIterations",
                    correlationId 
                }),
            };
        }
        
        // Validate KDF iterations (minimum security threshold)
        if (kdfIterations < 100000) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "BadRequest",
                    message: "kdfIterations must be >= 100,000 for security",
                    correlationId 
                }),
            };
        }
        
        const service = await getCognitoService();
        const result = await service.signup(identifier, password);
        
        
        // Store user profile with encryption parameters
        await userService.createProfile({
            userId: result.UserSub!,
            email: identifier,
            encryptedDEK,
            kdfSalt,
            kdfIterations,
            kdfAlgorithm: "PBKDF2-HMAC-SHA256",
            createdAt: new Date().toISOString(),
        });
        
        // Auto-create wallet for new user
        try {
            const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
            const { DynamoDBWalletRepository } = await import("../../infrastructure/database/repositories/DynamoDBWalletRepository.js");
            const { CreateWalletUseCase } = await import("../../application/billing/use-cases/CreateWalletUseCase.js");
            
            const dynamoDB = new DynamoDBClient({});
            const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'photosden-main';
            const walletRepo = new DynamoDBWalletRepository(dynamoDB, TABLE_NAME);
            const createWalletUseCase = new CreateWalletUseCase(walletRepo);
            
            await createWalletUseCase.execute(result.UserSub!);
            console.log(`[SIGNUP] Auto-created wallet for user ${result.UserSub}`);
        } catch (walletError) {
            // Don't fail signup if wallet creation fails - it can be created later
            console.error('[SIGNUP] Failed to create wallet:', walletError);
        }
        
        return {
            statusCode: 201,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                verificationRequired: true, 
                userId: result.UserSub,
                walletCreated: true,
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
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        const result = await service.login(body.identifier, body.password);
        
        // Extract userId from ID token
        const idToken = result.AuthenticationResult?.IdToken;
        if (!idToken) {
            throw new Error("ID token not returned from Cognito");
        }
        
        // Parse JWT to get userId (sub claim)
        // JWT format: header.payload.signature
        let userId: string;
        try {
            const parts = idToken.split('.');
            if (parts.length !== 3) {
                throw new Error("Invalid JWT format");
            }
            
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            userId = payload.sub;
            
            if (!userId) {
                throw new Error("Missing 'sub' claim in JWT");
            }
        } catch (jwtError: any) {
            console.error("JWT parsing error:", jwtError);
            throw new Error(`Failed to parse ID token: ${jwtError.message}`);
        }
        
        // Fetch encryption parameters from DynamoDB
        const profile = await userService.getProfile(userId);
        if (!profile) {
            // User authenticated in Cognito but no profile in DynamoDB
            // This is a critical inconsistency
            console.error("CRITICAL: User authenticated but profile not found:", userId);
            return {
                statusCode: 500,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "ProfileNotFound",
                    message: "User profile not found. Please contact support.",
                    userId,
                    correlationId 
                }),
            };
        }
        
        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                idToken,
                accessToken: result.AuthenticationResult?.AccessToken,
                refreshToken: result.AuthenticationResult?.RefreshToken,
                expiresIn: result.AuthenticationResult?.ExpiresIn,
                userId,
                
                // Zero-Knowledge Encryption Parameters
                // Client uses these to derive Master Key and decrypt DEK
                encryptedDEK: profile.encryptedDEK,
                kdfSalt: profile.kdfSalt,
                kdfIterations: profile.kdfIterations,
                kdfAlgorithm: profile.kdfAlgorithm,
                
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

export async function resendCodeHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        await service.resendConfirmationCode(body.identifier);
        
        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ ok: true, message: "Verification code resent", correlationId }),
        };
    } catch (err: any) {
        return {
            statusCode: err.$metadata?.httpStatusCode ?? 400,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function forgotPasswordHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        await service.forgotPassword(body.identifier);
        
        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ ok: true, message: "Password reset code sent", correlationId }),
        };
    } catch (err: any) {
        return {
            statusCode: err.$metadata?.httpStatusCode ?? 400,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}

export async function resetPasswordHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        await service.confirmForgotPassword(body.identifier, body.code, body.newPassword);
        
        return {
            statusCode: 200,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ ok: true, message: "Password reset successful", correlationId }),
        };
    } catch (err: any) {
        return {
            statusCode: err.$metadata?.httpStatusCode ?? 400,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ error: err.name, message: err.message, correlationId }),
        };
    }
}
