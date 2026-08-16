import { Collection, Db } from "mongodb";
import { Order, OrderProps } from "../domain/order";
import { OrderStatus } from "../domain/order-status";
import { Item } from "../domain/item";
import { OrderRepository, OrderFilter, OrderStat } from "../domain/order-repository";
import { getDb } from "./mongo-client";

const COLLECTION_NAME = "orders";

/**
 * Shape of the `orders` collection documents in MongoDB. The domain `id` is
 * stored as the Mongo `_id`; all other fields map directly by name.
 */
interface OrderDocument {
  readonly _id: string;
  readonly customerId: string;
  readonly items: readonly Item[];
  readonly status: OrderStatus;
  readonly total: number;
  readonly createdAt: Date;
}

function toDocument(props: OrderProps): OrderDocument {
  return {
    _id: props.id,
    customerId: props.customerId,
    items: props.items,
    status: props.status,
    total: props.total,
    createdAt: props.createdAt,
  };
}

function toProps(doc: OrderDocument): OrderProps {
  return {
    id: doc._id,
    customerId: doc.customerId,
    items: doc.items,
    status: doc.status,
    total: doc.total,
    createdAt: doc.createdAt,
  };
}

/**
 * MongoDB-backed implementation of `OrderRepository`, using the official
 * MongoDB driver directly (no ORM/ODM), per Requirement 10.4.
 */
export class MongoOrderRepository implements OrderRepository {
  private async getCollection(): Promise<Collection<OrderDocument>> {
    const db: Db = await getDb();
    return db.collection<OrderDocument>(COLLECTION_NAME);
  }

  async save(order: Order): Promise<void> {
    const collection = await this.getCollection();
    const doc = toDocument(order.toProps());
    await collection.insertOne(doc);
  }

  async findById(id: string): Promise<Order | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ _id: id });

    if (!doc) {
      return null;
    }

    return Order.fromPersistence(toProps(doc));
  }

  async find(filter: OrderFilter): Promise<Order[]> {
    const collection = await this.getCollection();

    const query: { customerId?: string; status?: OrderStatus } = {};
    if (filter.customerId !== undefined) {
      query.customerId = filter.customerId;
    }
    if (filter.status !== undefined) {
      query.status = filter.status;
    }

    const docs = await collection.find(query).sort({ createdAt: 1 }).toArray();
    return docs.map((doc) => Order.fromPersistence(toProps(doc)));
  }

  async update(order: Order): Promise<void> {
    const collection = await this.getCollection();
    const props = order.toProps();
    const { _id, ...fields } = toDocument(props);

    await collection.updateOne({ _id }, { $set: fields });
  }

  async getStats(): Promise<OrderStat[]> {
    const collection = await this.getCollection();

    const pipeline = [
      { $group: { _id: "$status", count: { $sum: 1 }, totalSum: { $sum: "$total" } } },
      { $project: { _id: 0, status: "$_id", count: 1, totalSum: { $round: ["$totalSum", 2] } } },
    ];

    const results = await collection.aggregate<OrderStat>(pipeline).toArray();
    return results;
  }
}
