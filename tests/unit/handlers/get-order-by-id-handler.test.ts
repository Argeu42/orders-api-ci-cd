import { InMemoryOrderRepository } from "../fakes/in-memory-order-repository";

let currentRepo: InMemoryOrderRepository = new InMemoryOrderRepository();

// ts-jest does not auto-hoist jest.mock() calls (unlike babel-jest), so this
// must be declared before importing the handler module below, otherwise the
// handler would already have required the real MongoOrderRepository.
jest.mock("../../../src/infrastructure/mongo-order-repository", () => {
  return {
    MongoOrderRepository: jest.fn().mockImplementation(() => currentRepo),
  };
});

import fc from "fast-check";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { handler } from "../../../src/handlers/get-order-by-id-handler";
import { Order } from "../../../src/domain/order";
import { Item } from "../../../src/domain/item";
import { OrderStatus } from "../../../src/domain/order-status";

const itemArbitrary: fc.Arbitrary<Item> = fc.record({
  productId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  quantity: fc.integer({ min: 1, max: 1_000_000 }),
  unitPrice: fc.float({ min: 0, max: 1_000_000, noNaN: true }),
});

const orderStatusArbitrary: fc.Arbitrary<OrderStatus> = fc.constantFrom(
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "CANCELED"
);

const storedOrderArbitrary = fc.record({
  id: fc.uuid(),
  customerId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  items: fc.array(itemArbitrary, { minLength: 1, maxLength: 20 }),
  status: orderStatusArbitrary,
  total: fc.float({ min: 0, max: 1_000_000, noNaN: true }),
  createdAt: fc.date({
    min: new Date("2000-01-01T00:00:00.000Z"),
    max: new Date("2100-01-01T00:00:00.000Z"),
    noInvalidDate: true,
  }),
});

function buildEvent(id: string): APIGatewayProxyEventV2 {
  return {
    pathParameters: { id },
    requestContext: { http: { method: "GET", path: `/orders/${id}` } },
  } as unknown as APIGatewayProxyEventV2;
}

describe("get-order-by-id-handler", () => {
  // Feature: orders-api, Property 9: Consulta por id existente retorna todos os atributos
  // Validates: Requirements 5.1
  test("Feature: orders-api, Property 9: Consulta por id existente retorna todos os atributos", async () => {
    await fc.assert(
      fc.asyncProperty(storedOrderArbitrary, async (props) => {
        currentRepo = new InMemoryOrderRepository();
        const order = Order.fromPersistence(props);
        await currentRepo.save(order);

        const response = await handler(buildEvent(props.id));

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body as string);

        expect(body.id).toBe(props.id);
        expect(body.customerId).toBe(props.customerId);
        expect(body.items).toEqual(props.items);
        expect(body.status).toBe(props.status);
        expect(body.total).toBe(props.total);
        expect(body.createdAt).toBe(props.createdAt.toISOString());
      }),
      { numRuns: 100 }
    );
  });

  // Feature: orders-api, Property 10: Consulta por id inexistente retorna 404
  // Validates: Requirements 5.2
  test("Feature: orders-api, Property 10: Consulta por id inexistente retorna 404", async () => {
    const errorSpy = jest.spyOn(console, "error");

    try {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (id) => {
          currentRepo = new InMemoryOrderRepository();
          errorSpy.mockClear();

          const response = await handler(buildEvent(id));

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

  // Feature: orders-api, Property 11: Consulta por id malformado retorna 400
  // Validates: Requirements 5.3
  test("Feature: orders-api, Property 11: Consulta por id malformado retorna 400", async () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const malformedIdArbitrary: fc.Arbitrary<string> = fc.oneof(
      fc.constant(""),
      fc.stringOf(fc.constantFrom(" ", "\t", "\n"), { minLength: 1, maxLength: 10 }),
      fc.string().filter((s) => !UUID_REGEX.test(s))
    );

    const errorSpy = jest.spyOn(console, "error");

    try {
      await fc.assert(
        fc.asyncProperty(malformedIdArbitrary, async (id) => {
          currentRepo = new InMemoryOrderRepository();
          const findByIdSpy = jest.spyOn(currentRepo, "findById");
          errorSpy.mockClear();

          const response = await handler(buildEvent(id));

          expect(response.statusCode).toBe(400);
          expect(findByIdSpy).not.toHaveBeenCalled();

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
});
