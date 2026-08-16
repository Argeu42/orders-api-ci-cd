# Implementation Plan: Orders API

## Overview

Este plano converte o design da Orders API em uma sequência incremental de tarefas de código: primeiro o domínio (Order, Item, OrderStatus), depois a camada de aplicação (casos de uso com um repositório fake em memória), depois a infraestrutura (MongoDB, Secrets Manager, logging), depois os handlers HTTP (um por endpoint), e por fim os artefatos de infraestrutura como código (template SAM) e o build spec do pipeline de CI/CD. Cada tarefa constrói sobre a anterior; nenhuma tarefa deixa código órfão sem integração com o restante do sistema. Linguagem de implementação: **TypeScript** (Node.js), conforme definido no design document.

## Tasks

- [x] 1. Set up project structure and tooling
  - Create `src/domain`, `src/application`, `src/infrastructure`, `src/handlers`, `tests/unit`, `tests/integration` directories
  - Initialize `package.json` with TypeScript, Jest (+ ts-jest), fast-check, ESLint, `mongodb` driver, `@aws-sdk/client-secrets-manager`, `uuid`, `esbuild`, and AWS SAM CLI as dev dependency reference
  - Configure `tsconfig.json`, `jest.config.js`, and ESLint
  - Add npm scripts `test:unit` (`jest --testPathPattern=tests/unit`) and `test:integration` (`jest --testPathPattern=tests/integration --runInBand`), plus `lint` and `typecheck`
  - _Requirements: 10.1, 12.3_

- [x] 2. Implement Order status state machine
  - [x] 2.1 Implement `OrderStatus` type and `canTransition` function in `src/domain/order-status.ts`
    - Define the four statuses and the valid-transitions map (PENDING→CONFIRMED, PENDING→CANCELED, CONFIRMED→SHIPPED)
    - _Requirements: 3.1_

- [x] 3. Implement Item value object and domain errors
  - [x] 3.1 Implement `Item` interface in `src/domain/item.ts` and `ValidationError`/`InvalidTransitionError` in `src/domain/errors.ts`
    - _Requirements: 10.2_

- [x] 4. Implement Order entity creation and validation
  - [x] 4.1 Implement `Order.create` in `src/domain/order.ts`
    - Validate customerId (non-empty string), non-empty items list, and each item's productId/quantity/unitPrice
    - Calculate `total` as the rounded (2 decimals) sum of `quantity * unitPrice`
    - Assign initial status `PENDING` and `createdAt` on success; throw `ValidationError` on any violation without constructing an instance
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 10.2_

  - [x] 4.2 Write property test for total calculation
    - **Property 1: Cálculo do total na criação**
    - **Validates: Requirements 2.3, 2.9**

  - [x] 4.3 Write property test for invalid customerId rejection
    - **Property 2: Rejeição de customerId inválido**
    - **Validates: Requirements 2.4**

  - [x] 4.4 Write property test for empty items list rejection
    - **Property 3: Rejeição de lista de items vazia**
    - **Validates: Requirements 2.5**

  - [x] 4.5 Write property test for invalid item rejection
    - **Property 4: Rejeição de item inválido**
    - **Validates: Requirements 2.6, 2.7, 2.8**

- [x] 5. Implement Order status transitions
  - [x] 5.1 Implement `Order.transitionTo`, `Order.fromPersistence`, and `Order.toProps` in `src/domain/order.ts`
    - `transitionTo` uses `canTransition`, throws `InvalidTransitionError` on invalid transitions, and returns a new immutable instance on success
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 10.2_

  - [x] 5.2 Write property test for the transition state machine
    - **Property 5: Máquina de estados de transição**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

- [x] 6. Checkpoint - domain layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Define repository interface and in-memory fake
  - [x] 7.1 Define `OrderRepository`, `OrderFilter`, and `OrderStat` in `src/domain/order-repository.ts`
    - _Requirements: 10.3_

  - [x] 7.2 Implement `InMemoryOrderRepository` fake in `tests/unit/fakes/in-memory-order-repository.ts`
    - Implement `save`, `findById`, `find` (with customerId/status filtering, sorted by `createdAt` ascending), `update`, and `getStats` (grouped count + summed total per status) entirely in JS, no MongoDB dependency
    - _Requirements: 11.5_

- [x] 8. Implement CreateOrder and GetOrderById use cases
  - [x] 8.1 Implement `CreateOrder` in `src/application/create-order.ts`
    - Generate a UUID id, call `Order.create`, persist via `repo.save`, return the created Order
    - _Requirements: 10.5, 4.1_

  - [x] 8.2 Write unit tests for `CreateOrder`
    - Cover a success scenario and an error scenario using `InMemoryOrderRepository`
    - _Requirements: 11.5_

  - [x] 8.3 Implement `GetOrderById` in `src/application/get-order-by-id.ts`
    - _Requirements: 10.5, 5.1_

  - [x] 8.4 Write unit tests for `GetOrderById`
    - Cover found and not-found scenarios using `InMemoryOrderRepository`
    - _Requirements: 11.5_

- [x] 9. Implement ListOrders and GetOrderStats use cases
  - [x] 9.1 Implement `ListOrders` in `src/application/list-orders.ts`
    - Delegate filtering/sorting to `repo.find`
    - _Requirements: 10.5, 6.1, 6.2, 6.3, 6.4, 6.6, 6.7_

  - [x] 9.2 Write unit tests for `ListOrders`
    - Cover a success scenario (with filters) and an empty-result scenario using `InMemoryOrderRepository`
    - _Requirements: 11.5_

  - [x] 9.3 Implement `GetOrderStats` in `src/application/get-order-stats.ts`
    - Delegate aggregation to `repo.getStats`
    - _Requirements: 10.5, 8.1, 8.2_

  - [x] 9.4 Write unit tests for `GetOrderStats`
    - Cover a non-empty and an empty-collection scenario using `InMemoryOrderRepository`
    - _Requirements: 11.5_

- [x] 10. Implement UpdateOrderStatus use case
  - [x] 10.1 Implement `UpdateOrderStatus` in `src/application/update-order-status.ts`
    - `findById`; throw an application `NotFoundError` if null; call `order.transitionTo(next)`; persist via `repo.update`; return the updated Order
    - _Requirements: 10.5, 7.1_

  - [x] 10.2 Write unit tests for `UpdateOrderStatus`
    - Cover a valid transition scenario, a not-found scenario, and an invalid-transition scenario using `InMemoryOrderRepository`
    - _Requirements: 11.5_

- [x] 11. Checkpoint - application layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement structured logging helper
  - [x] 12.1 Implement a logging helper in `src/infrastructure/logger.ts`
    - Provide functions to log `handler.start`, `handler.success`, and `handler.error` as JSON via `console.log`/`console.error`
    - Wrap each log call in `try/catch` so a logging failure never propagates
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 13. Implement MongoDB connection and secrets access
  - [x] 13.1 Implement `src/infrastructure/mongo-client.ts`
    - Cache the MongoDB client connection across warm invocations; choose URI source based on `MONGODB_SECRET_NAME` (Secrets Manager) vs `process.env.MONGODB_URI` (local `.env` via `dotenv`)
    - _Requirements: 9.4, 15.2_

  - [x] 13.2 Implement `src/infrastructure/secrets.ts`
    - Fetch the MongoDB URI from Secrets Manager using `@aws-sdk/client-secrets-manager`, cache it in module scope, and on failure log the error without the credential and throw without attempting a MongoDB connection
    - _Requirements: 15.1, 15.4_

- [x] 14. Implement MongoOrderRepository and indexes
  - [x] 14.1 Implement `MongoOrderRepository` in `src/infrastructure/mongo-order-repository.ts`
    - Implement `save` (insertOne, using domain `id` as `_id`), `findById` (findOne), `find` (query built from `OrderFilter`), `update` (updateOne), and `getStats` (`$group`/`$project` aggregation pipeline)
    - _Requirements: 9.1, 9.4, 10.4, 8.3_

  - [x] 14.2 Implement index setup script (`scripts/setup-indexes.ts`, run via `npm run setup:indexes`)
    - Create indexes on `customerId`, on `status`, and the composite `{ customerId: 1, status: 1 }`
    - _Requirements: 9.2, 9.3, 9.5_

  - [x] 14.3 Write integration tests for `MongoOrderRepository`
    - Against a dedicated test MongoDB database: cover `insertOne` (save), `findOne` (findById), `find` with combined filters, `updateOne` (update), and the `getStats` aggregation pipeline
    - Clean up created data after each test run for deterministic re-runs
    - _Requirements: 12.1, 12.2, 12.4_

- [x] 15. Checkpoint - infrastructure layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement create-order handler
  - [x] 16.1 Implement `src/handlers/create-order-handler.ts`
    - Parse the API Gateway event body, log start, call `CreateOrder`, map `ValidationError`→400 and unexpected errors→500, log success/error, return the HTTP response
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.6, 16.1, 16.2, 16.3_

  - [x] 16.2 Write property test for successful creation via handler
    - **Property 6: Criação via handler retorna 201 e persiste**
    - **Validates: Requirements 4.1**

  - [x] 16.3 Write property test for invalid payload rejection
    - **Property 7: Payload inválido em POST /orders é rejeitado sem persistir**
    - **Validates: Requirements 4.2, 4.3**

  - [x] 16.4 Write property test for start/completion logging
    - **Property 8: Handler de criação sempre loga início e conclusão**
    - **Validates: Requirements 4.5, 16.1, 16.2**

  - [x] 16.5 Write unit test for persistence failure
    - Simulate a repository failure and assert the handler returns HTTP 500 without returning a created Order
    - _Requirements: 4.4_

- [x] 17. Implement get-order-by-id handler
  - [x] 17.1 Implement `src/handlers/get-order-by-id-handler.ts`
    - Parse and validate the `id` path parameter, call `GetOrderById`, map null→404 and malformed id→400
    - _Requirements: 5.1, 5.2, 5.3, 10.6, 16.1, 16.2, 16.3_

  - [x] 17.2 Write property test for successful lookup by id
    - **Property 9: Consulta por id existente retorna todos os atributos**
    - **Validates: Requirements 5.1**

  - [x] 17.3 Write property test for lookup with nonexistent id
    - **Property 10: Consulta por id inexistente retorna 404**
    - **Validates: Requirements 5.2**

  - [x] 17.4 Write property test for malformed id
    - **Property 11: Consulta por id malformado retorna 400**
    - **Validates: Requirements 5.3**

- [x] 18. Implement list-orders handler
  - [x] 18.1 Implement `src/handlers/list-orders-handler.ts`
    - Parse optional `customerId`/`status` query params, validate `status` against the enum, call `ListOrders`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 10.6, 16.1, 16.3_

  - [x] 18.2 Write property test for filtered/sorted listing
    - **Property 12: Listagem com filtros retorna o subconjunto correto e ordenado**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.6, 6.7**

  - [x] 18.3 Write property test for invalid status filter
    - **Property 13: Filtro de status inválido retorna 400**
    - **Validates: Requirements 6.5**

- [x] 19. Implement update-order-status handler
  - [x] 19.1 Implement `src/handlers/update-order-status-handler.ts`
    - Parse `id` path param and `status` body field, call `UpdateOrderStatus`, map `NotFoundError`→404 (checked before body validation), `ValidationError`/`InvalidTransitionError`→400
    - _Requirements: 7.1, 7.2, 7.3, 10.6, 16.1, 16.2, 16.3_

  - [x] 19.2 Write property test for valid status update
    - **Property 14: Atualização de status válida persiste e retorna 200**
    - **Validates: Requirements 7.1**

  - [x] 19.3 Write property test for update on nonexistent id
    - **Property 15: Atualização em id inexistente retorna 404 independente do corpo**
    - **Validates: Requirements 7.2**

  - [x] 19.4 Write property test for invalid update on existing id
    - **Property 16: Atualização inválida em id existente retorna 400 sem modificar**
    - **Validates: Requirements 7.3**

- [x] 20. Implement get-order-stats handler
  - [x] 20.1 Implement `src/handlers/get-order-stats-handler.ts`
    - Call `GetOrderStats` and return the aggregated result with HTTP 200
    - _Requirements: 8.1, 8.2, 8.3, 10.6, 16.1, 16.3_

  - [x] 20.2 Write property test for stats aggregation
    - **Property 17: Estatísticas agregam corretamente por status**
    - **Validates: Requirements 8.1, 8.2**

- [x] 21. Verify cross-cutting logging and secret-failure behavior
  - [x] 21.1 Write property test for error logging across handlers
    - **Property 18: Log de erro descreve tipo e status HTTP**
    - **Validates: Requirements 16.3**

  - [x] 21.2 Write unit test for Secrets Manager failure handling
    - Assert the failure is logged without the credential and the handler returns an error without attempting a MongoDB connection
    - _Requirements: 15.4_

  - [x] 21.3 Write unit test for logging failures not interrupting the response
    - Simulate the logger throwing and assert the handler still returns its normal response
    - _Requirements: 16.5_

- [x] 22. Checkpoint - all handler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 23. Define AWS SAM infrastructure template
  - [x] 23.1 Write `template.yaml`
    - Define `AWS::Serverless::HttpApi` and one `AWS::Serverless::Function` per endpoint (POST /orders, GET /orders/{id}, GET /orders, PATCH /orders/{id}/status, GET /orders/stats), runtime `nodejs22.x`, esbuild `BuildMethod` metadata, `MONGODB_SECRET_NAME` environment variable, and an IAM policy per function restricted to `secretsmanager:GetSecretValue` on the specific secret ARN
    - _Requirements: 14.1, 14.2, 14.5_

  - [x] 23.2 Validate the template with `sam validate`
    - _Requirements: 14.3_

- [x] 24. Define CI/CD build specification
  - [x] 24.1 Write `buildspec.yml`
    - Run, in order: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `sam validate`, `sam build`, `sam deploy --no-confirm-changeset --no-fail-on-empty-changeset`
    - _Requirements: 18.2, 18.3, 18.4, 18.5, 18.6_

- [x] 25. Final checkpoint - ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they are not implemented automatically per workflow rules.
- Requirements 1 (processo educacional passo a passo), 13 (configuração do MongoDB Atlas) e 17 (criação do repositório GitHub e da CodeConnections) descrevem processo de condução da conversa e passos manuais em consoles externos (MongoDB Atlas, GitHub, AWS Console) — não são tarefas de código e por isso não aparecem como itens neste plano.
- Property tests use `fast-check`, minimum 100 iterations per property, tagged as **Feature: orders-api, Property {número}: {texto da property}**, per the design's Testing Strategy.
- Checkpoints ensure incremental validation of each layer before moving to the next.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1", "7.1"] },
    { "id": 1, "tasks": ["4.1", "7.2"] },
    { "id": 2, "tasks": ["4.2"] },
    { "id": 3, "tasks": ["4.3"] },
    { "id": 4, "tasks": ["4.4"] },
    { "id": 5, "tasks": ["4.5"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["5.2"] },
    { "id": 8, "tasks": ["8.1", "8.3", "9.1", "9.3", "10.1", "12.1", "13.1", "13.2"] },
    { "id": 9, "tasks": ["8.2", "8.4", "9.2", "9.4", "10.2", "14.1"] },
    { "id": 10, "tasks": ["14.2", "14.3"] },
    { "id": 11, "tasks": ["16.1", "17.1", "18.1", "19.1", "20.1"] },
    { "id": 12, "tasks": ["16.2", "17.2", "18.2", "19.2", "20.2"] },
    { "id": 13, "tasks": ["16.3", "17.3", "18.3", "19.3"] },
    { "id": 14, "tasks": ["16.4", "17.4", "19.4"] },
    { "id": 15, "tasks": ["16.5"] },
    { "id": 16, "tasks": ["21.1", "21.2", "21.3"] },
    { "id": 17, "tasks": ["23.1", "24.1"] },
    { "id": 18, "tasks": ["23.2"] }
  ]
}
```
