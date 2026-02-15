import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, ChangePasswordCommand } from "@aws-sdk/client-cognito-identity-provider";
import { CognitoService } from "../../shared/auth/CognitoService.js";
import { UserService } from "../../shared/database/UserService.js";
import { getConfig } from "../../shared/config/index.js";
import { DEFAULT_CORS_HEADERS } from "../../shared/http/cors.js";
import { verifyToken } from "../../shared/auth/jwt-verifier.js";

function correlationIdFrom(event: APIGatewayProxyEventV2): string {
    return event.headers?.["x-correlation-id"]?.toString() ?? event.requestContext?.requestId ?? "unknown";
}

const DEFAULT_HEADERS = DEFAULT_CORS_HEADERS;

// Initialize clients
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

/**
 * Change password handler for authenticated users
 * 
 * CRITICAL: This implements password change with DEK re-encryption
 * 
 * Flow:
 * 1. Verify user is authenticated (JWT)
 * 2. Extract access token from Authorization header
 * 3. Change password in Cognito using ChangePasswordCommand
 * 4. Update encrypted DEK in DynamoDB (atomic)
 * 
 * Security: DEK never changes, only its encryption wrapper
 */
// Helper to return standardized 200 OK responses
const successResponse = (body: any, correlationId: string) => ({
    statusCode: 200,
    headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
    body: JSON.stringify({ success: true, ...body, correlationId }),
});

const errorResponse = (error: string, message: string, correlationId: string, statusCode: number = 200) => ({
    statusCode: 200,
    headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
    body: JSON.stringify({ success: false, error, message, correlationId, originalStatus: statusCode }),
});

export async function changePasswordHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const correlationId = correlationIdFrom(event);
    
    // Verify JWT token
    const authResult = await verifyToken(event);
    if (!authResult.authorized) {
        return errorResponse("Unauthorized", authResult.error || "Invalid or missing authentication token", correlationId, 401);
    }
    
    try {
        const body = JSON.parse(event.body ?? "{}");
        const { oldPassword, newPassword, newEncryptedDEK, newKdfSalt, newKdfIterations } = body;
        
        // Validate required parameters
        if (!oldPassword || !newPassword || !newEncryptedDEK || !newKdfSalt || typeof newKdfIterations !== 'number') {
            return errorResponse("BadRequest", "Required: oldPassword, newPassword, newEncryptedDEK, newKdfSalt, newKdfIterations", correlationId, 400);
        }
        
        // Validate KDF iterations (security threshold)
        if (newKdfIterations < 100000) {
            return errorResponse("BadRequest", "kdfIterations must be >= 100,000 for security", correlationId, 400);
        }
        
        // Validate password strength (basic check)
        if (newPassword.length < 12) {
            return errorResponse("BadRequest", "New password must be at least 12 characters", correlationId, 400);
        }
        
        // Extract access token from Authorization header
        const authHeader = event.headers?.authorization || event.headers?.Authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return errorResponse("Unauthorized", "Access token required in Authorization header", correlationId, 401);
        }
        
        const accessToken = authHeader.substring(7); // Remove "Bearer "
        
        // Get user profile
        const profile = await userService.getProfile(authResult.userId!);
        if (!profile) {
            return errorResponse("NotFound", "User profile not found", correlationId, 404);
        }
        
        const cognitoClient = new CognitoIdentityProviderClient({});
        let passwordChanged = false;
        
        try {
            // PHASE 1: Change password in Cognito
            await cognitoClient.send(new ChangePasswordCommand({
                AccessToken: accessToken,
                PreviousPassword: oldPassword,
                ProposedPassword: newPassword,
            }));
            
            passwordChanged = true;
            
            // PHASE 2: Update DynamoDB atomically
            await userService.updateEncryptionParams(
                authResult.userId!,
                newEncryptedDEK,
                newKdfSalt,
                newKdfIterations
            );
            
            return successResponse({ message: "Password updated successfully. Please login again with your new password." }, correlationId);
            
        } catch (err: any) {
            // CRITICAL ERROR: Password changed but DynamoDB update failed
            if (passwordChanged) {
                console.error("🚨 CRITICAL: Password changed in Cognito but DynamoDB update failed", {
                    userId: authResult.userId,
                    error: err.message,
                    correlationId
                });
                
                return errorResponse("PartialFailure", "Password was changed but encryption parameters update failed. Please contact support immediately.", correlationId, 500);
            }
            
            throw err;
        }
        
    } catch (err: any) {
        // Handle Cognito errors
        if (err.name === "NotAuthorizedException") {
            return errorResponse("Unauthorized", "Incorrect old password or session expired", correlationId, 401);
        }
        
        if (err.name === "InvalidPasswordException") {
            return errorResponse("InvalidPassword", err.message || "New password does not meet requirements", correlationId, 400);
        }
        
        if (err.name === "LimitExceededException") {
            return errorResponse("TooManyRequests", "Too many password change attempts. Please try again later.", correlationId, 429);
        }
        
        console.error("Password change error:", {
            userId: authResult.userId,
            error: err.name,
            message: err.message,
            correlationId
        });
        
        return errorResponse(err.name || "InternalError", err.message || "Password change failed", correlationId, err.$metadata?.httpStatusCode ?? 500);
    }
}
