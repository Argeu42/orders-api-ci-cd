/**
 * One-off setup script that creates the indexes the `orders` collection
 * needs to support the query patterns used by the API (see design.md,
 * section "Índices").
 *
 * Run via `npm run setup:indexes`. Not part of the SAM template — SAM does
 * not provision MongoDB Atlas resources, so this script is executed
 * manually, once, against the target cluster.
 *
 * Requirements: 9.2 (idx_customerId), 9.3 (idx_status), 9.5 (idx_customerId_status)
 */
import { getDb } from "../src/infrastructure/mongo-client";

const COLLECTION_NAME = "orders";

async function setupIndexes(): Promise<void> {
  console.log("Connecting to MongoDB...");
  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);

  console.log(`Creating index "idx_customerId" on { customerId: 1 }...`);
  await collection.createIndex({ customerId: 1 }, { name: "idx_customerId" });

  console.log(`Creating index "idx_status" on { status: 1 }...`);
  await collection.createIndex({ status: 1 }, { name: "idx_status" });

  console.log(
    `Creating index "idx_customerId_status" on { customerId: 1, status: 1 }...`
  );
  await collection.createIndex(
    { customerId: 1, status: 1 },
    { name: "idx_customerId_status" }
  );

  console.log("All indexes created successfully.");
}

setupIndexes()
  .then(() => {
    // getDb() caches the MongoClient connection for warm Lambda invocations;
    // in this one-off script there is no further work to do, so exit
    // explicitly rather than waiting for the driver's background handles
    // (e.g. server monitoring) to let the event loop drain on its own.
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Failed to set up indexes:", error);
    process.exit(1);
  });
