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

// Helper to return standardized 200 OK responses
const successResponse = (body: any, correlationId: string) => ({
    statusCode: 200,
    headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
    body: JSON.stringify({ success: true, ...body, correlationId }),
});

const errorResponse = (error: string, message: string, correlationId: string, statusCode: number = 200) => ({
    statusCode: 200, // Always return 200 for handled errors as per requirement
    headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
    body: JSON.stringify({ success: false, error, message, correlationId, originalStatus: statusCode }),
});

export async function signupHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    let identifier: string = "";
    let body: any = {};

    try {
        body = JSON.parse(event.body ?? "{}");
        identifier = body.identifier;
        const { password, name, encryptedDEK, kdfSalt, kdfIterations } = body;
        
        // Validate required encryption parameters
        if (!encryptedDEK || !kdfSalt || !kdfIterations) {
            return errorResponse("BadRequest", "Encryption parameters required: encryptedDEK, kdfSalt, kdfIterations", correlationId, 400);
        }

        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
             return errorResponse("BadRequest", "Name is required", correlationId, 400);
        }
        
        // Validate KDF iterations (minimum security threshold)
        if (kdfIterations < 100000) {
            return errorResponse("BadRequest", "kdfIterations must be >= 100,000 for security", correlationId, 400);
        }
        
        // Validate password strength
        if (password.length < 12) {
            return errorResponse("InvalidPassword", "Password must be at least 12 characters long", correlationId, 400);
        }
        
        const service = await getCognitoService();
        const result = await service.signup(identifier, password);
        
        
        // Store user profile with encryption parameters AND name
        await userService.createProfile({
            userId: result.UserSub!,
            email: identifier,
            name: name.trim(), // Store name
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
            console.error('[SIGNUP] Failed to create wallet:', walletError);
        }
        
        return successResponse({ 
            verificationRequired: true, 
            userId: result.UserSub,
            walletCreated: true 
        }, correlationId);


    } catch (err: any) {
        // Handle "User already exists" scenario for unconfirmed users
        if (err.name === "UsernameExistsException" && identifier) {
             try {
                const service = await getCognitoService();
                const user = await service.adminGetUser(identifier);
                
                // Only proceed if user is UNCONFIRMED
                if (user.UserStatus === "UNCONFIRMED") {
                    const userCreateDate = user.UserCreateDate;
                    if (userCreateDate) {
                        const now = new Date();
                        const diffInMinutes = (now.getTime() - userCreateDate.getTime()) / 60000;
                        // COOLDOWN: 3 Minutes
                        if (diffInMinutes > 3) {
                             console.log(`[SIGNUP] Deleting stale unconfirmed user: ${identifier} (Age: ${diffInMinutes.toFixed(1)}m)`);
                             // Delete stale user
                             await service.adminDeleteUser(identifier);
                             
                             // RETRY SIGNUP
                             // Recursively call signup logic or just re-execute critical parts? 
                             // We need to re-extract password safely.
                             const { password, name, encryptedDEK, kdfSalt, kdfIterations } = body;

                             const result = await service.signup(identifier, password);
                             
                             // Re-run user profile creation
                             await userService.createProfile({
                                userId: result.UserSub!,
                                email: identifier,
                                name: name.trim(),
                                encryptedDEK: encryptedDEK,
                                kdfSalt: kdfSalt,
                                kdfIterations: kdfIterations,
                                kdfAlgorithm: "PBKDF2-HMAC-SHA256",
                                createdAt: new Date().toISOString(),
                            });
                             
                             return successResponse({ 
                                verificationRequired: true, 
                                userId: result.UserSub,
                                message: "Account recreated. Verification code sent."
                            }, correlationId);
                        } else {
                            // Within cooldown
                            const remaining = Math.ceil(3 - diffInMinutes);
                            return errorResponse("AccountExists", `Account verification pending. Please check your email or wait ${remaining} minutes to sign up again.`, correlationId, 400);
                        }
                    }
                }
             } catch (adminErr) {
                 console.error("[SIGNUP] Failed to check/delete existing user:", adminErr);
                 // Fall through to default error
             }
        }

        return errorResponse(err.name || "InternalError", err.message, correlationId, err.$metadata?.httpStatusCode ?? 500);
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
        if (!idToken) throw new Error("ID token not returned from Cognito");
        
        let userId: string;
        try {
            const parts = idToken.split('.');
            if (parts.length !== 3) throw new Error("Invalid JWT format");
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            userId = payload.sub;
            if (!userId) throw new Error("Missing 'sub' claim in JWT");
        } catch (jwtError: any) {
            console.error("JWT parsing error:", jwtError);
            throw new Error(`Failed to parse ID token: ${jwtError.message}`);
        }
        
        // Fetch encryption parameters from DynamoDB
        const profile = await userService.getProfile(userId);
        if (!profile) {
            return errorResponse("ProfileNotFound", "User profile not found. Please contact support.", correlationId, 500);
        }
        
        return successResponse({ 
            idToken,
            accessToken: result.AuthenticationResult?.AccessToken,
            refreshToken: result.AuthenticationResult?.RefreshToken,
            expiresIn: result.AuthenticationResult?.ExpiresIn,
            userId,
            encryptedDEK: profile.encryptedDEK,
            kdfSalt: profile.kdfSalt,
            kdfIterations: profile.kdfIterations,
            kdfAlgorithm: profile.kdfAlgorithm
        }, correlationId);

    } catch (err: any) {
        return errorResponse(err.name || "LoginFailed", err.message, correlationId, err.$metadata?.httpStatusCode ?? 401);
    }
}

export async function confirmHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        await service.confirmSignup(body.identifier, body.code);
        
        return successResponse({ message: "Account confirmed" }, correlationId);
    } catch (err: any) {
        return errorResponse(err.name || "ConfirmationFailed", err.message, correlationId, err.$metadata?.httpStatusCode ?? 400);
    }
}

export async function resendCodeHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        await service.resendConfirmationCode(body.identifier);
        
        return successResponse({ message: "Verification code resent" }, correlationId);
    } catch (err: any) {
        return errorResponse(err.name || "ResendFailed", err.message, correlationId, err.$metadata?.httpStatusCode ?? 400);
    }
}

export async function forgotPasswordHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        await service.forgotPassword(body.identifier);
        
        return successResponse({ message: "Password reset code sent" }, correlationId);
    } catch (err: any) {
        return errorResponse(err.name || "ForgotPasswordFailed", err.message, correlationId, err.$metadata?.httpStatusCode ?? 400);
    }
}

export async function resetPasswordHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    try {
        const body = JSON.parse(event.body ?? "{}");
        const service = await getCognitoService();
        await service.confirmForgotPassword(body.identifier, body.code, body.newPassword);
        
        return successResponse({ message: "Password reset successful" }, correlationId);
    } catch (err: any) {
        return errorResponse(err.name || "ResetPasswordFailed", err.message, correlationId, err.$metadata?.httpStatusCode ?? 400);
    }
}
