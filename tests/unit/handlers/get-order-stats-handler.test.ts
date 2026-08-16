import fc from "fast-check";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { Order } from "../../../src/domain/order";
import { OrderStatus } from "../../../src/domain/order-status";
import { Item } from "../../../src/domain/item";
import { OrderStat } from "../../../src/domain/order-repository";
import { InMemoryOrderRepository } from "../fakes/in-memory-order-repository";

jest.mock("../../../src/infrastructure/mongo-order-repository");

// Imported after jest.mock so the constructor below refers to the auto-mocked class.
import { MongoOrderRepository } from "../../../src/infrastructure/mongo-order-repository";
import { handler } from "../../../src/handlers/get-order-stats-handler";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculateTotal(items: readonly Item[]): number {
  return round2(items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0));
}

function buildEvent(): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      http: {
        method: "GET",
        path: "/orders/stats",
      },
    },
  } as unknown as APIGatewayProxyEventV2;
}

const orderStatusArbitrary: fc.Arbitrary<OrderStatus> = fc.constantFrom(
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "CANCELED"
);

const itemArbitrary: fc.Arbitrary<Item> = fc.record({
  productId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  quantity: fc.integer({ min: 1, max: 1_000 }),
  unitPrice: fc.float({ min: 0, max: 100_000, noNaN: true }),
});

const seedOrderArbitrary = fc.record({
  customerId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  items: fc.array(itemArbitrary, { minLength: 1, maxLength: 5 }),
  status: orderStatusArbitrary,
});

const seedOrdersArbitrary = fc.array(seedOrderArbitrary, { minLength: 0, maxLength: 20 });

describe("get-order-stats-handler", () => {
  // Feature: orders-api, Property 17: Estatísticas agregam corretamente por status
  // Validates: Requirements 8.1, 8.2
  test("Feature: orders-api, Property 17: Estatísticas agregam corretamente por status", async () => {
    await fc.assert(
      fc.asyncProperty(seedOrdersArbitrary, async (seedOrders) => {
        const repo = new InMemoryOrderRepository();

        (MongoOrderRepository as unknown as jest.Mock).mockImplementation(() => repo);

        const expected = new Map<OrderStatus, { count: number; totalSum: number }>();

        for (const [i, seed] of seedOrders.entries()) {
          const total = calculateTotal(seed.items);

          const order = Order.fromPersistence({
            id: `order-${i}`,
            customerId: seed.customerId,
            items: seed.items,
            status: seed.status,
            total,
            createdAt: new Date(),
          });

          await repo.save(order);

          const entry = expected.get(seed.status) ?? { count: 0, totalSum: 0 };
          entry.count += 1;
          entry.totalSum = round2(entry.totalSum + total);
          expected.set(seed.status, entry);
        }

        const result = (await handler(buildEvent())) as APIGatewayProxyStructuredResultV2;

        expect(result.statusCode).toBe(200);

        const body = JSON.parse(result.body ?? "[]") as OrderStat[];

        expect(body).toHaveLength(expected.size);

        for (const stat of body) {
          const expectedEntry = expected.get(stat.status);
          expect(expectedEntry).toBeDefined();
          expect(stat.count).toBe(expectedEntry?.count);
          expect(stat.totalSum).toBeCloseTo(expectedEntry?.totalSum as number, 2);
        }

        if (seedOrders.length === 0) {
          expect(body).toEqual([]);
        }
      }),
      { numRuns: 100 }
    );
  });
});
