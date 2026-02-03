import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Router } from "./shared/router/Router.js";
import { signupHandler, loginHandler, confirmHandler } from "./interfaces/handlers/auth-handlers.js";
import { getProfileHandler, updateProfileHandler } from "./interfaces/handlers/profile-handlers.js";

const router = new Router();

// Register Routes
router.on("POST", "/auth/signup", signupHandler);
router.on("POST", "/auth/login", loginHandler);
router.on("POST", "/auth/confirm", confirmHandler);
router.on("GET", "/profile", getProfileHandler);
router.on("PUT", "/profile", updateProfileHandler);

/**
 * Main entrance for the PhotosDen Monolith Lambda.
 */
export async function handler(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
    try {
        return await router.handle(event);
    } catch (err) {
        console.error("Monolith Handler Error:", err);
        return {
            statusCode: 500,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ 
                error: "InternalServerError", 
                message: err instanceof Error ? err.message : "An unexpected error occurred"
            }),
        };
    }
}
