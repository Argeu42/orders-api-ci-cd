import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { GetOrderById } from "../application/get-order-by-id";
import { MongoOrderRepository } from "../infrastructure/mongo-order-repository";
import { logHandlerStart, logHandlerSuccess, logHandlerError } from "../infrastructure/logger";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /orders/{id}
 *
 * Validates the `id` path parameter shape (not a business rule, just a
 * request-shape check per Requirement 10.6) before ever querying the
 * Orders_Collection, per Requirement 5.3. Delegates all persistence access
 * to the GetOrderById use case.
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;
  logHandlerStart(method, path);

  try {
    const id = event.pathParameters?.id;

    if (!id || id.trim().length === 0 || !UUID_REGEX.test(id)) {
      logHandlerError("ValidationError", 400);
      return { statusCode: 400, body: JSON.stringify({ message: "Invalid order id" }) };
    }

    const repo = new MongoOrderRepository();
    const useCase = new GetOrderById(repo);
    const order = await useCase.execute(id);

    if (!order) {
      logHandlerError("NotFoundError", 404);
      return { statusCode: 404, body: JSON.stringify({ message: "Order not found" }) };
    }

    const props = order.toProps();
    logHandlerSuccess(props.id);

    return { statusCode: 200, body: JSON.stringify(props) };
  } catch (error) {
    logHandlerError(error instanceof Error ? error.constructor.name : "UnknownError", 500);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
