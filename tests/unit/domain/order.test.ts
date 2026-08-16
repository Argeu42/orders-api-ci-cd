import fc from "fast-check";
import { Order } from "../../../src/domain/order";
import { Item } from "../../../src/domain/item";
import { OrderStatus, canTransition } from "../../../src/domain/order-status";
import { InvalidTransitionError, ValidationError } from "../../../src/domain/errors";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const itemArbitrary: fc.Arbitrary<Item> = fc.record({
  productId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  quantity: fc.integer({ min: 1, max: 1_000_000 }),
  unitPrice: fc.float({ min: 0, max: 1_000_000, noNaN: true }),
});

describe("Order.create", () => {
  // Feature: orders-api, Property 1: Cálculo do total na criação
  // Validates: Requirements 2.3, 2.9
  test("Feature: orders-api, Property 1: Cálculo do total na criação", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        fc.array(itemArbitrary, { minLength: 1, maxLength: 20 }),
        (customerId, items) => {
          const order = Order.create({ id: "order-1", customerId, items });
          const props = order.toProps();

          const expectedTotal = round2(
            items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
          );

          expect(props.status).toBe("PENDING");
          expect(props.createdAt).toBeInstanceOf(Date);
          expect(props.total).toBeCloseTo(expectedTotal, 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Order.create - invalid customerId", () => {
  const invalidCustomerIdArbitrary = fc.oneof(
    fc.constant(""),
    fc.stringOf(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 1, maxLength: 20 }),
    fc.constant(undefined),
    fc.constant(null)
  );

  // Feature: orders-api, Property 2: Rejeição de customerId inválido
  // Validates: Requirements 2.4
  test("Feature: orders-api, Property 2: Rejeição de customerId inválido", () => {
    fc.assert(
      fc.property(
        invalidCustomerIdArbitrary,
        fc.array(itemArbitrary, { minLength: 1, maxLength: 20 }),
        (customerId, items) => {
          expect(() =>
            Order.create({ id: "order-1", customerId: customerId as unknown as string, items })
          ).toThrow(ValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Order.create - empty items list", () => {
  const validCustomerIdArbitrary = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

  // Feature: orders-api, Property 3: Rejeição de lista de items vazia
  // Validates: Requirements 2.5
  test("Feature: orders-api, Property 3: Rejeição de lista de items vazia", () => {
    fc.assert(
      fc.property(validCustomerIdArbitrary, (customerId) => {
        let createdOrder: Order | undefined;
        let thrown: unknown;

        try {
          createdOrder = Order.create({ id: "order-1", customerId, items: [] });
        } catch (error) {
          thrown = error;
        }

        expect(createdOrder).toBeUndefined();
        expect(thrown).toBeInstanceOf(ValidationError);
      }),
      { numRuns: 100 }
    );
  });
});

describe("Order.create - invalid item", () => {
  const validCustomerIdArbitrary = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

  const validProductIdArbitrary = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
  const validQuantityArbitrary = fc.integer({ min: 1, max: 1_000_000 });
  const validUnitPriceArbitrary = fc.float({ min: 0, max: 1_000_000, noNaN: true });

  const invalidProductIdArbitrary = fc.oneof(
    fc.constant(""),
    fc.stringOf(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 1, maxLength: 10 }),
    fc.constant(undefined),
    fc.constant(null)
  );

  const invalidQuantityArbitrary = fc.oneof(
    fc.integer({ min: -1_000_000, max: 0 }),
    fc
      .float({ min: -1_000, max: 1_000, noNaN: true })
      .filter((n) => !Number.isInteger(n)),
    fc.constant(NaN),
    fc.constant(Infinity),
    fc.constant(-Infinity)
  );

  const invalidUnitPriceArbitrary = fc.oneof(
    fc.float({ min: Math.fround(-1_000_000), max: Math.fround(-0.01), noNaN: true }),
    fc.constant(NaN),
    fc.constant(Infinity),
    fc.constant(-Infinity)
  );

  const itemWithInvalidProductIdArbitrary = fc.record({
    productId: invalidProductIdArbitrary,
    quantity: validQuantityArbitrary,
    unitPrice: validUnitPriceArbitrary,
  });

  const itemWithInvalidQuantityArbitrary = fc.record({
    productId: validProductIdArbitrary,
    quantity: invalidQuantityArbitrary,
    unitPrice: validUnitPriceArbitrary,
  });

  const itemWithInvalidUnitPriceArbitrary = fc.record({
    productId: validProductIdArbitrary,
    quantity: validQuantityArbitrary,
    unitPrice: invalidUnitPriceArbitrary,
  });

  const invalidItemArbitrary = fc.oneof(
    itemWithInvalidProductIdArbitrary,
    itemWithInvalidQuantityArbitrary,
    itemWithInvalidUnitPriceArbitrary
  );

  const itemsWithAtLeastOneInvalidArbitrary = fc
    .tuple(
      fc.array(itemArbitrary, { maxLength: 10 }),
      invalidItemArbitrary,
      fc.array(itemArbitrary, { maxLength: 10 })
    )
    .map(([prefix, invalidItem, suffix]) => [...prefix, invalidItem, ...suffix]);

  // Feature: orders-api, Property 4: Rejeição de item inválido
  // Validates: Requirements 2.6, 2.7, 2.8
  test("Feature: orders-api, Property 4: Rejeição de item inválido", () => {
    fc.assert(
      fc.property(validCustomerIdArbitrary, itemsWithAtLeastOneInvalidArbitrary, (customerId, items) => {
        let createdOrder: Order | undefined;
        let thrown: unknown;

        try {
          createdOrder = Order.create({
            id: "order-1",
            customerId,
            items: items as unknown as Item[],
          });
        } catch (error) {
          thrown = error;
        }

        expect(createdOrder).toBeUndefined();
        expect(thrown).toBeInstanceOf(ValidationError);
      }),
      { numRuns: 100 }
    );
  });
});

describe("Order.transitionTo", () => {
  const orderStatusArbitrary: fc.Arbitrary<OrderStatus> = fc.constantFrom(
    "PENDING",
    "CONFIRMED",
    "SHIPPED",
    "CANCELED"
  );

  function buildOrder(status: OrderStatus): Order {
    return Order.fromPersistence({
      id: "order-1",
      customerId: "customer-1",
      items: [{ productId: "product-1", quantity: 1, unitPrice: 10 }],
      status,
      total: 10,
      createdAt: new Date(),
    });
  }

  // Feature: orders-api, Property 5: Máquina de estados de transição
  // Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
  test("Feature: orders-api, Property 5: Máquina de estados de transição", () => {
    fc.assert(
      fc.property(orderStatusArbitrary, orderStatusArbitrary, (fromStatus, toStatus) => {
        const order = buildOrder(fromStatus);

        if (canTransition(fromStatus, toStatus)) {
          const result = order.transitionTo(toStatus);

          expect(result.toProps().status).toBe(toStatus);
          expect(result).not.toBe(order);
          expect(order.toProps().status).toBe(fromStatus);
        } else {
          expect(() => order.transitionTo(toStatus)).toThrow(InvalidTransitionError);
          expect(order.toProps().status).toBe(fromStatus);
        }
      }),
      { numRuns: 100 }
    );
  });
});
