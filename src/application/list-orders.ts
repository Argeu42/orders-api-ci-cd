import { Order } from "../domain/order";
import { OrderRepository, OrderFilter } from "../domain/order-repository";

export class ListOrders {
  constructor(private readonly repo: OrderRepository) {}

  async execute(filter: OrderFilter): Promise<Order[]> {
    return this.repo.find(filter);
  }
}
