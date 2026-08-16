import { ListOrders } from "../../../src/application/list-orders";
import { Order } from "../../../src/domain/order";
import { InMemoryOrderRepository } from "../fakes/in-memory-order-repository";

function buildOrder(overrides: {
  id: string;
  customerId: string;
  status: "PENDING" | "CONFIRMED" | "SHIPPED" | "CANCELED";
  createdAt: Date;
}): Order {
  return Order.fromPersistence({
    id: overrides.id,
    customerId: overrides.customerId,
    items: [{ productId: "product-1", quantity: 1, unitPrice: 10 }],
    status: overrides.status,
    total: 10,
    createdAt: overrides.createdAt,
  });
}

describe("ListOrders", () => {
  // Validates: Requirements 11.5
  test("returns orders matching the filter, sorted by createdAt ascending", async () => {
    const repo = new InMemoryOrderRepository();
    const listOrders = new ListOrders(repo);

    const matchingOlder = buildOrder({
      id: "order-1",
      customerId: "customer-A",
      status: "PENDING",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    const matchingNewer = buildOrder({
      id: "order-2",
      customerId: "customer-A",
      status: "PENDING",
      createdAt: new Date("2024-02-01T00:00:00.000Z"),
    });
    const differentCustomer = buildOrder({
      id: "order-3",
      customerId: "customer-B",
      status: "PENDING",
      createdAt: new Date("2024-01-15T00:00:00.000Z"),
    });
    const differentStatus = buildOrder({
      id: "order-4",
      customerId: "customer-A",
      status: "CONFIRMED",
      createdAt: new Date("2024-01-10T00:00:00.000Z"),
    });

    // Save out of order to ensure sorting is not an artifact of insertion order.
    await repo.save(matchingNewer);
    await repo.save(differentCustomer);
    await repo.save(matchingOlder);
    await repo.save(differentStatus);

    const result = await listOrders.execute({ customerId: "customer-A", status: "PENDING" });

    expect(result.map((order) => order.toProps().id)).toEqual(["order-1", "order-2"]);
  });

  // Validates: Requirements 11.5
  test("returns an empty array when no order matches the filter", async () => {
    const repo = new InMemoryOrderRepository();
    const listOrders = new ListOrders(repo);

    await repo.save(
      buildOrder({
        id: "order-1",
        customerId: "customer-A",
        status: "PENDING",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      })
    );

    const result = await listOrders.execute({ customerId: "customer-does-not-exist" });

    expect(result).toEqual([]);
  });

  // Validates: Requirements 11.5
  test("returns an empty array when the repository is empty", async () => {
    const repo = new InMemoryOrderRepository();
    const listOrders = new ListOrders(repo);

    const result = await listOrders.execute({});

    expect(result).toEqual([]);
  });
});
