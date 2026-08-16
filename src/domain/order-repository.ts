import { Order } from "./order";
import { OrderStatus } from "./order-status";

export interface OrderFilter {
  readonly customerId?: string;
  readonly status?: OrderStatus;
}

export interface OrderStat {
  readonly status: OrderStatus;
  readonly count: number;
  readonly totalSum: number;
}

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  find(filter: OrderFilter): Promise<Order[]>;
  update(order: Order): Promise<void>;
  getStats(): Promise<OrderStat[]>;
}
