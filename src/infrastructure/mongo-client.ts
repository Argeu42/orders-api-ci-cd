import { MongoClient, Db } from "mongodb";
import dotenv from "dotenv";
import { getMongoUriFromSecrets } from "./secrets";

// Loads MONGODB_URI (and other local-only vars) from a .env file when present.
// In the Lambda runtime there is no .env file, so this is effectively a no-op
// there; locally (sam local, test scripts) it makes process.env.MONGODB_URI
// available without requiring the developer to export it manually.
dotenv.config();

const DEFAULT_DB_NAME = "orders";

// Cached across warm invocations of the same Lambda execution environment, so
// that a new MongoClient connection is only established on a cold start.
let cachedDb: Db | undefined;

/**
 * Determines the MongoDB connection URI.
 *
 * If MONGODB_SECRET_NAME is set (Lambda environment), the URI is fetched from
 * AWS Secrets Manager. Otherwise, it falls back to process.env.MONGODB_URI,
 * which is expected to be provided via a local .env file (sam local or test
 * scripts). Throws a clear error if neither source yields a URI.
 */
async function resolveMongoUri(): Promise<string> {
  const secretName = process.env.MONGODB_SECRET_NAME;

  if (secretName) {
    return getMongoUriFromSecrets(secretName);
  }

  const localUri = process.env.MONGODB_URI;
  if (localUri) {
    return localUri;
  }

  throw new Error(
    "MongoDB URI is not configured: set MONGODB_SECRET_NAME (Lambda) or MONGODB_URI (local .env)"
  );
}

/**
 * Returns the cached MongoDB Db instance, connecting on first use (cold
 * start) and reusing the same connection on subsequent warm invocations.
 */
export async function getDb(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  const uri = await resolveMongoUri();
  const dbName = process.env.MONGODB_DB_NAME ?? DEFAULT_DB_NAME;

  const client = new MongoClient(uri);
  await client.connect();

  cachedDb = client.db(dbName);
  return cachedDb;
}
