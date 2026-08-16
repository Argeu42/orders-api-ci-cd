import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { UpdateOrderStatus } from "../application/update-order-status";
import { NotFoundError } from "../application/errors";
import { ValidationError, InvalidTransitionError } from "../domain/errors";
import { OrderStatus } from "../domain/order-status";
import { MongoOrderRepository } from "../infrastructure/mongo-order-repository";
import { logHandlerStart, logHandlerSuccess, logHandlerError } from "../infrastructure/logger";

/**
 * PATCH /orders/{id}/status
 *
 * Parses the `id` path parameter and the `status` body field, delegates the
 * status transition to `UpdateOrderStatus`, and maps the outcome to an HTTP
 * response.
 *
 * Ordering note (Requirement 7.2): `UpdateOrderStatus.execute` calls
 * `repo.findById` before `order.transitionTo`, so a nonexistent `id` always
 * throws `NotFoundError` (404) before the `status` value is ever inspected —
 * regardless of what (or whether) `status` was sent in the body. Because of
 * this, the handler intentionally does not pre-validate `status` before
 * calling the use case: doing so could produce a 400 for a malformed body
 * even when `id` doesn't exist, violating the required 404-before-400
 * ordering. Only the minimal parsing needed to extract the raw value from
 * the JSON body happens here; membership in the `OrderStatus` enum and
 * transition validity are both checked by the domain (`Order.transitionTo`),
 * which throws `InvalidTransitionError` for anything that isn't a valid
 * transition — including a missing/non-enum `status` value.
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;
  logHandlerStart(method, path);

  try {
    const id = event.pathParameters?.id;

    if (!id || id.trim().length === 0) {
      logHandlerError("ValidationError", 400);
      return { statusCode: 400, body: JSON.stringify({ message: "id is required" }) };
    }

    let parsedBody: unknown;
    try {
      parsedBody = event.body ? JSON.parse(event.body) : undefined;
    } catch {
      parsedBody = undefined;
    }

    const statusValue =
      typeof parsedBody === "object" && parsedBody !== null
        ? (parsedBody as { status?: unknown }).status
        : undefined;

    const repo = new MongoOrderRepository();
    const useCase = new UpdateOrderStatus(repo);

    // Pass whatever was parsed through, even if it isn't a valid OrderStatus.
    // The use case's own findById-before-transitionTo ordering guarantees the
    // 404 check happens first (see function doc above).
    const order = await useCase.execute(id, statusValue as OrderStatus);
    const props = order.toProps();

    logHandlerSuccess(props.id);

    return { statusCode: 200, body: JSON.stringify(props) };
  } catch (error) {
    if (error instanceof NotFoundError) {
      logHandlerError("NotFoundError", 404);
      return { statusCode: 404, body: JSON.stringify({ message: error.message }) };
    }

    if (error instanceof InvalidTransitionError || error instanceof ValidationError) {
      logHandlerError(error.constructor.name, 400);
      return { statusCode: 400, body: JSON.stringify({ message: error.message }) };
    }

    logHandlerError(error instanceof Error ? error.constructor.name : "UnknownError", 500);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
