import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getConfig } from "../config/config-cache.js";

type JwtVerifier = ReturnType<typeof CognitoJwtVerifier.create>;
let jwtVerifier: JwtVerifier | null = null;

async function getJwtVerifier() {
    if (!jwtVerifier) {
        const config = await getConfig();
        jwtVerifier = CognitoJwtVerifier.create({
            userPoolId: config.cognitoUserPoolId,
            tokenUse: "id",
            clientId: config.cognitoUserPoolClientId,
        });
    }
    return jwtVerifier;
}

export interface AuthResult {
    authorized: boolean;
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    phoneNumber?: string;
    phoneNumberVerified?: boolean;
    error?: string;
}

/**
 * Verify JWT token from Authorization header
 */
export async function verifyToken(event: APIGatewayProxyEventV2): Promise<AuthResult> {
    try {
        const authHeader = event.headers?.authorization || event.headers?.Authorization;
        
        if (!authHeader) {
            return { authorized: false, error: "Missing Authorization header" };
        }

        const token = authHeader.replace(/^Bearer\s+/i, "");
        
        if (!token) {
            return { authorized: false, error: "Invalid Authorization header format" };
        }

        const verifier = await getJwtVerifier();
        const payload = await verifier.verify(token);
        
        return {
            authorized: true,
            userId: payload.sub as string,
            email: payload.email as string | undefined,
            emailVerified: payload.email_verified as boolean | undefined,
            phoneNumber: payload.phone_number as string | undefined,
            phoneNumberVerified: payload.phone_number_verified as boolean | undefined,
        };
    } catch (err: any) {
        console.error("Token verification failed:", err);
        return {
            authorized: false,
            error: err.message || "Invalid token",
        };
    }
}
