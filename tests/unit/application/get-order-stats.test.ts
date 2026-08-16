import { GetOrderStats } from "../../../src/application/get-order-stats";
import { Order } from "../../../src/domain/order";
import { InMemoryOrderRepository } from "../fakes/in-memory-order-repository";

describe("GetOrderStats", () => {
  test("returns count and totalSum grouped by status for a non-empty collection", async () => {
    const repo = new InMemoryOrderRepository();

    const pendingOrder1 = Order.create({
      id: "order-1",
      customerId: "customer-1",
      items: [{ productId: "product-1", quantity: 2, unitPrice: 10 }],
    });

    const pendingOrder2 = Order.create({
      id: "order-2",
      customerId: "customer-2",
      items: [{ productId: "product-2", quantity: 1, unitPrice: 5.5 }],
    });

    const confirmedOrder = Order.create({
      id: "order-3",
      customerId: "customer-3",
      items: [{ productId: "product-3", quantity: 3, unitPrice: 20 }],
    }).transitionTo("CONFIRMED");

    await repo.save(pendingOrder1);
    await repo.save(pendingOrder2);
    await repo.save(confirmedOrder);

    const useCase = new GetOrderStats(repo);
    const stats = await useCase.execute();

    expect(stats).toHaveLength(2);

    const pendingStat = stats.find((s) => s.status === "PENDING");
    const confirmedStat = stats.find((s) => s.status === "CONFIRMED");

    expect(pendingStat).toEqual({ status: "PENDING", count: 2, totalSum: 25.5 });
    expect(confirmedStat).toEqual({ status: "CONFIRMED", count: 1, totalSum: 60 });
  });

  test("returns an empty array when the repository has no orders", async () => {
    const repo = new InMemoryOrderRepository();
    const useCase = new GetOrderStats(repo);

    const stats = await useCase.execute();

    expect(stats).toEqual([]);
  });
});
