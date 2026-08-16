import { Order } from "../domain/order";
import { OrderStatus } from "../domain/order-status";
import { OrderRepository } from "../domain/order-repository";
import { NotFoundError } from "./errors";

export class UpdateOrderStatus {
  constructor(private readonly repo: OrderRepository) {}

  async execute(id: string, next: OrderStatus): Promise<Order> {
    const order = await this.repo.findById(id);

    if (!order) {
      throw new NotFoundError(`Order with id ${id} not found`);
    }

    const updated = order.transitionTo(next);

    await this.repo.update(updated);

    return updated;
  }
}
