import { CreateOrder } from "../../../src/application/create-order";
import { InMemoryOrderRepository } from "../fakes/in-memory-order-repository";
import { ValidationError } from "../../../src/domain/errors";

describe("CreateOrder", () => {
  test("creates and persists an Order when input is valid", async () => {
    const repo = new InMemoryOrderRepository();
    const createOrder = new CreateOrder(repo);

    const result = await createOrder.execute({
      customerId: "customer-1",
      items: [
        { productId: "product-1", quantity: 2, unitPrice: 10 },
        { productId: "product-2", quantity: 1, unitPrice: 5 },
      ],
    });

    const props = result.toProps();

    expect(props.id).toBeTruthy();
    expect(props.customerId).toBe("customer-1");
    expect(props.status).toBe("PENDING");
    expect(props.total).toBe(25);
    expect(props.createdAt).toBeInstanceOf(Date);

    const persisted = await repo.findById(props.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.toProps()).toEqual(props);
  });

  test("throws ValidationError and persists nothing when input is invalid", async () => {
    const repo = new InMemoryOrderRepository();
    const createOrder = new CreateOrder(repo);

    await expect(
      createOrder.execute({
        customerId: "",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 10 }],
      })
    ).rejects.toThrow(ValidationError);

    const all = await repo.find({});
    expect(all).toHaveLength(0);
  });
});
