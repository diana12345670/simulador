// index.js - Arquivo principal do bot Discord de torneios (Multi-Bot)
require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const FileStore = require('session-file-store')(session);

// ==========================================
// 1. CONFIGURAÇÃO EXPRESS (ORDEM CRÍTICA)
// ==========================================
const PORT = process.env.PORT || process.env.VCAP_APP_PORT || 8080;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', 1);

// ==========================================
// 2. FUNÇÃO DEPLOY DE COMANDOS (NECESSÁRIA ANTES)
// ==========================================
async function deployCommands() {
    try {
        console.log('🔄 Iniciando deploy automático de comandos...');
        const { REST, Routes } = require('discord.js');
        const fs = require('fs');
        const path = require('path');
        
        const commands = [];
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        console.log(`📦 Encontrados ${commandFiles.length} arquivos de comando`);
        
        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
                console.log(`✅ Comando preparado: ${command.data.name}`);
            }
        }
        
        console.log(`🚀 Registrando ${commands.length} comandos na API do Discord...`);
        
        // Deploy para cada bot
        for (const client of clients) {
            console.log(`🤖 Verificando bot: ${client.botConfig.name}`);
            console.log(`   - Application ID: ${client.botConfig.applicationId}`);
            console.log(`   - Ready: ${client.isReady()}`);
            
            if (client.botConfig.applicationId && client.isReady()) {
                const rest = new REST().setToken(client.botConfig.token);
                try {
                    await rest.put(
                        Routes.applicationCommands(client.botConfig.applicationId),
                        { body: commands }
                    );
                    console.log(`✅ [${client.botConfig.name}] Comandos registrados: ${commands.length}`);
                } catch (error) {
                    console.error(`❌ [${client.botConfig.name}] Erro ao registrar comandos:`, error.message);
                    console.error(`   Status:`, error.status);
                    console.error(`   Stack:`, error.stack);
                }
            } else {
                console.log(`⚠️ [${client.botConfig.name}] Pulando - Application ID ou Ready false`);
            }
        }
    } catch (error) {
        console.error('❌ Erro no deploy de comandos:', error);
        console.error('   Stack:', error.stack);
    }
}

// Endpoint para debug de variáveis de ambiente
app.get('/debug-env', (req, res) => {
    const envVars = {
        BOT_TOKEN_1: process.env.BOT_TOKEN_1 ? '✅ Definido' : '❌ Não definido',
        BOT_TOKEN: process.env.BOT_TOKEN ? '✅ Definido' : '❌ Não definido',
        BOT_TOKEN_2: process.env.BOT_TOKEN_2 ? '✅ Definido' : '❌ Não definido',
        BOT_TOKEN_3: process.env.BOT_TOKEN_3 ? '✅ Definido' : '❌ Não definido',
        BOT_TOKEN_4: process.env.BOT_TOKEN_4 ? '✅ Definido' : '❌ Não definido',
        BOT_TOKEN_5: process.env.BOT_TOKEN_5 ? '✅ Definido' : '❌ Não definido',
        APPLICATION_ID_1: process.env.APPLICATION_ID_1 || '❌ Não definido',
        APPLICATION_ID: process.env.APPLICATION_ID || '❌ Não definido',
        APPLICATION_ID_2: process.env.APPLICATION_ID_2 || '❌ Não definido',
        APPLICATION_ID_3: process.env.APPLICATION_ID_3 || '❌ Não definido',
        APPLICATION_ID_4: process.env.APPLICATION_ID_4 || '❌ Não definido',
        APPLICATION_ID_5: process.env.APPLICATION_ID_5 || '❌ Não definido',
        OWNER_ID: process.env.OWNER_ID || '❌ Não definido',
        OWNER_ID_2: process.env.OWNER_ID_2 || '❌ Não definido'
    };
    
    res.json({
        timestamp: new Date().toISOString(),
        environment: envVars,
        botConfigs: botConfigs.map(config => ({
            name: config.name,
            hasToken: !!config.token,
            applicationId: config.applicationId
        }))
    });
});

// Endpoint para deploy manual de comandos
app.get('/deploy-commands', async (req, res) => {
    try {
        console.log('🚀 Deploy manual de comandos solicitado via HTTP...');
        await deployCommands();
        res.json({ 
            success: true, 
            message: 'Deploy de comandos executado com sucesso!',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erro no deploy manual:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint de Health Check (Prioridade Máxima para Railway)
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ==========================================
// 2. INICIALIZAÇÃO DO SERVIDOR (RAILWAY PRECISA DISSO IMEDIATAMENTE)
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor web rodando em 0.0.0.0:${PORT}`);
});

// ==========================================
// 3. CARREGAMENTO DOS MÓDULOS PESADOS (APÓS O LISTEN)
// ==========================================
const { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } = require('discord.js');
const { initDatabase } = require('./utils/database');

// Lógica de Bots
const botConfigs = [];
console.log('🔍 Verificando variáveis de ambiente:');
console.log(`   BOT_TOKEN_1: ${process.env.BOT_TOKEN_1 ? '✅ Definido' : '❌ Não definido'}`);
console.log(`   BOT_TOKEN: ${process.env.BOT_TOKEN ? '✅ Definido' : '❌ Não definido'}`);
console.log(`   BOT_TOKEN_2: ${process.env.BOT_TOKEN_2 ? '✅ Definido' : '❌ Não definido'}`);
console.log(`   BOT_TOKEN_3: ${process.env.BOT_TOKEN_3 ? '✅ Definido' : '❌ Não definido'}`);
console.log(`   BOT_TOKEN_4: ${process.env.BOT_TOKEN_4 ? '✅ Definido' : '❌ Não definido'}`);
console.log(`   BOT_TOKEN_5: ${process.env.BOT_TOKEN_5 ? '✅ Definido' : '❌ Não definido'}`);
console.log(`   APPLICATION_ID_1: ${process.env.APPLICATION_ID_1 || '❌ Não definido'}`);
console.log(`   APPLICATION_ID: ${process.env.APPLICATION_ID || '❌ Não definido'}`);
console.log(`   APPLICATION_ID_2: ${process.env.APPLICATION_ID_2 || '❌ Não definido'}`);
console.log(`   APPLICATION_ID_3: ${process.env.APPLICATION_ID_3 || '❌ Não definido'}`);
console.log(`   APPLICATION_ID_4: ${process.env.APPLICATION_ID_4 || '❌ Não definido'}`);
console.log(`   APPLICATION_ID_5: ${process.env.APPLICATION_ID_5 || '❌ Não definido'}`);

const token1 = process.env.BOT_TOKEN_1 || process.env.BOT_TOKEN;
if (token1) botConfigs.push({ name: 'Bot 1', token: token1, applicationId: process.env.APPLICATION_ID_1 || process.env.APPLICATION_ID || null });
if (process.env.BOT_TOKEN_2) botConfigs.push({ name: 'Bot 2', token: process.env.BOT_TOKEN_2, applicationId: process.env.APPLICATION_ID_2 || null });
if (process.env.BOT_TOKEN_3) botConfigs.push({ name: 'Bot 3', token: process.env.BOT_TOKEN_3, applicationId: process.env.APPLICATION_ID_3 || null });
if (process.env.BOT_TOKEN_4) botConfigs.push({ name: 'Bot 4', token: process.env.BOT_TOKEN_4, applicationId: process.env.APPLICATION_ID_4 || null });
if (process.env.BOT_TOKEN_5) botConfigs.push({ name: 'Bot 5', token: process.env.BOT_TOKEN_5, applicationId: process.env.APPLICATION_ID_5 || null });

console.log(`📦 Configurações de bots criadas: ${botConfigs.length}`);
botConfigs.forEach((config, index) => {
    console.log(`   Bot ${index + 1}: ${config.name} - Application ID: ${config.applicationId || '❌ NULL'}`);
});

const clients = [];
function createClient(config) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    client.botConfig = config; client.commands = new Collection();
    const { loadCommands } = require('./handlers/commandHandler');
    loadCommands(client);
    
    // Evento para pegar Application ID automaticamente quando o bot ficar online
    client.once('clientReady', async () => {
        if (!client.botConfig.applicationId && client.application) {
            client.botConfig.applicationId = client.application.id;
            console.log(`🆔 [${client.botConfig.name}] Application ID obtido automaticamente: ${client.application.id}`);
        }
    });
    
    // Eventos
    try {
        const interactionHandler = require('./events/interactionCreate');
        client.on('interactionCreate', async (interaction) => {
            try {
                await interactionHandler.execute(interaction);
            } catch (err) {
                console.error('Erro no interactionCreate:', err);
                
                // Tenta responder ao usuário se houve erro
                if (interaction && !interaction.replied && !interaction.deferred) {
                    try {
                        await interaction.reply({
                            content: '❌ Ocorreu um erro ao processar este comando. Tente novamente.',
                            flags: MessageFlags.Ephemeral
                        });
                    } catch (replyErr) {
                        console.error('Erro ao responder sobre o erro:', replyErr);
                    }
                } else if (interaction && interaction.deferred && !interaction.replied) {
                    try {
                        await interaction.editReply({
                            content: '❌ Ocorreu um erro ao processar este comando. Tente novamente.'
                        });
                    } catch (editErr) {
                        console.error('Erro ao editar resposta sobre o erro:', editErr);
                    }
                }
            }
        });
    } catch (err) {
        console.error('Falha ao registrar interactionCreate:', err);
    }
    client.once('clientReady', async () => {
        try { const event = require('./events/ready'); await event.execute(client); } catch (error) { console.error(`Erro Ready ${config.name}:`, error); }
    });
    return client;
}
for (const config of botConfigs) { clients.push(createClient(config)); }

// Rotas do Dashboard
function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
    return `${d > 0 ? d + 'd ' : ''}${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
}

app.get('/', async (req, res) => {
    try {
        const readyClients = clients.filter(c => c.isReady());
        if (readyClients.length === 0) {
            return res.render('dashboard', {
                bot: null, stats: null, ready: false, bots: [], rankGlobal: [], topServers: [], guilds: []
            });
        }
        const primaryClient = readyClients[0];
        const { getRankGlobal, countActiveTournaments, getTopServers } = require('./utils/database');
        const activeSimulators = await countActiveTournaments();
        const topPlayers = await getRankGlobal(10);
        const rankGlobalWithNames = await Promise.all(topPlayers.map(async (player) => {
            let username = 'Jogador Desconhecido';
            for (const client of readyClients) {
                try {
                    const user = await client.users.fetch(player.user_id);
                    if (user) { username = user.displayName || user.username; break; }
                } catch (err) {}
            }
            return { id: player.user_id, username, wins: player.wins || 0, points: player.points || 0 };
        }));
        const topServersData = await getTopServers(10);
        const topServers = [];
        for (const server of topServersData) {
            if (topServers.length >= 3) break;
            for (const client of readyClients) {
                const guild = client.guilds.cache.get(server.guildId);
                if (guild) {
                    let inviteUrl = null;
                    try {
                        const invites = await guild.invites.fetch();
                        const permanentInvite = invites.find(inv => inv.maxAge === 0) || invites.first();
                        if (permanentInvite) inviteUrl = `https://discord.gg/${permanentInvite.code}`;
                    } catch (err) {}
                    topServers.push({ name: guild.name, icon: guild.iconURL(), memberCount: guild.memberCount, simulatorsCreated: server.simulatorsCreated, inviteUrl });
                    break;
                }
            }
        }
        let totalGuilds = 0, totalUsers = 0;
        const allGuilds = [];
        for (const client of readyClients) {
            totalGuilds += client.guilds.cache.size;
            totalUsers += client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
            client.guilds.cache.forEach(g => allGuilds.push({ name: g.name, memberCount: g.memberCount, icon: g.iconURL() }));
        }
        const stats = { totalGuilds, totalUsers, totalCommands: primaryClient.commands.size, totalPlayers: topPlayers.length, activeSimulators, uptime: formatUptime(process.uptime()), totalBots: clients.length, onlineBots: readyClients.length };
        allGuilds.sort((a, b) => b.memberCount - a.memberCount);
        res.render('dashboard', {
            bot: { username: primaryClient.user.username, avatar: primaryClient.user.displayAvatarURL(), tag: primaryClient.user.tag },
            stats, ready: true, rankGlobal: rankGlobalWithNames, topServers: topServers.filter(s => s !== null), guilds: allGuilds, bots: readyClients.map(c => ({ username: c.user.username, avatar: c.user.displayAvatarURL(), tag: c.user.tag, guilds: c.guilds.cache.size }))
        });
    } catch (error) { res.status(500).send('Erro ao carregar dashboard'); }
});

app.get('/loja', async (req, res) => {
    try {
        const { getShopCatalog, getTopPlayersByCoins, getPlayer } = require('./utils/database');
        const catalog = getShopCatalog();
        const topBuyers = await getTopPlayersByCoins(5);
        const readyClients = clients.filter(c => c.isReady());
        const primaryClient = readyClients.length > 0 ? readyClients[0] : null;
        let user = null;
        if (req.session && req.session.user) {
            const playerData = await getPlayer(req.session.user.id);
            user = { ...req.session.user, coins: playerData?.coins || 0 };
        }
        res.render('loja', { catalog, topBuyers, user, bot: primaryClient ? { username: primaryClient.user.username, avatar: primaryClient.user.displayAvatarURL(), tag: primaryClient.user.tag } : null, ready: readyClients.length > 0 });
    } catch (error) { res.status(500).send('Erro ao carregar loja'); }
});

// ==========================================
// 5. BANCO DE DADOS E SESSÕES (BACKGROUND)
// ==========================================
async function start() {
    try {
        const sessionPath = path.join(__dirname, 'data', 'sessions');
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
        await initDatabase();
        
        app.use(session({
            store: new FileStore({ path: sessionPath, logFn: () => {} }),
            secret: process.env.SESSION_SECRET || 'simulator-bot-secret-key-2024',
            resave: false, saveUninitialized: false,
            cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
        }));

        for (const client of clients) {
            client.login(client.botConfig.token)
                .then(() => {
                    console.log(`✅ [${client.botConfig.name}] Online.`);
                    // Fazer deploy dos comandos quando o bot ficar online
                    console.log(`⏰ Agendando deploy de comandos em 5 segundos...`);
                    setTimeout(() => {
                        console.log(`🚀 Executando deploy agendado para [${client.botConfig.name}]`);
                        console.log(`   Application ID atual: ${client.botConfig.applicationId || '❌ NULL'}`);
                        deployCommands();
                    }, 5000); // Aumentado para 5 segundos para dar tempo do Application ID ser obtido
                })
                .catch(err => console.error(`❌ [${client.botConfig.name}] Falha:`, err.message));
        }
    } catch (error) { console.error('Erro background:', error); }
}

setTimeout(start, 500);
module.exports = { clients };
