# Notas e Detalhes do Backend (Node.js)

Este documento detalha aspectos específicos do backend do projeto REVALIDAFLOW, desenvolvido em Node.js e hospedado na Google Cloud Run. Ele aborda a estrutura de pastas, tecnologias, rotas principais, e os desafios de otimização.

## 1. Estrutura de Pastas e Arquivos Principais

O backend segue uma estrutura organizada para facilitar o desenvolvimento e a manutenção:

*   `server.js`: Ponto de entrada principal da aplicação backend.
*   `package.json`: Define as dependências do projeto e scripts.
*   `routes/`: Contém os arquivos que definem as rotas da API.
*   `scripts/`: Scripts auxiliares para diversas tarefas.
*   `docs/`: Documentação do backend.
*   `node_modules/`: Dependências instaladas.
*   `.env`, `.env.example`: Arquivos para variáveis de ambiente.
*   `Dockerfile`: Define o ambiente para a construção da imagem Docker para implantação na Cloud Run.
*   `cloud-run-config.yaml`: Configurações para implantação na Google Cloud Run.
*   `cache.js`: Possível módulo para gerenciamento de cache.
*   `fix-cors-cloud-run.js`: Script para lidar com problemas de CORS na Cloud Run.

## 2. Tecnologias Utilizadas

*   **Node.js:** Ambiente de execução JavaScript no servidor.
*   **Express.js (provável):** Framework web para construção de APIs (inferido pela estrutura de rotas e `server.js`).
*   **WebSockets:** Para comunicação em tempo real durante as simulações.
*   **Google Cloud Run:** Serviço de computação sem servidor para hospedar o backend.
*   **Firebase Admin SDK (provável):** Para interagir com o Firestore e outras funcionalidades do Firebase a partir do backend.

## 3. Rotas Principais (Inferidas)

Com base na estrutura `routes/`, é provável que existam rotas para:

*   **Autenticação/Usuários:** Login, registro, gerenciamento de perfil.
*   **Estações Clínicas:** Obtenção, criação, atualização e exclusão de estações.
*   **Simulações:** Gerenciamento de sessões de simulação, comunicação em tempo real.
*   **Avaliações:** Submissão e recuperação de avaliações de estações.
*   **Uploads:** Gerenciamento de uploads de arquivos (impressos, questões).

## 4. Desafios e Problemas Atuais

*   **Custos Excessivos na Cloud Run:**
    *   **Problema:** O backend está gerando gastos excessivos na Cloud Run.
    *   **Causa Provável:** Alta frequência de requisições, especialmente durante a simulação, onde cada avaliação de 15 campos gera uma requisição.
    *   **Necessidade:** Otimizar o número e o volume das requisições, talvez agrupando avaliações ou usando abordagens mais eficientes para atualização em tempo real.
*   **Otimização de Requisições na Simulação:**
    *   **Problema:** Durante a avaliação do candidato pelo ator/avaliador, cada campo avaliado gera uma requisição, resultando em muitas chamadas ao backend.
    *   **Necessidade:** Implementar estratégias como *debouncing*, *throttling*, envio de dados em lote (batch updates) ou um modelo de dados mais consolidado para a avaliação.
*   **Impressos no Cloud Storage:**
    *   **Problema:** Impressos são carregados no Firebase Storage, mas também estão aparecendo em um bucket na Cloud, indicando uma possível duplicação ou configuração incorreta.
    *   **Necessidade:** Investigar a configuração de upload e armazenamento para evitar redundância e custos desnecessários.

## 5. Próximos Passos

Este documento será atualizado conforme o desenvolvimento do backend avança e novos desafios surgem ou são resolvidos.
