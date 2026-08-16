import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { ListOrders } from "../application/list-orders";
import { MongoOrderRepository } from "../infrastructure/mongo-order-repository";
import { OrderFilter } from "../domain/order-repository";
import { OrderStatus } from "../domain/order-status";
import { logHandlerStart, logHandlerError } from "../infrastructure/logger";

const VALID_STATUSES: readonly OrderStatus[] = ["PENDING", "CONFIRMED", "SHIPPED", "CANCELED"];

function isValidStatus(value: string): value is OrderStatus {
  return (VALID_STATUSES as readonly string[]).includes(value);
}

/**
 * Handles GET /orders. Parses optional `customerId`/`status` query params,
 * validates `status` against the OrderStatus enum, and delegates the
 * filtering/sorting entirely to `ListOrders` (Requirement 10.6).
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;
  logHandlerStart(method, path);

  try {
    const customerId = event.queryStringParameters?.customerId;
    const statusParam = event.queryStringParameters?.status;

    if (statusParam !== undefined && !isValidStatus(statusParam)) {
      logHandlerError("ValidationError", 400);
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "status must be one of PENDING, CONFIRMED, SHIPPED, CANCELED" }),
      };
    }

    const filter: OrderFilter = {
      ...(customerId !== undefined ? { customerId } : {}),
      ...(statusParam !== undefined ? { status: statusParam } : {}),
    };

    const repo = new MongoOrderRepository();
    const useCase = new ListOrders(repo);
    const orders = await useCase.execute(filter);

    const body = orders.map((order) => order.toProps());

    return { statusCode: 200, body: JSON.stringify(body) };
  } catch (error) {
    logHandlerError(error instanceof Error ? error.constructor.name : "UnknownError", 500);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
