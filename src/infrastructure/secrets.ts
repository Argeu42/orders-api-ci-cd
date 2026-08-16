import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

let cachedUri: string | undefined;
const client = new SecretsManagerClient({});

/**
 * Fetches the MongoDB connection URI from AWS Secrets Manager.
 *
 * The value is cached in a module-scope variable so that warm invocations of the
 * same Lambda execution environment reuse the previously fetched URI instead of
 * calling Secrets Manager again.
 *
 * On failure, the error is logged WITHOUT the credential value, and the error is
 * re-thrown so callers never proceed to attempt a MongoDB connection with a
 * bad/missing URI (Requirements 15.1, 15.4).
 */
export async function getMongoUriFromSecrets(secretName: string): Promise<string> {
  if (cachedUri !== undefined) {
    return cachedUri;
  }

  try {
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
    const secretString = response.SecretString;

    if (!secretString) {
      throw new Error("Secret value is empty");
    }

    cachedUri = secretString;
    return cachedUri;
  } catch (error) {
    // Never log `error`, `secretString`, or `cachedUri` directly here: the failure
    // could wrap SDK response metadata. Log only a safe, fixed message.
    console.error(JSON.stringify({ event: "secrets.error", message: "Failed to retrieve MongoDB URI from Secrets Manager" }));
    throw error;
  }
}
