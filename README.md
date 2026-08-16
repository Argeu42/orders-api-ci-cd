# Orders API

Projeto educacional de uma API de gerenciamento de pedidos, construída com Node.js, TypeScript, MongoDB (driver oficial, sem ORM/ODM), princípios básicos de DDD, testes com Jest, e infraestrutura serverless na AWS (Lambda, API Gateway, SAM) com pipeline de CI/CD (GitHub, CodeConnections, CodePipeline, CodeBuild).

## Arquitetura

```
Cliente HTTP -> API Gateway (HTTP API) -> Lambda -> Use Case -> Order (domínio) -> OrderRepository -> MongoOrderRepository -> MongoDB Atlas
```

Estrutura de código:

```
src/
  domain/         # Order, Item, OrderStatus, OrderRepository (interface), erros de domínio
  application/    # Casos de uso (CreateOrder, GetOrderById, ListOrders, UpdateOrderStatus, GetOrderStats)
  infrastructure/ # MongoOrderRepository, conexão MongoDB, Secrets Manager, logging
  handlers/       # Um handler Lambda por endpoint HTTP
```

Detalhes de design, contratos de API, modelagem de dados e decisões de arquitetura estão documentados em `.kiro/specs/orders-api/design.md`.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | `/orders` | Cria um pedido |
| GET | `/orders/{id}` | Consulta um pedido por id |
| GET | `/orders` | Lista pedidos (filtros opcionais `customerId`, `status`) |
| PATCH | `/orders/{id}/status` | Atualiza o status de um pedido |
| GET | `/orders/stats` | Estatísticas agregadas por status |

## Desenvolvimento local

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requer MongoDB de teste configurado via .env
```

Execução local da API via AWS SAM (requer Docker e SAM CLI):

```bash
sam build
sam local start-api --env-vars env.local.json
```

## Deploy

```bash
sam build
sam deploy --stack-name orders-api --resolve-s3 --capabilities CAPABILITY_IAM \
  --parameter-overrides ParameterKey=MongoDbSecretName,ParameterValue=<nome-do-secret> ParameterKey=MongoDbSecretArn,ParameterValue=<arn-do-secret>
```

O deploy automatizado é feito via CI/CD (CodePipeline + CodeBuild), definido em `buildspec.yml`, disparado a cada push no branch `main`.
