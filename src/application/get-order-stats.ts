import { OrderRepository, OrderStat } from "../domain/order-repository";

export class GetOrderStats {
  constructor(private readonly repo: OrderRepository) {}

  async execute(): Promise<OrderStat[]> {
    return await this.repo.getStats();
  }
}
