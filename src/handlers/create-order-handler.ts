import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { CreateOrder, CreateOrderInput } from "../application/create-order";
import { ValidationError } from "../domain/errors";
import { MongoOrderRepository } from "../infrastructure/mongo-order-repository";
import { logHandlerStart, logHandlerSuccess, logHandlerError } from "../infrastructure/logger";

/**
 * Lambda handler for `POST /orders` (Requirement 4). Parses the request
 * body, delegates business validation and persistence entirely to
 * `CreateOrder` / `Order.create` (Requirement 10.6), and maps the outcome
 * to an HTTP response.
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;
  logHandlerStart(method, path);

  try {
    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.body) : undefined;
    } catch {
      throw new ValidationError("Request body must be valid JSON");
    }

    if (typeof body !== "object" || body === null) {
      throw new ValidationError("Request body is required");
    }

    const { customerId, items } = body as { customerId?: unknown; items?: unknown };

    // Minimal shape narrowing only (not business validation — Order.create,
    // invoked via CreateOrder, is the sole source of validation rules per
    // Requirement 10.6). customerId/items come from JSON.parse as `unknown`,
    // so some narrowing is unavoidable to build a well-typed CreateOrderInput.
    const input: CreateOrderInput = {
      customerId: typeof customerId === "string" ? customerId : "",
      items: Array.isArray(items) ? items : [],
    };

    const repo = new MongoOrderRepository();
    const useCase = new CreateOrder(repo);
    const order = await useCase.execute(input);
    const props = order.toProps();

    logHandlerSuccess(props.id);

    return {
      statusCode: 201,
      body: JSON.stringify(props),
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      logHandlerError("ValidationError", 400);
      return { statusCode: 400, body: JSON.stringify({ message: error.message }) };
    }

    logHandlerError(error instanceof Error ? error.constructor.name : "UnknownError", 500);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
