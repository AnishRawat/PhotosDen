/**
 * Example handler showing the enforced flow:
 * - build correlation id
 * - load cached config (cold-start pattern)
 * - construct dependencies
 * - call use case
 * - map response
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { getConfig } from "../../shared/config";

// Placeholder: replace with your real logger and error mapping
function correlationIdFrom(event: APIGatewayProxyEventV2): string {
  return (
    event.headers?.["x-correlation-id"] ??
    event.requestContext?.requestId ??
    crypto.randomUUID()
  );
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const correlationId = correlationIdFrom(event);

  try {
    const config = await getConfig();

    // Construct dependencies using config (DI)
    // const repo = new DynamoAssetRepository({ tableName: config.tableName, ... });
    // const useCase = new SomethingUseCase(repo, ...);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "x-correlation-id": correlationId },
      body: JSON.stringify({ ok: true, env: config.env }),
    };
  } catch (err) {
    // Central error handler should map typed errors -> status codes
    return {
      statusCode: 500,
      headers: { "content-type": "application/json", "x-correlation-id": correlationId },
      body: JSON.stringify({ error: "InternalError", correlationId }),
    };
  }
}
