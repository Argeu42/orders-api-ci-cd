import type { APIGatewayProxyEventV2 } from "aws-lambda";
import fc from "fast-check";
import { Item } from "../../../src/domain/item";
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

import { handler } from "../../../src/handlers/create-order-handler";
import * as mongoOrderRepositoryModule from "../../../src/infrastructure/mongo-order-repository";

function getSharedRepo(): InMemoryOrderRepository {
  return (mongoOrderRepositoryModule as unknown as { __sharedRepo: InMemoryOrderRepository })
    .__sharedRepo;
}

function buildEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "POST /orders",
    rawPath: "/orders",
    rawQueryString: "",
    headers: { "content-type": "application/json" },
    requestContext: {
      http: {
        method: "POST",
        path: "/orders",
      },
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

function buildRawEvent(rawBody: string | undefined): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "POST /orders",
    rawPath: "/orders",
    rawQueryString: "",
    headers: { "content-type": "application/json" },
    requestContext: {
      http: {
        method: "POST",
        path: "/orders",
      },
    },
    body: rawBody,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

const itemArbitrary: fc.Arbitrary<Item> = fc.record({
  productId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  quantity: fc.integer({ min: 1, max: 1_000_000 }),
  unitPrice: fc.float({ min: 0, max: 1_000_000, noNaN: true }),
});

const validCustomerIdArbitrary = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

// --- Invalid payload arbitraries for Property 7 ---

const invalidCustomerIdArbitrary = fc.oneof(
  fc.constant(undefined),
  fc.constant(""),
  fc.constant("   "),
  fc.integer(),
  fc.boolean(),
  fc.constant(null)
);

const invalidItemsShapeArbitrary = fc.oneof(fc.constant(undefined), fc.constant([]));

const invalidItemArbitrary: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  // missing productId
  fc.record({
    quantity: fc.integer({ min: 1, max: 1000 }),
    unitPrice: fc.float({ min: 0, max: 1000, noNaN: true }),
  }),
  // empty/blank productId
  fc.record({
    productId: fc.constantFrom("", "   "),
    quantity: fc.integer({ min: 1, max: 1000 }),
    unitPrice: fc.float({ min: 0, max: 1000, noNaN: true }),
  }),
  // invalid quantity (non-positive or non-integer)
  fc.record({
    productId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    quantity: fc.oneof(
      fc.integer({ max: 0 }),
      fc.float({ noNaN: true }).filter((n) => !Number.isInteger(n))
    ),
    unitPrice: fc.float({ min: 0, max: 1000, noNaN: true }),
  }),
  // invalid unitPrice (negative)
  fc.record({
    productId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    quantity: fc.integer({ min: 1, max: 1000 }),
    unitPrice: fc.float({ min: Math.fround(-1000), max: Math.fround(-0.01), noNaN: true }),
  })
);

const missingBodyCase = fc.constant(buildRawEvent(undefined));

const malformedBodyCase = fc
  .string()
  .map((s) => buildRawEvent(`{invalid_json_${s}`));

const invalidCustomerIdCase = fc
  .tuple(invalidCustomerIdArbitrary, fc.array(itemArbitrary, { minLength: 1, maxLength: 5 }))
  .map(([customerId, items]) => buildEvent({ customerId, items }));

const invalidItemsShapeCase = fc
  .tuple(validCustomerIdArbitrary, invalidItemsShapeArbitrary)
  .map(([customerId, items]) => buildEvent({ customerId, items }));

const invalidItemCase = fc
  .tuple(
    validCustomerIdArbitrary,
    fc.array(itemArbitrary, { maxLength: 3 }),
    invalidItemArbitrary,
    fc.array(itemArbitrary, { maxLength: 3 })
  )
  .map(([customerId, pre, invalidItem, post]) =>
    buildEvent({ customerId, items: [...pre, invalidItem, ...post] })
  );

const invalidEventArbitrary: fc.Arbitrary<APIGatewayProxyEventV2> = fc.oneof(
  missingBodyCase,
  malformedBodyCase,
  invalidCustomerIdCase,
  invalidItemsShapeCase,
  invalidItemCase
);

describe("create-order-handler", () => {
  // Feature: orders-api, Property 6: Criação via handler retorna 201 e persiste
  // Validates: Requirements 4.1
  test("Feature: orders-api, Property 6: Criação via handler retorna 201 e persiste", async () => {
    await fc.assert(
      fc.asyncProperty(
        validCustomerIdArbitrary,
        fc.array(itemArbitrary, { minLength: 1, maxLength: 20 }),
        async (customerId, items) => {
          const event = buildEvent({ customerId, items });

          const response = await handler(event);

          expect(response.statusCode).toBe(201);

          const responseBody = JSON.parse(response.body as string);

          expect(responseBody.customerId).toBe(customerId);
          expect(responseBody.items).toEqual(items);
          expect(responseBody.status).toBe("PENDING");
          expect(typeof responseBody.id).toBe("string");
          expect(responseBody.id.length).toBeGreaterThan(0);
          expect(typeof responseBody.createdAt).toBe("string");

          const expectedTotal =
            Math.round(
              items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0) * 100
            ) / 100;
          expect(responseBody.total).toBeCloseTo(expectedTotal, 2);

          const persisted = await getSharedRepo().findById(responseBody.id);
          expect(persisted).not.toBeNull();
          expect(persisted?.toProps()).toEqual({
            id: responseBody.id,
            customerId,
            items,
            status: "PENDING",
            total: responseBody.total,
            createdAt: new Date(responseBody.createdAt),
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: orders-api, Property 7: Payload inválido em POST /orders é rejeitado sem persistir
  // Validates: Requirements 4.2, 4.3
  test("Feature: orders-api, Property 7: Payload inválido em POST /orders é rejeitado sem persistir", async () => {
    const errorSpy = jest.spyOn(console, "error");

    try {
      await fc.assert(
        fc.asyncProperty(invalidEventArbitrary, async (event) => {
          errorSpy.mockClear();

          const before = await getSharedRepo().find({});
          const sizeBefore = before.length;

          const response = await handler(event);

          expect(response.statusCode).toBe(400);

          const responseBody = JSON.parse(response.body as string);
          expect(typeof responseBody.message).toBe("string");
          expect(responseBody.message.length).toBeGreaterThan(0);

          const after = await getSharedRepo().find({});
          expect(after.length).toBe(sizeBefore);

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

  // Feature: orders-api, Property 8: Handler de criação sempre loga início e conclusão
  // Validates: Requirements 4.5, 16.1, 16.2
  test("Feature: orders-api, Property 8: Handler de criação sempre loga início e conclusão", async () => {
    const logSpy = jest.spyOn(console, "log");

    try {
      await fc.assert(
        fc.asyncProperty(
          validCustomerIdArbitrary,
          fc.array(itemArbitrary, { minLength: 1, maxLength: 20 }),
          async (customerId, items) => {
            logSpy.mockClear();

            const event = buildEvent({ customerId, items });
            const response = await handler(event);
            const responseBody = JSON.parse(response.body as string);

            const parsedLogs = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));

            const startLogs = parsedLogs.filter(
              (log) =>
                log.event === "handler.start" && log.method === "POST" && log.path === "/orders"
            );
            const successLogs = parsedLogs.filter(
              (log) => log.event === "handler.success" && log.orderId === responseBody.id
            );

            expect(startLogs.length).toBe(1);
            expect(successLogs.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("create-order-handler - persistence failure", () => {
  // Validates: Requirements 4.4
  test("returns 500 without a created Order when the repository fails to persist", async () => {
    const repo = getSharedRepo();
    const saveSpy = jest.spyOn(repo, "save").mockRejectedValueOnce(new Error("connection lost"));
    const errorSpy = jest.spyOn(console, "error");

    try {
      const event = buildEvent({
        customerId: "customer-1",
        items: [{ productId: "product-1", quantity: 2, unitPrice: 10 }],
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(500);

      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.id).toBeUndefined();
      expect(responseBody.customerId).toBeUndefined();
      expect(responseBody.items).toBeUndefined();
      expect(typeof responseBody.message).toBe("string");
      expect(responseBody.message.length).toBeGreaterThan(0);

      // Feature: orders-api, Property 18: Log de erro descreve tipo e status HTTP
      // Validates: Requirements 16.3
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errorLog = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
      expect(errorLog.event).toBe("handler.error");
      expect(typeof errorLog.errorType).toBe("string");
      expect(errorLog.errorType.length).toBeGreaterThan(0);
      expect(errorLog.statusCode).toBe(response.statusCode);
    } finally {
      saveSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe("create-order-handler - logging failure does not interrupt the response", () => {
  // Validates: Requirements 16.5
  test("returns the normal 201 response even when console.log throws", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log sink unavailable");
    });

    try {
      const event = buildEvent({
        customerId: "customer-1",
        items: [{ productId: "product-1", quantity: 2, unitPrice: 10 }],
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(201);

      const responseBody = JSON.parse(response.body as string);
      expect(responseBody.customerId).toBe("customer-1");
      expect(typeof responseBody.id).toBe("string");
    } finally {
      logSpy.mockRestore();
    }
  });
});
