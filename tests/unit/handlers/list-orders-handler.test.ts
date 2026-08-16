import fc from "fast-check";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { Order } from "../../../src/domain/order";
import { OrderStatus } from "../../../src/domain/order-status";
import { InMemoryOrderRepository } from "../fakes/in-memory-order-repository";

jest.mock("../../../src/infrastructure/mongo-order-repository");

// Imported after jest.mock so the constructor below refers to the auto-mocked class.
import { MongoOrderRepository } from "../../../src/infrastructure/mongo-order-repository";
import { handler } from "../../../src/handlers/list-orders-handler";

function buildEvent(queryStringParameters: Record<string, string> | undefined): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /orders",
    rawPath: "/orders",
    rawQueryString: "",
    queryStringParameters,
    requestContext: {
      http: {
        method: "GET",
        path: "/orders",
      },
    },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

const CUSTOMER_ID_POOL = ["customer-A", "customer-B", "customer-C"] as const;

const customerIdArbitrary = fc.constantFrom(...CUSTOMER_ID_POOL);

const orderStatusArbitrary: fc.Arbitrary<OrderStatus> = fc.constantFrom(
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "CANCELED"
);

const seedOrderArbitrary = fc.record({
  customerId: customerIdArbitrary,
  status: orderStatusArbitrary,
  createdAtOffsetMinutes: fc.integer({ min: 0, max: 100_000 }),
});

const seedOrdersArbitrary = fc.array(seedOrderArbitrary, { minLength: 0, maxLength: 20 });

const filterSpecArbitrary = fc.record({
  kind: fc.constantFrom("none", "customerId", "status", "both"),
  customerId: customerIdArbitrary,
  status: orderStatusArbitrary,
});

const BASE_TIME = Date.parse("2024-01-01T00:00:00.000Z");

describe("list-orders-handler", () => {
  // Feature: orders-api, Property 12: Listagem com filtros retorna o subconjunto correto e ordenado
  // Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.6, 6.7
  test("Feature: orders-api, Property 12: Listagem com filtros retorna o subconjunto correto e ordenado", async () => {
    await fc.assert(
      fc.asyncProperty(seedOrdersArbitrary, filterSpecArbitrary, async (seedOrders, filterSpec) => {
        const repo = new InMemoryOrderRepository();

        (MongoOrderRepository as unknown as jest.Mock).mockImplementation(() => repo);

        const orders = seedOrders.map((seed, i) =>
          Order.fromPersistence({
            id: `order-${i}`,
            customerId: seed.customerId,
            items: [{ productId: "product-1", quantity: 1, unitPrice: 10 }],
            status: seed.status,
            total: 10,
            createdAt: new Date(BASE_TIME + seed.createdAtOffsetMinutes * 60_000),
          })
        );

        for (const order of orders) {
          await repo.save(order);
        }

        const queryStringParameters: Record<string, string> = {};
        if (filterSpec.kind === "customerId" || filterSpec.kind === "both") {
          queryStringParameters.customerId = filterSpec.customerId;
        }
        if (filterSpec.kind === "status" || filterSpec.kind === "both") {
          queryStringParameters.status = filterSpec.status;
        }

        const event = buildEvent(
          Object.keys(queryStringParameters).length > 0 ? queryStringParameters : undefined
        );

        const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;

        expect(result.statusCode).toBe(200);

        const body = JSON.parse(result.body ?? "[]") as Array<{
          id: string;
          customerId: string;
          status: OrderStatus;
          createdAt: string;
        }>;

        const expected = orders
          .filter((order) => {
            const props = order.toProps();

            if (
              queryStringParameters.customerId !== undefined &&
              props.customerId !== queryStringParameters.customerId
            ) {
              return false;
            }

            if (
              queryStringParameters.status !== undefined &&
              props.status !== queryStringParameters.status
            ) {
              return false;
            }

            return true;
          })
          .sort((a, b) => a.toProps().createdAt.getTime() - b.toProps().createdAt.getTime())
          .map((order) => order.toProps());

        expect(body.map((order) => order.id)).toEqual(expected.map((order) => order.id));
        expect(body.map((order) => order.customerId)).toEqual(
          expected.map((order) => order.customerId)
        );
        expect(body.map((order) => order.status)).toEqual(expected.map((order) => order.status));
        expect(body.map((order) => new Date(order.createdAt).getTime())).toEqual(
          expected.map((order) => order.createdAt.getTime())
        );

        // Sanity check: results must be sorted ascending by createdAt regardless of
        // insertion order, and empty when nothing matches the filter.
        const createdAtTimestamps = body.map((order) => new Date(order.createdAt).getTime());
        const sortedTimestamps = [...createdAtTimestamps].sort((a, b) => a - b);
        expect(createdAtTimestamps).toEqual(sortedTimestamps);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: orders-api, Property 13: Filtro de status inválido retorna 400
  // Validates: Requirements 6.5
  test("Feature: orders-api, Property 13: Filtro de status inválido retorna 400", async () => {
    const VALID_STATUSES = ["PENDING", "CONFIRMED", "SHIPPED", "CANCELED"];

    const invalidStatusArbitrary = fc
      .string()
      .filter((value) => !VALID_STATUSES.includes(value));

    const errorSpy = jest.spyOn(console, "error");

    try {
      await fc.assert(
        fc.asyncProperty(invalidStatusArbitrary, async (invalidStatus) => {
          const repo = new InMemoryOrderRepository();
          errorSpy.mockClear();

          (MongoOrderRepository as unknown as jest.Mock).mockImplementation(() => repo);

          const event = buildEvent({ status: invalidStatus });

          const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;

          expect(result.statusCode).toBe(400);

          // Feature: orders-api, Property 18: Log de erro descreve tipo e status HTTP
          // Validates: Requirements 16.3
          expect(errorSpy).toHaveBeenCalledTimes(1);
          const errorLog = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
          expect(errorLog.event).toBe("handler.error");
          expect(typeof errorLog.errorType).toBe("string");
          expect(errorLog.errorType.length).toBeGreaterThan(0);
          expect(errorLog.statusCode).toBe(result.statusCode);
        }),
        { numRuns: 100 }
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
