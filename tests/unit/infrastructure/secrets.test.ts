const sendMock = jest.fn();

jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: sendMock,
  })),
  GetSecretValueCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

import { getMongoUriFromSecrets } from "../../../src/infrastructure/secrets";

describe("secrets - getMongoUriFromSecrets failure handling", () => {
  afterEach(() => {
    sendMock.mockReset();
  });

  // Validates: Requirements 15.4
  test("logs a safe fixed message without the credential/error content, and rethrows without exposing it", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const originalError = new Error(
      "AccessDeniedException: user arn:aws:iam::123456789012:user/dev is not authorized to perform secretsmanager:GetSecretValue on resource mongodb+srv://super-secret-credential"
    );

    try {
      sendMock.mockRejectedValueOnce(originalError);

      await expect(getMongoUriFromSecrets("some-secret-name")).rejects.toBe(originalError);

      expect(errorSpy).toHaveBeenCalledTimes(1);

      const loggedArg = errorSpy.mock.calls[0]?.[0] as string;
      expect(typeof loggedArg).toBe("string");

      // The logged message must never leak the original error's content
      // (which could carry credential-like strings), only a safe fixed message.
      expect(loggedArg).not.toContain("AccessDeniedException");
      expect(loggedArg).not.toContain("super-secret-credential");
      expect(loggedArg).not.toContain(originalError.message);

      const parsed = JSON.parse(loggedArg);
      expect(parsed.event).toBe("secrets.error");
      expect(typeof parsed.message).toBe("string");
      expect(parsed.message.length).toBeGreaterThan(0);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
