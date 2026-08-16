const connectMock = jest.fn();

jest.mock("mongodb", () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: connectMock,
    db: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock("../../../src/infrastructure/secrets", () => ({
  getMongoUriFromSecrets: jest.fn(),
}));

import { getMongoUriFromSecrets } from "../../../src/infrastructure/secrets";
import { getDb } from "../../../src/infrastructure/mongo-client";

const mockedGetMongoUriFromSecrets = getMongoUriFromSecrets as jest.MockedFunction<
  typeof getMongoUriFromSecrets
>;

describe("mongo-client - Secrets Manager failure handling", () => {
  const originalSecretName = process.env.MONGODB_SECRET_NAME;
  const originalMongoUri = process.env.MONGODB_URI;

  beforeEach(() => {
    process.env.MONGODB_SECRET_NAME = "orders-mongo-uri";
    delete process.env.MONGODB_URI;
  });

  afterEach(() => {
    connectMock.mockReset();
    mockedGetMongoUriFromSecrets.mockReset();

    if (originalSecretName === undefined) {
      delete process.env.MONGODB_SECRET_NAME;
    } else {
      process.env.MONGODB_SECRET_NAME = originalSecretName;
    }

    if (originalMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongoUri;
    }
  });

  // Validates: Requirements 15.4
  test("getDb() rejects and never attempts a MongoDB connection when Secrets Manager fails", async () => {
    mockedGetMongoUriFromSecrets.mockRejectedValueOnce(new Error("Access denied"));

    await expect(getDb()).rejects.toThrow("Access denied");

    expect(connectMock).not.toHaveBeenCalled();
  });
});
