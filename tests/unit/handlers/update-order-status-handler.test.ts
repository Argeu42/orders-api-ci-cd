import type { APIGatewayProxyEventV2 } from "aws-lambda";
import fc from "fast-check";
import { Order } from "../../../src/domain/order";
import { OrderStatus, canTransition } from "../../../src/domain/order-status";
import { InMemoryOrderRepository } from "../fakes/in-memory-order-repository";

jest.mock("../../../src/infrastructure/mongo-order-repository", () => {
  const { InMemoryOrderRepository: FakeRepo } = jest.requireActual(
    "../fakes/in-memory-order-repository"
  );
  const sharedRepo = new FakeRepo();

  return {
    MongoOrderRepository: jest.fn().mockImplementation(() => sharedRepo),
    __sharedRepo: sharedRepo,
  };
});

import { handler } from "../../../src/handlers/update-order-status-handler";
import * as mongoOrderRepositoryModule from "../../../src/infrastructure/mongo-order-repository";

function getSharedRepo(): InMemoryOrderRepository {
  return (mongoOrderRepositoryModule as unknown as { __sharedRepo: InMemoryOrderRepository })
    .__sharedRepo;
}

function buildEvent(id: string, body: unknown): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "PATCH /orders/{id}/status",
    rawPath: `/orders/${id}/status`,
    rawQueryString: "",
    headers: { "content-type": "application/json" },
    pathParameters: { id },
    requestContext: {
      http: {
        method: "PATCH",
        path: `/orders/${id}/status`,
      },
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

/**
 * Like `buildEvent`, but takes the raw request body string directly (or
 * `undefined` for "no body"), instead of JSON-stringifying a value. This lets
 * tests exercise malformed/non-JSON bodies, which `buildEvent` can't produce
 * since it always JSON.stringify's its input.
 */
function buildRawEvent(id: string, rawBody: string | undefined): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "PATCH /orders/{id}/status",
    rawPath: `/orders/${id}/status`,
    rawQueryString: "",
    headers: { "content-type": "application/json" },
    pathParameters: { id },
    requestContext: {
      http: {
        method: "PATCH",
        path: `/orders/${id}/status`,
      },
    },
    body: rawBody,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

function seedOrder(id: string, status: OrderStatus): void {
  const order = Order.fromPersistence({
    id,
    customerId: "customer-1",
    items: [{ productId: "product-1", quantity: 1, unitPrice: 10 }],
    status,
    total: 10,
    createdAt: new Date(),
  });

  void getSharedRepo().save(order);
}

// Valid transitions per the state machine: PENDING->CONFIRMED, PENDING->CANCELED, CONFIRMED->SHIPPED
const validTransitionArbitrary: fc.Arbitrary<[OrderStatus, OrderStatus]> = fc.constantFrom(
  ["PENDING", "CONFIRMED"],
  ["PENDING", "CANCELED"],
  ["CONFIRMED", "SHIPPED"]
);

describe("update-order-status-handler", () => {
  // Feature: orders-api, Property 14: Atualização de status válida persiste e retorna 200
  // Validates: Requirements 7.1
  test("Feature: orders-api, Property 14: Atualização de status válida persiste e retorna 200", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validTransitionArbitrary,
        async (id, [fromStatus, toStatus]) => {
          seedOrder(id, fromStatus);

          const event = buildEvent(id, { status: toStatus });

          const response = await handler(event);

          expect(response.statusCode).toBe(200);

          const responseBody = JSON.parse(response.body as string);
          expect(responseBody.status).toBe(toStatus);

          const persisted = await getSharedRepo().findById(id);
          expect(persisted?.toProps().status).toBe(toStatus);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: orders-api, Property 15: Atualização em id inexistente retorna 404 independente do corpo
  // Validates: Requirements 7.2
  test("Feature: orders-api, Property 15: Atualização em id inexistente retorna 404 independente do corpo", async () => {
    // Covers: no body, malformed JSON, a valid status value, an invalid
    // status value, and arbitrary other JSON shapes.
    const rawBodyArbitrary: fc.Arbitrary<string | undefined> = fc.oneof(
      fc.constant(undefined),
      fc.constant("{not-valid-json"),
      fc
        .constantFrom<OrderStatus>("PENDING", "CONFIRMED", "SHIPPED", "CANCELED")
        .map((status) => JSON.stringify({ status })),
      fc.string().map((status) => JSON.stringify({ status })),
      fc.jsonValue().map((value) => JSON.stringify(value))
    );

    const errorSpy = jest.spyOn(console, "error");

    try {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), rawBodyArbitrary, async (id, rawBody) => {
          // Guarantee the id is not seeded in the repository, regardless of
          // what other properties in this file may have stored under it.
          const existing = await getSharedRepo().findById(id);
          fc.pre(existing === null);

          errorSpy.mockClear();

          const event = buildRawEvent(id, rawBody);

          const response = await handler(event);

          expect(response.statusCode).toBe(404);

          // Feature: orders-api, Property 18: Log de erro descreve tipo e status HTTP
          // Validates: Requirements 16.3
          expect(errorSpy).toHaveBeenCalledTimes(1);
          const errorLog = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
          expect(errorLog.event).toBe("handler.error");
          expect(typeof errorLog.errorType).toBe("string");
          expect(errorLog.errorType.length).toBeGreaterThan(0);
          expect(errorLog.statusCode).toBe(response.statusCode);
        }),
        { numRuns: 100 }
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  // Feature: orders-api, Property 16: Atualização inválida em id existente retorna 400 sem modificar
  // Validates: Requirements 7.3
  test("Feature: orders-api, Property 16: Atualização inválida em id existente retorna 400 sem modificar", async () => {
    const allStatuses: readonly OrderStatus[] = ["PENDING", "CONFIRMED", "SHIPPED", "CANCELED"];

    // Describes one of three ways an update request can be invalid:
    // - "missing": no `status` field in the body at all
    // - "null": `status` explicitly null
    // - "invalidEnum": `status` is a string outside the OrderStatus enum
    // - "invalidTransition": `status` IS a valid OrderStatus, but not reachable
    //   from the seeded order's current status (e.g. SHIPPED->anything,
    //   CANCELED->anything, PENDING->SHIPPED, CONFIRMED->PENDING,
    //   CONFIRMED->CANCELED, or same-status)
    const invalidRequestArbitrary = fc.oneof(
      fc.constant({ kind: "missing" as const }),
      fc.constant({ kind: "null" as const }),
      fc.string().map((value) => ({ kind: "invalidEnum" as const, value })),
      fc.constantFrom(...allStatuses).map((value) => ({ kind: "invalidTransition" as const, value }))
    );

    const errorSpy = jest.spyOn(console, "error");

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom(...allStatuses),
          invalidRequestArbitrary,
          async (id, fromStatus, invalidRequest) => {
            if (invalidRequest.kind === "invalidEnum") {
              fc.pre(!allStatuses.includes(invalidRequest.value as OrderStatus));
            }
            if (invalidRequest.kind === "invalidTransition") {
              fc.pre(!canTransition(fromStatus, invalidRequest.value));
            }

            // Guarantee the id is not already seeded in the repository.
            const existing = await getSharedRepo().findById(id);
            fc.pre(existing === null);

            seedOrder(id, fromStatus);
            errorSpy.mockClear();

            const body =
              invalidRequest.kind === "missing"
                ? {}
                : invalidRequest.kind === "null"
                  ? { status: null }
                  : { status: invalidRequest.value };

            const event = buildEvent(id, body);

            const response = await handler(event);

            expect(response.statusCode).toBe(400);

            const persisted = await getSharedRepo().findById(id);
            expect(persisted?.toProps().status).toBe(fromStatus);

            // Feature: orders-api, Property 18: Log de erro descreve tipo e status HTTP
            // Validates: Requirements 16.3
            expect(errorSpy).toHaveBeenCalledTimes(1);
            const errorLog = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
            expect(errorLog.event).toBe("handler.error");
            expect(typeof errorLog.errorType).toBe("string");
            expect(errorLog.errorType.length).toBeGreaterThan(0);
            expect(errorLog.statusCode).toBe(response.statusCode);
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
