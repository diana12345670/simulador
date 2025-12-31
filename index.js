// index.js - Arquivo principal do bot Discord de torneios (Multi-Bot)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const FileStore = require('session-file-store')(session);
const { initDatabase } = require('./utils/database');
const app = express();
const PORT = process.env.PORT || 8080;

// -----------------------------------------------------------------------------
// LOGICA DE BOTS (Configuração)
// -----------------------------------------------------------------------------
const botConfigs = [];
const token1 = process.env.BOT_TOKEN_1 || process.env.BOT_TOKEN;
if (token1) {
    botConfigs.push({
        name: 'Bot 1',
        token: token1,
        applicationId: process.env.APPLICATION_ID_1 || process.env.APPLICATION_ID || null
    });
}
if (process.env.BOT_TOKEN_2) {
    botConfigs.push({
        name: 'Bot 2',
        token: process.env.BOT_TOKEN_2,
        applicationId: process.env.APPLICATION_ID_2 || null
    });
}
if (process.env.BOT_TOKEN_3) {
    botConfigs.push({
        name: 'Bot 3',
        token: process.env.BOT_TOKEN_3,
        applicationId: process.env.APPLICATION_ID_3 || null
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
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        }
    }

    const applicationId = client.botConfig.applicationId || client.user.id;
    const rest = new REST({ version: '10' }).setToken(client.botConfig.token);

    try {
        await rest.put(
            Routes.applicationCommands(applicationId),
            { body: commands }
        );
        console.log(`✅ [${client.botConfig.name}] Comandos registrados.`);
    } catch (error) {
        console.error(`❌ [${client.botConfig.name}] Erro ao registrar comandos:`, error.message);
    }
}

// -----------------------------------------------------------------------------
// CONFIGURAÇÃO EXPRESS E INICIALIZAÇÃO
// -----------------------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', 1);

// Endpoints de Health Check (Railway)
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => res.status(200).send('Bot Online'));

async function start() {
    try {
        console.log('🔄 Inicializando banco de dados...');
        await initDatabase();
        
        app.use(session({
            store: new FileStore({
                path: path.join(__dirname, 'data', 'sessions'),
                logFn: () => {}
            }),
            secret: process.env.SESSION_SECRET || 'simulator-bot-secret-key-2024',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000
            }
        }));

        // Abrir a porta IMEDIATAMENTE antes de tentar o login dos bots
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🌐 Servidor web rodando em 0.0.0.0:${PORT}`);
        });

        // Login dos bots em segundo plano
        clients.forEach(async (client) => {
            try {
                await client.login(client.botConfig.token);
                console.log(`✅ [${client.botConfig.name}] Online.`);
                await registerCommands(client);
            } catch (error) {
                console.error(`❌ [${client.botConfig.name}] Erro login:`, error.message);
            }
        });
        
        if (clients.length === 0) {
            console.warn('⚠️ Nenhum bot configurado (Dashboard ativo)');
        }
        
    } catch (error) {
        console.error('❌ Erro fatal na inicialização:', error);
        // Mesmo com erro, tentamos manter o servidor vivo para evitar loop de restart do Railway
        if (!app.listening) {
            app.listen(PORT, '0.0.0.0');
        }
    }
}

start();

module.exports = { clients };
