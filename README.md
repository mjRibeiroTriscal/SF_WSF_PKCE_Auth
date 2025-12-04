# SF WSF + PKCE Auth (Salesforce)

Pequena PoC em Node.js para autenticação em orgs Salesforce usando:

- OAuth 2.0 Web Server Flow (WSF)
- PKCE (Proof Key for Code Exchange)
- `client_secret` (confidential client)
- Servidor de callback embutido (sem frontend)

O objetivo é gerar uma URL de autenticação, abrir no navegador, capturar o `code` no callback, trocar por `access_token` e armazenar localmente os ambientes conectados.

---

## Visão geral

Fluxo básico:

1. Você roda um comando CLI (`connect`).
2. O CLI:
   - sobe um servidor HTTP local (`/callback`)
   - gera `code_verifier`, `code_challenge` e `state`
   - imprime a URL de autorização no terminal
3. Você abre a URL no navegador, faz login e aprova o Connected App.
4. O Salesforce redireciona para `http://localhost:1717/callback`.
5. O CLI troca o `code` pelo token e salva a conexão em `data/environments.json`.
6. Você pode listar os ambientes conectados com outro comando (`list`).

---

## Pré-requisitos

- Node.js 18+ (recomendado)
- NPM
- Um **Connected App** configurado em uma org Salesforce, com:
  - OAuth habilitado
  - `Web Server Flow` permitido
  - `client_id` (Consumer Key)
  - `client_secret` (Consumer Secret)
  - Callback URL: `http://localhost:1717/callback`
  - Escopo mínimo: `Access and manage your data (api)`

---

## Instalação

```bash
git clone https://github.com/mjRibeiroTriscal/SF_WSF_PKCE_Auth.git
cd SF_WSF_PKCE_Auth
npm install
