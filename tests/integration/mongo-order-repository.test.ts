/**
 * Integration tests for `MongoOrderRepository`, run against a real MongoDB
 * instance (see design.md, "Testes de integração (MongoOrderRepository)").
 *
 * Safety: these tests NEVER touch the `orders` database/collection used by
 * the application. `MONGODB_DB_NAME` is overridden to a dedicated test-only
 * database name before any connection is established, so all reads/writes
 * happen against an isolated database on the same cluster referenced by
 * `MONGODB_URI` (loaded from the repo's `.env` by `mongo-client.ts`).
 *
 * Each test cleans up the documents it creates in `afterEach`, and the test
 * collection is dropped in `afterAll`, so re-runs are deterministic
 * (Requirement 12.4). Run via `npm run test:integration` (`--runInBand`
 * avoids concurrency issues since all tests in this file share the same
 * test collection).
 *
 * Requirements: 12.1, 12.2, 12.4
 */

// Override the database name BEFORE the first call to getDb() so the
// connection never resolves to the production/dev "orders" database.
// mongo-client.ts reads process.env.MONGODB_DB_NAME lazily inside getDb(),
// so setting it here (after dotenv has already loaded `.env`) is enough to
// redirect every test in this file to the isolated test database.
process.env.MONGODB_DB_NAME = process.env.MONGODB_TEST_DB_NAME ?? "orders_test";

import { Db } from "mongodb";
import { getDb, closeDb } from "../../src/infrastructure/mongo-client";
import { MongoOrderRepository } from "../../src/infrastructure/mongo-order-repository";
import { Order } from "../../src/domain/order";
import { OrderStatus } from "../../src/domain/order-status";

const COLLECTION_NAME = "orders";

function makeOrder(overrides?: {
  id?: string;
  customerId?: string;
  quantity?: number;
  unitPrice?: number;
}): Order {
  return Order.create({
    id: overrides?.id ?? `test-order-${Math.random().toString(36).slice(2)}`,
    customerId: overrides?.customerId ?? "customer-1",
    items: [
      {
        productId: "product-1",
        quantity: overrides?.quantity ?? 2,
        unitPrice: overrides?.unitPrice ?? 10,
      },
    ],
  });
}

describe("MongoOrderRepository (integration)", () => {
  let repository: MongoOrderRepository;
  let db: Db;

  beforeAll(async () => {
    // Fails fast (rather than hanging) if the test MongoDB instance is not
    // reachable from this environment.
    db = await getDb();
    repository = new MongoOrderRepository();
  }, 20000);

  afterEach(async () => {
    await db.collection(COLLECTION_NAME).deleteMany({});
  });

  afterAll(async () => {
    await db.collection(COLLECTION_NAME).drop().catch(() => {
      // Collection may already be empty/nonexistent; dropping is best-effort
      // cleanup, not required for correctness since afterEach already
      // deletes all documents.
    });
    await closeDb();
  });

  describe("save (insertOne)", () => {
    it("persists a new order that can then be found by id", async () => {
      const order = makeOrder({ id: "save-test-1" });

      await repository.save(order);

      const found = await repository.findById("save-test-1");
      expect(found).not.toBeNull();
      expect(found?.toProps()).toMatchObject({
        id: "save-test-1",
        customerId: "customer-1",
        status: "PENDING",
        total: 20,
      });
    });
  });

  describe("findById (findOne)", () => {
    it("returns null when no order with the given id exists", async () => {
      const found = await repository.findById("nonexistent-id");
      expect(found).toBeNull();
    });

    it("returns the matching order when it exists", async () => {
      const order = makeOrder({ id: "find-by-id-test-1", customerId: "customer-42" });
      await repository.save(order);

      const found = await repository.findById("find-by-id-test-1");

      expect(found).not.toBeNull();
      expect(found?.toProps().customerId).toBe("customer-42");
    });
  });

  describe("find (with combined filters)", () => {
    beforeEach(async () => {
      const orders: Array<{ id: string; customerId: string; status: OrderStatus }> = [
        { id: "filter-1", customerId: "customer-a", status: "PENDING" },
        { id: "filter-2", customerId: "customer-a", status: "CONFIRMED" },
        { id: "filter-3", customerId: "customer-b", status: "PENDING" },
      ];

      for (const spec of orders) {
        const order = makeOrder({ id: spec.id, customerId: spec.customerId });
        const withStatus =
          spec.status === "PENDING" ? order : order.transitionTo(spec.status);
        await repository.save(withStatus);
      }
    });

    it("filters by customerId only", async () => {
      const results = await repository.find({ customerId: "customer-a" });

      expect(results.map((o) => o.toProps().id).sort()).toEqual(["filter-1", "filter-2"]);
    });

    it("filters by status only", async () => {
      const results = await repository.find({ status: "PENDING" });

      expect(results.map((o) => o.toProps().id).sort()).toEqual(["filter-1", "filter-3"]);
    });

    it("filters by combined customerId and status", async () => {
      const results = await repository.find({ customerId: "customer-a", status: "CONFIRMED" });

      expect(results.map((o) => o.toProps().id)).toEqual(["filter-2"]);
    });

    it("returns all orders sorted by createdAt ascending when no filter is given", async () => {
      const results = await repository.find({});

      expect(results).toHaveLength(3);
      const timestamps = results.map((o) => o.toProps().createdAt.getTime());
      expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    });
  });

  describe("update (updateOne)", () => {
    it("persists a status transition", async () => {
      const order = makeOrder({ id: "update-test-1" });
      await repository.save(order);

      const confirmed = order.transitionTo("CONFIRMED");
      await repository.update(confirmed);

      const found = await repository.findById("update-test-1");
      expect(found?.toProps().status).toBe("CONFIRMED");
    });
  });

  describe("getStats (aggregation pipeline)", () => {
    it("groups count and total sum by status", async () => {
      const pending1 = makeOrder({ id: "stats-1", quantity: 1, unitPrice: 10 }); // total 10
      const pending2 = makeOrder({ id: "stats-2", quantity: 2, unitPrice: 5 }); // total 10
      const confirmed = makeOrder({ id: "stats-3", quantity: 1, unitPrice: 30 }).transitionTo(
        "CONFIRMED"
      ); // total 30

      await repository.save(pending1);
      await repository.save(pending2);
      await repository.save(confirmed);

      const stats = await repository.getStats();
      const byStatus = new Map(stats.map((s) => [s.status, s]));

      expect(byStatus.get("PENDING")).toEqual({ status: "PENDING", count: 2, totalSum: 20 });
      expect(byStatus.get("CONFIRMED")).toEqual({ status: "CONFIRMED", count: 1, totalSum: 30 });
    });

    it("returns an empty array when the collection has no documents", async () => {
      const stats = await repository.getStats();
      expect(stats).toEqual([]);
    });
  });
});
