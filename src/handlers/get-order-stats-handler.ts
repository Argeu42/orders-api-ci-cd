import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { GetOrderStats } from "../application/get-order-stats";
import { MongoOrderRepository } from "../infrastructure/mongo-order-repository";
import { logHandlerStart, logHandlerError } from "../infrastructure/logger";

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;
  logHandlerStart(method, path);

  try {
    const repo = new MongoOrderRepository();
    const useCase = new GetOrderStats(repo);
    const stats = await useCase.execute();

    return { statusCode: 200, body: JSON.stringify(stats) };
  } catch (error) {
    logHandlerError(
      error instanceof Error ? error.constructor.name : "UnknownError",
      500
    );
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
