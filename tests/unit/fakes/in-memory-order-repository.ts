import { Order } from "../../../src/domain/order";
import {
  OrderFilter,
  OrderRepository,
  OrderStat,
} from "../../../src/domain/order-repository";

/**
 * In-memory fake implementation of `OrderRepository`, used by application-layer
 * unit tests instead of a real MongoDB connection.
 *
 * NOTE: this fake reads order fields via `Order.toProps()`. That accessor is
 * introduced by task 5.1 (`Order.fromPersistence`/`Order.toProps`), which lands
 * before any application-layer task that exercises this fake. Until 5.1 is
 * implemented, this file will not typecheck against the current `Order` stub.
 */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  async save(order: Order): Promise<void> {
    this.orders.set(order.toProps().id, order);
  }

  async findById(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async find(filter: OrderFilter): Promise<Order[]> {
    const results = Array.from(this.orders.values()).filter((order) => {
      const props = order.toProps();

      if (filter.customerId !== undefined && props.customerId !== filter.customerId) {
        return false;
      }

      if (filter.status !== undefined && props.status !== filter.status) {
        return false;
      }

      return true;
    });

    return results.sort(
      (a, b) => a.toProps().createdAt.getTime() - b.toProps().createdAt.getTime(),
    );
  }

  async update(order: Order): Promise<void> {
    this.orders.set(order.toProps().id, order);
  }

  async getStats(): Promise<OrderStat[]> {
    const grouped = new Map<string, { count: number; totalSum: number }>();

    for (const order of this.orders.values()) {
      const props = order.toProps();
      const entry = grouped.get(props.status) ?? { count: 0, totalSum: 0 };
      entry.count += 1;
      entry.totalSum += props.total;
      grouped.set(props.status, entry);
    }

    return Array.from(grouped.entries()).map(([status, { count, totalSum }]) => ({
      status: status as OrderStat["status"],
      count,
      totalSum: Math.round(totalSum * 100) / 100,
    }));
  }
}
