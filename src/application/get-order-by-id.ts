import { Order } from "../domain/order";
import { OrderRepository } from "../domain/order-repository";

export class GetOrderById {
  constructor(private readonly repo: OrderRepository) {}

  async execute(id: string): Promise<Order | null> {
    return await this.repo.findById(id);
  }
}
