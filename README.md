# SF WSF + PKCE Auth (Salesforce)

Pequena PoC em Node.js para autenticação em orgs Salesforce usando:

-   OAuth 2.0 Web Server Flow (WSF)
-   PKCE (Proof Key for Code Exchange)
-   `client_secret` (confidential client)
-   Servidor de callback embutido (sem frontend)

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

-   Node.js 18+ (recomendado)
-   NPM
-   Um **Connected App** configurado em uma org Salesforce, com:
    -   OAuth habilitado
    -   `Web Server Flow` permitido
    -   `client_id` (Consumer Key)
    -   `client_secret` (Consumer Secret)
    -   Callback URL: `http://localhost:1717/callback`
    -   Escopo mínimo: `Access and manage your data (api)`

---

## Instalação

```bash
git clone https://github.com/mjRibeiroTriscal/SF_WSF_PKCE_Auth.git
cd SF_WSF_PKCE_Auth
npm install
```

---

## Configuração (.env)

```env
SF_CLIENT_ID=SEU_CONSUMER_KEY
SF_CLIENT_SECRET=SEU_CONSUMER_SECRET
SF_LOGIN_URL=https://login.salesforce.com
SF_REDIRECT_URI=http://localhost:1717/callback
SF_SCOPES=api
SF_CALLBACK_PORT=1717
```

---

Notas:

-   Use https://login.salesforce.com para produção / Developer org.
-   Use https://test.salesforce.com ou o My Domain da sandbox, se o Connected App estiver em sandbox.
-   Ajuste a porta/URL se quiser mudar o callback.

---

## Scripts principais

### Conectar uma org

Alias padrão: `org`

```bash
npm run connect:org
```

O que acontece:

1. Sobe o callback em `<HOST>:<PORT>/callback`.
2. Imprime uma URL semelhante a:

```bash
https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=...&redirect_uri=http%3A%2F%2Flocalhost%3A1717%2Fcallback&scope=api&code_challenge=...&code_challenge_method=S256&state=...
```

3. Você abre essa URL no navegador, faz login e aprova o app.
4. Se tudo der certo, verá uma página de sucesso informando que já pode fechar a janela.
5. Os dados do ambiente (instance_url, org_id, tokens, etc.) são salvos em:

```text
/data/environments.json
```

Se você rodar novamente o `connect` com o mesmo alias, a conexão é sobrescrita (sempre prevalece a mais recente).

> Dica: você pode criar scripts adicionais no `package.json` para outros aliases, por exemplo:

```json
"scripts": {
  "connect:org": "node src/auth-cli.js connect org",
  "connect:uat3": "node src/auth-cli.js connect uat3",
  "connect:prod": "node src/auth-cli.js connect prod",
  "list:envs": "node src/auth-cli.js list"
}
```
