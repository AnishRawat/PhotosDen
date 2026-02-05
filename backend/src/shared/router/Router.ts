import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DEFAULT_CORS_HEADERS } from "../http/cors.js";

export type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

export class Router {
    private routes: Array<{
        method: string;
        pathPattern: RegExp;
        paramNames: string[];
        handler: Handler;
    }> = [];

    /**
     * Register a route handler.
     * Use :paramName for path parameters (e.g., /albums/:id).
     */
    public on(method: string, path: string, handler: Handler): void {
        const paramNames: string[] = []; 
        const regexPath = path
            .replace(/:([^\/]+)/g, (_, name) => {
                paramNames.push(name);
                return "([^/]+)";
            })
            .replace(/\//g, "\\/");
        
        this.routes.push({
            method: method.toUpperCase(),
            pathPattern: new RegExp(`^${regexPath}$`),
            paramNames,
            handler,
        });
    }

    public async handle(event: any): Promise<APIGatewayProxyResultV2> {
        // v2 uses requestContext.http, v1 uses httpMethod and path
        const method = (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
        // const path = event.requestContext?.http?.path || event.path || "/";
        const stage = event.requestContext.stage;
        const rawPath = event.requestContext.http.path;

        const path = stage
        ? rawPath.replace(new RegExp(`^/${stage}\\b`), "")
        : rawPath;

        // Handle OPTIONS requests for CORS preflight
        if (method === "OPTIONS") {
            return {
                statusCode: 200,
                headers: DEFAULT_CORS_HEADERS,
                body: "",
            };
        }

        for (const route of this.routes) {
            if (route.method === method) {
                const match = path.match(route.pathPattern);
                if (match) {
                    const pathParameters: Record<string, string> = {};
                    route.paramNames.forEach((name, index) => {
                        pathParameters[name] = match[index + 1];
                    });
                    
                    // Inject extracted params into the event for easy access
                    (event as any).pathParameters = {
                        ...(event.pathParameters || {}),
                        ...pathParameters,
                    };

                    return await route.handler(event);
                }
            }
        }

        return {
            statusCode: 404,
            headers: DEFAULT_CORS_HEADERS,
            body: JSON.stringify({ message: `Route ${method} ${path} not found` }),
        };
    }
}
