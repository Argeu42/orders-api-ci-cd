import { v4 as uuidv4 } from "uuid";
import { Order } from "../domain/order";
import { OrderRepository } from "../domain/order-repository";

export interface CreateOrderInput {
  readonly customerId: string;
  readonly items: readonly { productId: string; quantity: number; unitPrice: number }[];
}

export class CreateOrder {
  constructor(private readonly repo: OrderRepository) {}

  async execute(input: CreateOrderInput): Promise<Order> {
    const id = uuidv4();

    const order = Order.create({
      id,
      customerId: input.customerId,
      items: input.items,
    });

    await this.repo.save(order);

    return order;
  }
}
