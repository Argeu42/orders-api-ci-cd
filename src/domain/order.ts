import { Item } from "./item";
import { OrderStatus, canTransition } from "./order-status";
import { InvalidTransitionError, ValidationError } from "./errors";

export interface OrderProps {
  readonly id: string;
  readonly customerId: string;
  readonly items: readonly Item[];
  readonly status: OrderStatus;
  readonly total: number;
  readonly createdAt: Date;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function validateCustomerId(customerId: string): void {
  if (typeof customerId !== "string" || customerId.trim().length === 0) {
    throw new ValidationError("customerId is required");
  }
}

function validateItems(items: readonly Item[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError("items must be a non-empty list");
  }

  for (const item of items) {
    if (typeof item.productId !== "string" || item.productId.trim().length === 0) {
      throw new ValidationError("item.productId is required");
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ValidationError("item.quantity must be a positive integer");
    }

    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      throw new ValidationError("item.unitPrice must be a finite number >= 0");
    }
  }
}

function calculateTotal(items: readonly Item[]): number {
  const sum = items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  return round2(sum);
}

export class Order {
  private constructor(private readonly props: OrderProps) {}

  static create(input: { id: string; customerId: string; items: readonly Item[] }): Order {
    validateCustomerId(input.customerId);
    validateItems(input.items);

    const total = calculateTotal(input.items);

    return new Order({
      id: input.id,
      customerId: input.customerId,
      items: input.items,
      status: "PENDING",
      total,
      createdAt: new Date(),
    });
  }

  static fromPersistence(props: OrderProps): Order {
    return new Order(props);
  }

  transitionTo(next: OrderStatus): Order {
    const current = this.props.status;

    if (!canTransition(current, next)) {
      const isTerminal = current === "SHIPPED" || current === "CANCELED";
      const terminalNote = isTerminal ? ` (${current} is a terminal status)` : "";
      throw new InvalidTransitionError(
        `Cannot transition order from ${current} to ${next}${terminalNote}`
      );
    }

    return new Order({ ...this.props, status: next });
  }

  toProps(): OrderProps {
    return this.props;
  }
}
