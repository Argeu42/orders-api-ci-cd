# Requirements Document

## Introduction

A Orders API é um projeto educacional que implementa um backend de gerenciamento de pedidos (Orders) usando Node.js, TypeScript, o driver oficial do MongoDB (sem ORM/ODM), princípios básicos de Domain-Driven Design (DDD), testes com Jest, e infraestrutura serverless na AWS (Lambda, API Gateway, SAM) com um pipeline de CI/CD baseado em GitHub, CodeConnections, CodePipeline e CodeBuild.

O objetivo principal do projeto é o aprendizado prático e a preparação para entrevistas técnicas. O usuário tem experiência prévia com AWS e com bancos relacionais/DynamoDB, mas pouca experiência com Node.js, TypeScript, MongoDB, DDD e as ferramentas de CI/CD envolvidas. Por isso, o processo de construção deve ser conduzido em etapas pequenas e sequenciais, cada uma acompanhada de explicações conceituais sobre as tecnologias e decisões de design envolvidas.

O domínio do sistema é único: Order (Pedido), contendo itens embutidos (Item), com cálculo de valor total calculado pelo backend e uma máquina de estados simples de status. Não fazem parte do escopo: autenticação, pagamentos, estoque, múltiplos domínios/bounded contexts, CQRS, Event Sourcing, mensageria assíncrona (SQS/SNS/EventBridge), containers em produção (Docker/ECS/Kubernetes), Terraform/CDK e frontend.

## Glossary

- **Order_API**: O sistema backend completo da Orders API, incluindo domínio, aplicação, infraestrutura e handlers HTTP.
- **Order**: Entidade de domínio (Aggregate Root) que representa um pedido, com atributos id, customerId, items, status, total e createdAt.
- **Item**: Objeto de valor embutido em Order, com atributos productId, quantity e unitPrice.
- **Order_Status**: Enumeração dos estados possíveis de um Order: PENDING, CONFIRMED, SHIPPED, CANCELED.
- **Order_Repository**: Interface de domínio que define as operações de persistência de Order, sem dependência de tecnologia de banco de dados.
- **Mongo_Order_Repository**: Implementação de infraestrutura de Order_Repository que utiliza o driver oficial do MongoDB.
- **Order_Handler**: Função AWS Lambda responsável por processar requisições HTTP recebidas via API Gateway e invocar os casos de uso da aplicação.
- **Orders_Collection**: Collection única do MongoDB Atlas denominada "orders", onde documentos de Order são armazenados com Item embutido.
- **CI_CD_Pipeline**: O pipeline de integração e entrega contínua composto por CodePipeline e CodeBuild, acionado a partir do repositório GitHub via CodeConnections.
- **Secrets_Manager**: O serviço AWS Secrets Manager, usado para armazenar a string de conexão (URI) do MongoDB Atlas.
- **Deploy_DEV**: O ambiente único de destino do deploy automatizado, provisionado via AWS SAM.

## Requirements

### Requisito 1 — Natureza educacional do processo

**User Story:** Como usuário com pouca experiência em Node.js, TypeScript, MongoDB, DDD e nas ferramentas de CI/CD da AWS, eu quero que o projeto seja construído em etapas pequenas e explicadas, para que eu compreenda cada conceito novo antes de avançar para a próxima etapa.

#### Acceptance Criteria

1. THE Order_API SHALL ser construída em etapas sequenciais, sendo apresentada exatamente uma etapa ativa por vez ao usuário.
2. WHEN uma etapa introduzir uma tecnologia, biblioteca ou conceito ainda não utilizado no projeto, THE Order_API SHALL apresentar uma explicação conceitual contendo ao menos o propósito do elemento e o motivo de seu uso, antes de qualquer implementação correspondente.
3. WHEN uma decisão de design apresentar mais de uma abordagem viável, THE Order_API SHALL apresentar ao menos uma vantagem e uma desvantagem de cada abordagem considerada, e não SHALL prosseguir com a implementação de nenhuma abordagem até que essa apresentação de trade-offs tenha ocorrido.
4. THE Order_API SHALL dividir cada uma das 10 etapas sugeridas (setup, domínio, testes unitários, MongoDB/Repository, handlers HTTP, execução local, SAM, deploy manual, CloudWatch, CI/CD) em tarefas menores, com 2 a 4 tarefas por etapa.
5. WHEN o usuário confirmar explicitamente a compreensão da explicação de uma etapa, THE Order_API SHALL apresentar a etapa seguinte.
6. WHEN o usuário fizer uma escolha explícita entre abordagens de design apresentadas conforme o Critério 3, THE Order_API SHALL prosseguir com a implementação da abordagem escolhida pelo usuário.
7. IF o usuário ainda não tiver feito uma escolha explícita entre as abordagens apresentadas conforme o Critério 3, THEN THE Order_API SHALL NOT prosseguir com a implementação de nenhuma das abordagens.

### Requisito 2 — Entidade Order e cálculo de total

**User Story:** Como desenvolvedor estudando DDD, eu quero que a entidade Order encapsule suas próprias regras de criação e cálculo de total, para que a lógica de negócio fique isolada da infraestrutura.

#### Acceptance Criteria

1. THE Order SHALL possuir os atributos id, customerId, items, status, total e createdAt.
2. THE Item SHALL possuir os atributos productId, quantity e unitPrice.
3. WHEN um Order for criado a partir de uma lista de Item, THE Order SHALL calcular o atributo total como a soma dos produtos de quantity por unitPrice de cada Item, arredondada para duas casas decimais.
4. IF um Order for criado sem customerId ou com customerId vazio, THEN THE Order SHALL rejeitar a criação, não criar a instância do Order, e retornar um erro de validação.
5. IF um Order for criado sem nenhum Item, THEN THE Order SHALL rejeitar a criação, não criar a instância do Order, e retornar um erro de validação.
6. IF um Item de um Order tiver productId ausente ou vazio, THEN THE Order SHALL rejeitar a criação, não criar a instância do Order, e retornar um erro de validação.
7. IF um Item de um Order tiver quantity que não seja um número inteiro positivo, THEN THE Order SHALL rejeitar a criação, não criar a instância do Order, e retornar um erro de validação.
8. IF um Item de um Order tiver unitPrice que não seja um número finito maior ou igual a zero, THEN THE Order SHALL rejeitar a criação, não criar a instância do Order, e retornar um erro de validação.
9. WHEN um Order for criado com sucesso, THE Order SHALL atribuir o status inicial PENDING e o atributo createdAt com a data e hora de criação.

### Requisito 3 — Transições de status do Order

**User Story:** Como desenvolvedor estudando modelagem de máquina de estados, eu quero que o Order valide suas próprias transições de status, para que estados inválidos nunca sejam persistidos.

#### Acceptance Criteria

1. THE Order_Status SHALL ser um dos seguintes valores: PENDING, CONFIRMED, SHIPPED, CANCELED.
2. WHEN um Order com status PENDING receber uma solicitação de transição de status para CONFIRMED, THE Order SHALL atualizar seu status para CONFIRMED.
3. WHEN um Order com status PENDING receber uma solicitação de transição de status para CANCELED, THE Order SHALL atualizar seu status para CANCELED.
4. WHEN um Order com status CONFIRMED receber uma solicitação de transição de status para SHIPPED, THE Order SHALL atualizar seu status para SHIPPED.
5. IF um Order com status SHIPPED receber qualquer solicitação de transição de status, THEN THE Order SHALL rejeitar a transição, manter seu status atual inalterado, e retornar um erro indicando que o status é terminal.
6. IF um Order com status CANCELED receber qualquer solicitação de transição de status, THEN THE Order SHALL rejeitar a transição, manter seu status atual inalterado, e retornar um erro indicando que o status é terminal.
7. IF uma solicitação de transição de status não corresponder a nenhuma das transições válidas definidas nos Critérios 2, 3 e 4 para o status atual do Order — incluindo uma solicitação para o mesmo status atual do Order — THEN THE Order SHALL rejeitar a transição, manter seu status atual inalterado, e retornar um erro de transição inválida.

### Requisito 4 — Endpoint de criação de pedido (POST /orders)

**User Story:** Como cliente da API, eu quero criar um novo pedido enviando os dados do cliente e os itens, para que o sistema calcule o total e registre o pedido.

#### Acceptance Criteria

1. WHEN o Order_Handler receber uma requisição POST em /orders cujo corpo atenda às regras de criação do Requisito 2, com customerId como string não vazia, THE Order_Handler SHALL criar um novo Order, persisti-lo na Orders_Collection e retornar o Order criado com status HTTP 201.
2. IF a requisição POST em /orders tiver corpo ausente ou malformado, ou não contiver customerId, ou contiver customerId vazio ou de tipo diferente de string, ou contiver uma lista ausente ou vazia de items, THEN THE Order_Handler SHALL retornar um erro com status HTTP 400 e uma mensagem descrevendo o campo inválido, sem persistir nenhum Order.
3. IF a requisição POST em /orders contiver um item com productId ausente ou vazio, ou com quantity ou unitPrice inválidos conforme o Requisito 2, THEN THE Order_Handler SHALL retornar um erro com status HTTP 400 e uma mensagem descrevendo o campo inválido, sem persistir nenhum Order.
4. IF a persistência do Order na Orders_Collection falhar por indisponibilidade do MongoDB, THEN THE Order_Handler SHALL retornar um erro com status HTTP 500, sem retornar o Order criado.
5. WHEN o Order_Handler processar uma requisição POST em /orders, THE Order_Handler SHALL registrar exatamente duas mensagens de log: uma no início do processamento e outra na conclusão, incluindo o id do Order criado na mensagem de conclusão quando aplicável.

### Requisito 5 — Endpoint de consulta de pedido por id (GET /orders/{id})

**User Story:** Como cliente da API, eu quero consultar um pedido específico pelo seu identificador, para que eu possa visualizar seus detalhes atuais.

#### Acceptance Criteria

1. WHEN o Order_Handler receber uma requisição GET em /orders/{id} com um id existente na Orders_Collection, THE Order_Handler SHALL retornar com status HTTP 200 o Order correspondente contendo todos os seus atributos (id, customerId, items, status, total e createdAt), conforme definidos no Requisito 2.
2. IF o Order_Handler receber uma requisição GET em /orders/{id} com um id em formato válido que não corresponda a nenhum Order armazenado na Orders_Collection, THEN THE Order_Handler SHALL retornar um erro com status HTTP 404 e uma mensagem indicando que o Order não foi encontrado.
3. IF o Order_Handler receber uma requisição GET em /orders/{id} em que o path parameter id estiver vazio ou não corresponder ao formato de identificador utilizado pela Orders_Collection, THEN THE Order_Handler SHALL retornar um erro com status HTTP 400 e uma mensagem indicando que o identificador informado é inválido.

### Requisito 6 — Endpoint de listagem de pedidos (GET /orders)

**User Story:** Como cliente da API, eu quero listar pedidos filtrando por cliente e/ou status, para que eu possa localizar pedidos específicos sem conhecer seu id.

#### Acceptance Criteria

1. WHEN o Order_Handler receber uma requisição GET em /orders sem parâmetros de filtro, THE Order_Handler SHALL retornar a lista de todos os Order armazenados na Orders_Collection com status HTTP 200.
2. IF o parâmetro de consulta customerId for informado na requisição GET em /orders, THEN THE Order_Handler SHALL retornar apenas os Order cujo customerId corresponda exatamente (sensível a caixa) ao valor informado.
3. IF o parâmetro de consulta status for informado na requisição GET em /orders com um dos valores definidos no Requisito 3.1, THEN THE Order_Handler SHALL retornar apenas os Order cujo status corresponda exatamente ao valor informado.
4. IF os parâmetros de consulta customerId e status forem informados simultaneamente na requisição GET em /orders, THEN THE Order_Handler SHALL retornar apenas os Order que satisfaçam ambos os filtros.
5. IF o parâmetro de consulta status informado na requisição GET em /orders não corresponder a um dos valores definidos no Requisito 3.1, THEN THE Order_Handler SHALL retornar um erro com status HTTP 400.
6. IF nenhum Order satisfizer os filtros informados, ou a Orders_Collection estiver vazia, THEN THE Order_Handler SHALL retornar uma lista vazia com status HTTP 200.
7. THE Order_Handler SHALL retornar os Order da requisição GET em /orders ordenados por createdAt em ordem crescente.

### Requisito 7 — Endpoint de atualização de status (PATCH /orders/{id}/status)

**User Story:** Como cliente da API, eu quero atualizar o status de um pedido existente, para que o ciclo de vida do pedido avance conforme as regras de negócio.

#### Acceptance Criteria

1. WHEN o Order_Handler receber uma requisição PATCH em /orders/{id}/status para um id existente na Orders_Collection, com um novo status que represente uma transição válida conforme o Requisito 3 para o status atual do Order identificado, THE Order_Handler SHALL persistir o novo status na Orders_Collection e retornar o Order atualizado com status HTTP 200.
2. IF o Order_Handler receber uma requisição PATCH em /orders/{id}/status para um id que não exista na Orders_Collection, THEN THE Order_Handler SHALL retornar um erro com status HTTP 404, independentemente do conteúdo do corpo da requisição.
3. IF o Order_Handler receber uma requisição PATCH em /orders/{id}/status para um id existente, com o campo de status ausente, com um valor que não corresponda a nenhum Order_Status definido no Requisito 3.1, ou com uma transição inválida conforme o Requisito 3, THEN THE Order_Handler SHALL retornar um erro com status HTTP 400 e não modificar o Order persistido.

### Requisito 8 — Endpoint de estatísticas (GET /orders/stats)

**User Story:** Como cliente da API, eu quero obter um resumo agregado dos pedidos, para que eu possa acompanhar a quantidade de pedidos por status e o valor total movimentado.

#### Acceptance Criteria

1. WHEN o Order_Handler receber uma requisição GET em /orders/stats e a Orders_Collection contiver pelo menos um Order, THE Order_Handler SHALL retornar, para cada Order_Status com pelo menos um Order associado, a contagem de Order daquele status e a soma do atributo total dos Order daquele status, com a mesma precisão numérica utilizada no cálculo do atributo total definido no Requisito 2.3, com status HTTP 200.
2. IF o Order_Handler receber uma requisição GET em /orders/stats e a Orders_Collection não contiver nenhum Order, THEN THE Order_Handler SHALL retornar uma lista vazia de estatísticas com status HTTP 200.
3. THE Order_Handler SHALL calcular o resultado de /orders/stats utilizando um pipeline de agregação executado pelo MongoDB, sem carregar todos os documentos da Orders_Collection para a aplicação antes de agregar.

### Requisito 9 — Modelagem de dados no MongoDB

**User Story:** Como desenvolvedor estudando MongoDB, eu quero uma modelagem de documento único com itens embutidos e índices relevantes, para que as consultas mais comuns da API sejam eficientes.

#### Acceptance Criteria

1. THE Mongo_Order_Repository SHALL persistir cada Order como um único documento na Orders_Collection, com os Item embutidos como um array dentro do documento e com o atributo id do Order utilizado como identificador único desse documento, de forma que não existam dois documentos na Orders_Collection com o mesmo valor de id.
2. THE Orders_Collection SHALL possuir um índice sobre o campo customerId para suportar consultas filtradas por cliente.
3. THE Orders_Collection SHALL possuir um índice sobre o campo status para suportar consultas filtradas por status.
4. THE Mongo_Order_Repository SHALL utilizar exclusivamente o driver oficial do MongoDB para Node.js, sem uso de bibliotecas ORM ou ODM.
5. THE Orders_Collection SHALL possuir um índice composto sobre os campos customerId e status para suportar consultas que filtrem simultaneamente por ambos os campos, conforme previsto no Requisito 6.4.

### Requisito 10 — Estrutura DDD básica e separação de camadas

**User Story:** Como desenvolvedor estudando DDD, eu quero que o domínio Order fique isolado de detalhes de infraestrutura, para que as regras de negócio possam ser testadas e evoluídas independentemente do MongoDB.

#### Acceptance Criteria

1. THE Order_API SHALL organizar o código-fonte nos diretórios src/domain, src/application, src/infrastructure e src/handlers.
2. THE Order SHALL ser implementado em src/domain como Entity e Aggregate Root, sem importar código de src/infrastructure nem qualquer biblioteca de acesso a banco de dados, incluindo o driver do MongoDB.
3. THE Order_Repository SHALL ser definido em src/domain como uma interface, sem dependência de bibliotecas específicas de banco de dados.
4. THE Mongo_Order_Repository SHALL ser implementado em src/infrastructure, implementando a interface Order_Repository definida em src/domain.
5. THE Order_API SHALL implementar os casos de uso da aplicação (criar pedido, consultar pedido, listar pedidos, atualizar status, obter estatísticas) em src/application, dependendo apenas da interface Order_Repository e das entidades definidas em src/domain, sem importar código de src/infrastructure nem qualquer biblioteca de acesso a banco de dados.
6. THE Order_Handler SHALL invocar exclusivamente os casos de uso implementados em src/application para executar qualquer regra de negócio relacionada a Order, sem duplicar em src/handlers a lógica de cálculo de total, de validação de criação ou de transição de status já definida em src/domain.

### Requisito 11 — Testes unitários

**User Story:** Como desenvolvedor estudando Jest, eu quero testes unitários para as regras de domínio e para os casos de uso, para que eu tenha confiança na correção da lógica de negócio sem depender de um banco de dados real.

#### Acceptance Criteria

1. THE Order_API SHALL incluir testes unitários com Jest que verifiquem o cálculo do total de um Order tanto para um único Item quanto para múltiplos Item.
2. THE Order_API SHALL incluir testes unitários com Jest que verifiquem a rejeição da criação de um Order para cada um dos cenários inválidos definidos no Requisito 2 (customerId ausente/vazio, lista de items ausente/vazia, productId ausente/vazio, quantity inválida e unitPrice inválido).
3. THE Order_API SHALL incluir testes unitários com Jest que verifiquem cada transição de status válida definida no Requisito 3 (Critérios 2, 3 e 4).
4. THE Order_API SHALL incluir testes unitários com Jest que verifiquem a rejeição de transições a partir de status terminais (SHIPPED e CANCELED) e a rejeição de transições inválidas não terminais definidas no Requisito 3, incluindo a verificação de que o status do Order permanece inalterado após a rejeição.
5. THE Order_API SHALL incluir testes unitários com Jest para cada um dos casos de uso da aplicação definidos no Requisito 10.5 (criar pedido, consultar pedido, listar pedidos, atualizar status e obter estatísticas), cobrindo ao menos um cenário de sucesso e um cenário de erro por caso de uso, utilizando uma implementação em memória (Fake) de Order_Repository, sem conexão com o MongoDB.

### Requisito 12 — Testes de integração

**User Story:** Como desenvolvedor estudando testes de integração com MongoDB, eu quero validar o Mongo_Order_Repository contra um banco de dados real, para que eu confirme que as consultas e agregações funcionam como esperado.

#### Acceptance Criteria

1. THE Order_API SHALL incluir testes de integração com Jest que executem, contra um banco de dados MongoDB de teste, as operações do Mongo_Order_Repository (insertOne, findOne, find com filtros, updateOne) e o pipeline de agregação definido no Requisito 8.
2. THE Order_API SHALL utilizar, para os testes de integração, um banco de dados MongoDB de teste dedicado e distinto da Orders_Collection utilizada em produção.
3. THE Order_API SHALL manter os testes de integração em um conjunto de execução separado, executável por meio de um comando distinto do comando de testes unitários.
4. WHEN uma execução dos testes de integração for concluída, THE Order_API SHALL limpar os dados criados no banco de dados de teste, de forma que execuções repetidas produzam resultados determinísticos.
5. THE Order_API SHALL garantir que a string de conexão do banco de dados MongoDB de teste não seja incluída em arquivos versionados no repositório Git, conforme o padrão definido no Requisito 15.
6. THE CI_CD_Pipeline SHALL executar apenas os testes unitários durante a etapa inicial de build automatizado, sem incluir os testes de integração.

### Requisito 13 — Configuração inicial do MongoDB Atlas

**User Story:** Como usuário sem conta no MongoDB Atlas, eu quero orientação passo a passo para criar a conta, o cluster e o banco de dados, para que eu tenha um MongoDB gerenciado disponível antes de implementar o Mongo_Order_Repository.

#### Acceptance Criteria

1. THE Order_API SHALL documentar os passos de criação de uma conta no MongoDB Atlas.
2. THE Order_API SHALL documentar os passos de criação de um cluster gratuito (tier M0) no MongoDB Atlas.
3. THE Order_API SHALL documentar os passos de criação de um banco de dados dentro do cluster, de um usuário de banco de dados com permissão restrita a leitura e escrita nesse banco, e da liberação de acesso de rede a partir de qualquer endereço IP, necessária devido ao endereço IP variável das funções Lambda.
4. THE Order_API SHALL documentar a obtenção da string de conexão (URI) do cluster criado, sem registrar essa URI, o usuário ou a senha do banco de dados em código-fonte versionado.

### Requisito 14 — Infraestrutura serverless via AWS SAM

**User Story:** Como usuário com experiência prévia em AWS, eu quero provisionar a API usando AWS SAM, para que a infraestrutura de API Gateway e Lambda seja definida como código e reproduzível.

#### Acceptance Criteria

1. THE Order_API SHALL definir, em um template AWS SAM, a infraestrutura de API Gateway HTTP API com uma rota para cada um dos endpoints definidos nos Requisitos 4, 5, 6, 7 e 8, cada uma associada a uma função Order_Handler.
2. THE Order_API SHALL configurar cada Order_Handler no template AWS SAM com o runtime nodejs22.x.
3. WHEN o comando de validação do AWS SAM for executado sobre o template, THE Order_API SHALL passar a validação sem erros antes de qualquer build ou deploy.
4. WHEN o comando de execução local do AWS SAM for utilizado, THE Order_API SHALL permitir a chamada de todos os endpoints definidos nos Requisitos 4, 5, 6, 7 e 8 sem necessidade de deploy na AWS.
5. THE Order_API SHALL definir, para cada Order_Handler, uma IAM Role restrita às permissões de leitura do secret no Secrets_Manager (Requisito 15) e de escrita de logs no CloudWatch (Requisito 16), sem permissões adicionais nem uso de wildcards.

### Requisito 15 — Proteção da string de conexão do MongoDB

**User Story:** Como usuário preocupado com segurança de credenciais, eu quero que a URI do MongoDB Atlas fique fora do código-fonte, para que credenciais sensíveis não sejam expostas no repositório Git.

#### Acceptance Criteria

1. THE Order_API SHALL armazenar a URI de conexão do MongoDB Atlas no Secrets_Manager.
2. WHEN um Order_Handler necessitar se conectar ao MongoDB, THE Order_Handler SHALL obter a URI de conexão a partir do Secrets_Manager em tempo de execução.
3. THE Order_API SHALL garantir que nenhuma credencial de acesso à AWS ou ao MongoDB Atlas seja incluída em arquivos versionados no repositório Git, incluindo arquivos de configuração de ambiente utilizados localmente (por exemplo, .env).
4. IF a obtenção da URI de conexão a partir do Secrets_Manager falhar, THEN THE Order_Handler SHALL registrar um log da falha sem incluir a credencial na mensagem, e retornar um erro ao chamador sem tentar conectar ao MongoDB.

### Requisito 16 — Logging estruturado via CloudWatch

**User Story:** Como desenvolvedor estudando observabilidade básica, eu quero registrar logs relevantes em cada handler, para que eu possa acompanhar a execução das requisições no CloudWatch Logs.

#### Acceptance Criteria

1. WHEN qualquer Order_Handler iniciar o processamento de uma requisição, THE Order_Handler SHALL registrar uma mensagem de log indicando o início da operação, incluindo o método HTTP e o caminho do recurso da requisição.
2. WHEN qualquer Order_Handler concluir com sucesso o processamento de uma requisição referente a um Order específico (Requisitos 4, 5, 6 e 7), THE Order_Handler SHALL registrar uma mensagem de log indicando a conclusão da operação e o identificador do Order envolvido.
3. IF qualquer Order_Handler encontrar um erro durante o processamento de uma requisição, THEN THE Order_Handler SHALL registrar uma mensagem de log descrevendo o tipo do erro e o status HTTP retornado, conforme definido nos Requisitos 4 a 7, antes de retornar a resposta de erro.
4. THE Order_API SHALL enviar os logs de cada Order_Handler para o CloudWatch Logs por meio da integração padrão do AWS Lambda.
5. IF o registro de uma mensagem de log falhar, THEN THE Order_Handler SHALL continuar o processamento da requisição e retornar a resposta correspondente normalmente, sem interromper a resposta ao chamador por causa da falha de log.

### Requisito 17 — Configuração do repositório GitHub e das conexões AWS

**User Story:** Como usuário sem repositório existente, eu quero criar o repositório no GitHub e conectá-lo à AWS, para que o pipeline de CI/CD tenha uma fonte de código integrada.

#### Acceptance Criteria

1. THE Order_API SHALL documentar a criação de um novo repositório privado no GitHub, com um branch main como branch padrão e monitorado, para hospedar o código-fonte do projeto.
2. THE Order_API SHALL documentar a criação de uma CodeConnections apontando para o repositório GitHub criado, incluindo a etapa de autorização manual no GitHub necessária para que o status da conexão mude de pendente para disponível.
3. IF a etapa de autorização manual da CodeConnections não for concluída, THEN THE CI_CD_Pipeline SHALL permanecer incapaz de acessar o repositório GitHub, e o Order_API SHALL documentar essa condição como bloqueadora da configuração do pipeline.

### Requisito 18 — Pipeline de CI/CD com gate de qualidade antes do deploy

**User Story:** Como usuário estudando entrega contínua na AWS, eu quero um pipeline que valide a qualidade do código antes de implantar no ambiente de desenvolvimento, para que apenas código aprovado seja publicado.

#### Acceptance Criteria

1. WHEN uma alteração for enviada ao branch main do repositório GitHub monitorado pela CodeConnections (Requisito 17), THE CI_CD_Pipeline SHALL iniciar automaticamente uma execução.
2. THE CI_CD_Pipeline SHALL executar, em uma etapa de CodeBuild, nesta ordem: a instalação de dependências, a verificação de lint, a verificação de tipos e os testes unitários do Order_API.
3. IF a instalação de dependências, a etapa de lint, a verificação de tipos ou os testes unitários falharem durante a execução do CodeBuild, THEN THE CI_CD_Pipeline SHALL interromper a execução, sinalizar a execução como falha, e não prosseguir para o deploy.
4. WHEN a etapa de CodeBuild definida no Critério 2 for concluída com sucesso, THE CI_CD_Pipeline SHALL executar a validação, o build e o deploy do template AWS SAM diretamente no Deploy_DEV.
5. IF a validação, o build ou o deploy do template AWS SAM falhar, THEN THE CI_CD_Pipeline SHALL interromper a execução, sinalizar a execução como falha, e preservar no Deploy_DEV o estado da última versão implantada com sucesso.
6. THE CI_CD_Pipeline SHALL direcionar todo deploy automatizado exclusivamente ao Deploy_DEV, sem etapas de aprovação manual ou ambientes adicionais de staging ou produção.
