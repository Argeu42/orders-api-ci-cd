import { logHandlerStart, logHandlerSuccess, logHandlerError } from "../../../src/infrastructure/logger";

describe("logger - logging failures do not propagate", () => {
  // Validates: Requirements 16.5
  test("logHandlerStart does not throw when console.log throws", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log sink unavailable");
    });

    try {
      expect(() => logHandlerStart("POST", "/orders")).not.toThrow();
    } finally {
      logSpy.mockRestore();
    }
  });

  test("logHandlerSuccess does not throw when console.log throws", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log sink unavailable");
    });

    try {
      expect(() => logHandlerSuccess("order-1")).not.toThrow();
    } finally {
      logSpy.mockRestore();
    }
  });

  test("logHandlerError does not throw when console.error throws", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {
      throw new Error("log sink unavailable");
    });

    try {
      expect(() => logHandlerError("ValidationError", 400)).not.toThrow();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
