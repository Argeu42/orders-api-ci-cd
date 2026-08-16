import { UpdateOrderStatus } from "../../../src/application/update-order-status";
import { NotFoundError } from "../../../src/application/errors";
import { InvalidTransitionError } from "../../../src/domain/errors";
import { Order } from "../../../src/domain/order";
import { InMemoryOrderRepository } from "../fakes/in-memory-order-repository";

function seedOrder(repo: InMemoryOrderRepository, id: string, status: Parameters<typeof Order.fromPersistence>[0]["status"]): Order {
  const order = Order.fromPersistence({
    id,
    customerId: "customer-1",
    items: [{ productId: "product-1", quantity: 1, unitPrice: 10 }],
    status,
    total: 10,
    createdAt: new Date(),
  });

  void repo.save(order);

  return order;
}

describe("UpdateOrderStatus", () => {
  test("valid transition: persists and returns the updated Order", async () => {
    const repo = new InMemoryOrderRepository();
    seedOrder(repo, "order-1", "PENDING");
    const useCase = new UpdateOrderStatus(repo);

    const result = await useCase.execute("order-1", "CONFIRMED");

    expect(result.toProps().status).toBe("CONFIRMED");

    const persisted = await repo.findById("order-1");
    expect(persisted?.toProps().status).toBe("CONFIRMED");
  });

  test("not found: throws NotFoundError for a nonexistent id", async () => {
    const repo = new InMemoryOrderRepository();
    const useCase = new UpdateOrderStatus(repo);

    await expect(useCase.execute("does-not-exist", "CONFIRMED")).rejects.toThrow(NotFoundError);
  });

  test("invalid transition: throws InvalidTransitionError and leaves the persisted order unchanged", async () => {
    const repo = new InMemoryOrderRepository();
    seedOrder(repo, "order-1", "SHIPPED");
    const useCase = new UpdateOrderStatus(repo);

    await expect(useCase.execute("order-1", "CONFIRMED")).rejects.toThrow(InvalidTransitionError);

    const persisted = await repo.findById("order-1");
    expect(persisted?.toProps().status).toBe("SHIPPED");
  });
});
