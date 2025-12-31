// index.js - Arquivo principal do bot Discord de torneios (Multi-Bot)
require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// 1. INICIALIZAÇÃO IMEDIATA (CRÍTICO PARA RAILWAY)
// ==========================================
// Respondemos aos health checks imediatamente antes de carregar qualquer módulo pesado
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => res.status(200).send('Bot Online'));

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor web rodando em 0.0.0.0:${PORT}`);
});

// ==========================================
// 2. CARREGAMENTO ASSÍNCRONO DE MÓDULOS
// ==========================================
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const FileStore = require('session-file-store')(session);
const { initDatabase } = require('./utils/database');

// Configurações do Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', 1);

// Lógica de Bots
const botConfigs = [];
const token1 = process.env.BOT_TOKEN_1 || process.env.BOT_TOKEN;
if (token1) {
    botConfigs.push({
        name: 'Bot 1',
        token: token1,
        applicationId: process.env.APPLICATION_ID_1 || process.env.APPLICATION_ID || null
    });
}

const clients = [];
function createClient(config) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });
    client.botConfig = config;
    client.commands = new Collection();
    const { loadCommands } = require('./handlers/commandHandler');
    loadCommands(client);
    client.once('clientReady', async () => {
        try {
            const event = require('./events/ready');
            await event.execute(client);
        } catch (error) {
            console.error(`❌ Erro no evento clientReady do ${config.name}:`, error);
        }
    });
    return client;
}

for (const config of botConfigs) {
    clients.push(createClient(config));
}

async function registerCommands(client) {
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    if (!fs.existsSync(commandsPath)) return;
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (command.data) commands.push(command.data.toJSON());
    }
    const rest = new REST({ version: '10' }).setToken(client.botConfig.token);
    try {
        await rest.put(Routes.applicationCommands(client.botConfig.applicationId || client.user.id), { body: commands });
        console.log(`✅ [${client.botConfig.name}] Comandos registrados.`);
    } catch (error) {
        console.error(`❌ [${client.botConfig.name}] Erro comandos:`, error.message);
    }
}

// Inicialização Assíncrona Total
async function start() {
    try {
        // Garantir que a pasta data/sessions existe
        const sessionPath = path.join(__dirname, 'data', 'sessions');
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        await initDatabase();
        
        app.use(session({
            store: new FileStore({ path: sessionPath, logFn: () => {} }),
            secret: process.env.SESSION_SECRET || 'simulator-bot-secret-key-2024',
            resave: false,
            saveUninitialized: false,
            cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
        }));

        // Login dos bots em background para não travar o loop principal
        for (const client of clients) {
            client.login(client.botConfig.token)
                .then(async () => {
                    console.log(`✅ [${client.botConfig.name}] Online.`);
                    await registerCommands(client);
                })
                .catch(error => {
                    console.error(`❌ [${client.botConfig.name}] Login falhou:`, error.message);
                });
        }
    } catch (error) {
        console.error('❌ Erro de inicialização silencioso:', error);
    }
}

// Inicia o processo de fundo
setTimeout(start, 100);

module.exports = { clients };
