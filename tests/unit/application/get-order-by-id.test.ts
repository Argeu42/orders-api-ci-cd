import { GetOrderById } from "../../../src/application/get-order-by-id";
import { Order } from "../../../src/domain/order";
import { InMemoryOrderRepository } from "../fakes/in-memory-order-repository";

describe("GetOrderById", () => {
  // Validates: Requirements 11.5
  test("returns the matching Order when it exists in the repository", async () => {
    const repo = new InMemoryOrderRepository();
    const order = Order.create({
      id: "order-1",
      customerId: "customer-1",
      items: [{ productId: "product-1", quantity: 2, unitPrice: 10 }],
    });
    await repo.save(order);

    const useCase = new GetOrderById(repo);
    const result = await useCase.execute("order-1");

    expect(result).not.toBeNull();
    expect(result?.toProps()).toEqual(order.toProps());
  });

  // Validates: Requirements 11.5
  test("returns null when no Order matches the given id", async () => {
    const repo = new InMemoryOrderRepository();

    const useCase = new GetOrderById(repo);
    const result = await useCase.execute("non-existent-id");

    expect(result).toBeNull();
  });
});
