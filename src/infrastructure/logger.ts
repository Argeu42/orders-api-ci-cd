/**
 * Structured logging helper for handlers.
 *
 * Logs JSON-shaped events via console.log/console.error. Every log call is
 * wrapped in try/catch so that a logging failure (e.g. console.log throwing
 * for some exceptional reason) is isolated and never propagates to the
 * caller, per Requirement 16.5.
 */

export function logHandlerStart(method: string, path: string): void {
  try {
    console.log(JSON.stringify({ event: "handler.start", method, path }));
  } catch {
    // Swallow logging failures — never let logging break the handler.
  }
}

export function logHandlerSuccess(orderId: string): void {
  try {
    console.log(JSON.stringify({ event: "handler.success", orderId }));
  } catch {
    // Swallow logging failures — never let logging break the handler.
  }
}

export function logHandlerError(errorType: string, statusCode: number): void {
  try {
    console.error(
      JSON.stringify({ event: "handler.error", errorType, statusCode })
    );
  } catch {
    // Swallow logging failures — never let logging break the handler.
  }
}
