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
export async function changePasswordHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
        const { oldPassword, newPassword, newEncryptedDEK, newKdfSalt, newKdfIterations } = body;
        
        // Validate required parameters
        if (!oldPassword || !newPassword || !newEncryptedDEK || !newKdfSalt || typeof newKdfIterations !== 'number') {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "BadRequest",
                    message: "Required: oldPassword, newPassword, newEncryptedDEK, newKdfSalt, newKdfIterations",
                    correlationId 
                }),
            };
        }
        
        // Validate KDF iterations (security threshold)
        if (newKdfIterations < 100000) {
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
        
        // Validate password strength (basic check)
        if (newPassword.length < 8) {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "BadRequest",
                    message: "New password must be at least 8 characters",
                    correlationId 
                }),
            };
        }
        
        // Extract access token from Authorization header
        const authHeader = event.headers?.authorization || event.headers?.Authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return {
                statusCode: 401,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "Unauthorized",
                    message: "Access token required in Authorization header",
                    correlationId 
                }),
            };
        }
        
        const accessToken = authHeader.substring(7); // Remove "Bearer "
        
        // Get user profile
        const profile = await userService.getProfile(authResult.userId!);
        if (!profile) {
            return {
                statusCode: 404,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "NotFound",
                    message: "User profile not found",
                    correlationId 
                }),
            };
        }
        
        const cognitoClient = new CognitoIdentityProviderClient({});
        let passwordChanged = false;
        
        try {
            // PHASE 1: Change password in Cognito
            // This validates old password automatically
            await cognitoClient.send(new ChangePasswordCommand({
                AccessToken: accessToken,
                PreviousPassword: oldPassword,
                ProposedPassword: newPassword,
            }));
            
            passwordChanged = true;
            
            // PHASE 2: Update DynamoDB atomically
            // This re-encrypts DEK with new Master Key derived from new password
            await userService.updateEncryptionParams(
                authResult.userId!,
                newEncryptedDEK,
                newKdfSalt,
                newKdfIterations
            );
            
            return {
                statusCode: 200,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    message: "Password updated successfully. Please login again with your new password.",
                    correlationId 
                }),
            };
            
        } catch (err: any) {
            // CRITICAL ERROR: Password changed but DynamoDB update failed
            // The user's DEK is now encrypted with the OLD Master Key but password is NEW
            // This is UNRECOVERABLE without manual intervention
            if (passwordChanged) {
                console.error("🚨 CRITICAL: Password changed in Cognito but DynamoDB update failed", {
                    userId: authResult.userId,
                    error: err.message,
                    correlationId
                });
                
                // Return special error code for client to handle
                return {
                    statusCode: 500,
                    headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                    body: JSON.stringify({ 
                        error: "PartialFailure",
                        message: "Password was changed but encryption parameters update failed. Please contact support immediately.",
                        userId: authResult.userId,
                        correlationId 
                    }),
                };
            }
            
            throw err;
        }
        
    } catch (err: any) {
        // Handle Cognito errors
        if (err.name === "NotAuthorizedException") {
            return {
                statusCode: 401,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "Unauthorized",
                    message: "Incorrect old password or session expired",
                    correlationId 
                }),
            };
        }
        
        if (err.name === "InvalidPasswordException") {
            return {
                statusCode: 400,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "InvalidPassword",
                    message: err.message || "New password does not meet requirements",
                    correlationId 
                }),
            };
        }
        
        if (err.name === "LimitExceededException") {
            return {
                statusCode: 429,
                headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
                body: JSON.stringify({ 
                    error: "TooManyRequests",
                    message: "Too many password change attempts. Please try again later.",
                    correlationId 
                }),
            };
        }
        
        console.error("Password change error:", {
            userId: authResult.userId,
            error: err.name,
            message: err.message,
            correlationId
        });
        
        return {
            statusCode: err.$metadata?.httpStatusCode ?? 500,
            headers: { ...DEFAULT_HEADERS, "X-Correlation-Id": correlationId },
            body: JSON.stringify({ 
                error: err.name || "InternalError",
                message: err.message || "Password change failed",
                correlationId 
            }),
        };
    }
}
