require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');


// ----------------------------------------------------
// CONFIGURAÇÃO
// ----------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];          // connect | list
const targetEnv = args[1] || 'org';

const config = {
    loginUrl: (targetEnv == 'org' ? process.env.SF_LOGIN_URL : process.env.SF_SANDBOX_URL) || 'https://login.salesforce.com',
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
    redirectUri: process.env.SF_REDIRECT_URI || 'http://localhost:1717/callback',
    scopes: process.env.SF_SCOPES || 'api',
    callbackPort: Number(process.env.SF_CALLBACK_PORT || 1717)
};

if (!config.clientId) {
    console.error('ERRO: SF_CLIENT_ID não definido no .env');
    process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
const envFile = path.join(dataDir, 'environments.json');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function loadJson(filePath, defaultValue) {
    if (!fs.existsSync(filePath)) return defaultValue;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
    } catch (e) {
        console.error(`Erro ao ler ${filePath}:`, e.message);
        return defaultValue;
    }
}

function saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}


// ----------------------------------------------------
// PKCE (Proof Key for Code Exchange)
// ----------------------------------------------------

function base64URLEncode(buffer) {
    return buffer
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function generateCodeVerifier() {
    return base64URLEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(codeVerifier) {
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    return base64URLEncode(hash);
}

function generateState() {
    return base64URLEncode(crypto.randomBytes(16));
}


// ----------------------------------------------------
// URL DE AUTORIZAÇÃO
// ----------------------------------------------------

function buildAuthorizeUrl({ codeChallenge, state }) {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        prompt: 'login'
    });

    return `${config.loginUrl}/services/oauth2/authorize?${params.toString()}`;
}


// ----------------------------------------------------
// TROCA CODE -> TOKEN
// ----------------------------------------------------

async function exchangeCodeForToken({ code, codeVerifier }) {
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier
    });

    if (config.clientSecret) {
        params.append('client_secret', config.clientSecret);
    }

    const tokenUrl = `${config.loginUrl}/services/oauth2/token`;

    const response = await axios.post(tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data;
}


// ----------------------------------------------------
// LISTAR AMBIENTES
// ----------------------------------------------------

function handleListEnvs() {
    const envs = loadJson(envFile, []);

    if (!envs.length) {
        console.log('Nenhum ambiente conectado ainda.');
        return;
    }

    console.log('Ambientes conectados:');
    console.log('---------------------------------------------');
    envs.forEach((env, index) => {
        console.log(`#${index + 1}`);
        console.log(`  alias        : ${env.alias}`);
        console.log(`  instance_url : ${env.instanceUrl}`);
        console.log(`  org_id       : ${env.orgId || '(não informado)'}`);
        console.log(`  username     : ${env.username || '(não informado)'}`);
        console.log(`  connectedAt  : ${env.connectedAt}`);
        console.log('---------------------------------------------');
    });
}


// ----------------------------------------------------
// CONECTAR (CLI + CALLBACK)
// ----------------------------------------------------

async function handleConnect() {
    console.log('Iniciando conexão com Salesforce...');
    console.log(`Alias do ambiente: ${targetEnv}`);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    const app = express();

    app.get('/callback', async (req, res) => {
        const { code, state: returnedState, error, error_description } = req.query;

        if (error) {
            console.error('Erro retornado pelo Salesforce:', error, error_description);
            return res.status(400).send(`Erro na autenticação: ${error_description || error}`);
        }

        if (!code || !returnedState || returnedState !== state) {
            console.error('Callback inválido (code/state).');
            return res.status(400).send('Callback inválido. Tente novamente.');
        }

        try {
            const tokenResponse = await exchangeCodeForToken({ code, codeVerifier });
            console.log('tokenResponse: ', tokenResponse);

            const envs = loadJson(envFile, []);

            let orgId = null;
            if (tokenResponse.id) {
                const parts = tokenResponse.id.split('/');
                if (parts.length >= 5) orgId = parts[4];
            }

            // monta o objeto do ambiente conectado
            const newEnv = {
                alias: targetEnv,
                instanceUrl: tokenResponse.instance_url,
                orgId,
                username: null, // pode ser preenchido depois via /userinfo
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token || null,
                connectedAt: new Date().toISOString()
            };

            // se já existir um ambiente com o mesmo Id, sobrescreve
            const existingIndex = envs.findIndex((env) => env.orgId === orgId);

            if (existingIndex >= 0) {
                envs[existingIndex] = newEnv;
                console.log(`Ambiente "${orgId} | ${tokenResponse.instance_url}" já existia. Registro atualizado.`);
            } else {
                envs.push(newEnv);
                console.log(`Ambiente "${orgId} | ${tokenResponse.instance_url}" adicionado.`);
            }

            saveJson(envFile, envs);

            console.log('Ambiente conectado e salvo com sucesso.');
            console.log(newEnv);

            res.send(`
  <div style="
      font-family: Arial, sans-serif;
      max-width: 480px;
      margin: 80px auto;
      padding: 32px;
      border: 1px solid #d8dde6;
      border-radius: 8px;
      text-align: center;
      background: #ffffff;
  ">
      <img src="https://login.salesforce.com/img/logo214.svg" 
           alt="Salesforce" 
           style="width: 120px; margin-bottom: 24px;">
      
      <h1 style="font-size: 20px; color: #16325c; margin-bottom: 16px;">
          Conexão realizada com sucesso
      </h1>

      <p style="font-size: 14px; color: #4a4a4a; margin-bottom: 24px;">
          A autenticação foi concluída e você já pode fechar esta janela.
      </p>

      <p style="font-size: 12px; color: #9faab5;">
          Salesforce OAuth Authorization Flow
          </br>
          By Triscal
      </p>
  </div>
`);

            setTimeout(() => {
                server.close(() => process.exit(0));
            }, 500);
        } catch (e) {
            console.error('Erro ao trocar código por token:', e.message);
            res.status(500).send('Erro ao obter token. Veja o log do CLI.');

            setTimeout(() => {
                server.close(() => process.exit(0));
            }, 500);
        }
    });

    const server = app.listen(config.callbackPort, () => {
        const authUrl = buildAuthorizeUrl({ codeChallenge, state });

        console.log(`Callback ouvindo em ${config.redirectUri}`);
        console.log('Abra esta URL em um navegador para conectar a org:');
        console.log('---------------------------------------------');
        console.log(authUrl);
        console.log('---------------------------------------------');
        console.log('Após concluir o login, aguarde esta janela mostrar mensagem de sucesso.');
    });
}


// ----------------------------------------------------
// DISPATCH
// ----------------------------------------------------

(async () => {
    switch (command) {
        case 'connect':
            await handleConnect();
            break;

        case 'list':
            handleListEnvs();
            break;

        case 'help':
            console.log('Uso:');
            console.log('  node src/auth-cli.js connect [aliasEnv]');
            console.log('  node src/auth-cli.js list');
            console.log('  node src/auth-cli.js help');
            console.log('');
            console.log('Exemplos de comandos:');
            console.log('  npm run connect:org');
            console.log('  npm run connect:sandbox');
            console.log('  npm run list:envs');
            console.log('  npm run help');
            process.exit(1);

        default:
            break;
    }
})();