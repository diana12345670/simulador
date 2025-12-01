// index.js - Arquivo principal do bot Discord de torneios (Multi-Bot)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const express = require('express');
const { initDatabase } = require('./utils/database');
const app = express();
const PORT = process.env.PORT || 5000;

const DEFAULT_OWNER_ID = '1339336477661724674';

if (!process.env.OWNER_ID) {
    process.env.OWNER_ID = DEFAULT_OWNER_ID;
    console.log('✅ Usando OWNER_ID padrão:', DEFAULT_OWNER_ID);
}

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

if (botConfigs.length === 0) {
    console.error('❌ Nenhum token de bot configurado!');
    console.error('Configure pelo menos um: BOT_TOKEN ou BOT_TOKEN_1, BOT_TOKEN_2, BOT_TOKEN_3');
    process.exit(1);
}

console.log(`📦 ${botConfigs.length} bot(s) configurado(s)`);

const clients = [];

function createClient(config) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds
        ]
    });

    client.botConfig = config;
    client.commands = new Collection();

    const { loadCommands } = require('./handlers/commandHandler');
    loadCommands(client);

    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        delete require.cache[require.resolve(filePath)];
        const event = require(filePath);

        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }

    return client;
}

for (const config of botConfigs) {
    const client = createClient(config);
    clients.push(client);
    console.log(`✅ Cliente criado para: ${config.name}`);
}

process.on('unhandledRejection', error => {
    console.error('❌ Erro não tratado (Promise Rejection):', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Erro não capturado (Exception):', error);
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.get('/health', (req, res) => {
    const botsStatus = clients.map(client => ({
        name: client.botConfig.name,
        online: client.isReady(),
        guilds: client.isReady() ? client.guilds.cache.size : 0,
        users: client.isReady() ? client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0) : 0
    }));

    const health = {
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        bots: botsStatus,
        totalBots: clients.length,
        onlineBots: clients.filter(c => c.isReady()).length
    };
    res.status(200).json(health);
});

app.get('/', async (req, res) => {
    const readyClients = clients.filter(c => c.isReady());
    
    if (readyClients.length === 0) {
        return res.render('dashboard', {
            bot: null,
            stats: null,
            ready: false,
            bots: []
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
                if (user) {
                    username = user.displayName || user.username;
                    break;
                }
            } catch (err) {}
        }
        return {
            id: player.user_id,
            username: username,
            wins: player.wins || 0,
            points: player.points || 0
        };
    }));

    const topServersData = await getTopServers(3);
    const topServers = await Promise.all(topServersData.map(async (server) => {
        for (const client of readyClients) {
            const guild = client.guilds.cache.get(server.guildId);
            if (guild) {
                let inviteUrl = null;
                try {
                    const invites = await guild.invites.fetch();
                    const permanentInvite = invites.find(inv => inv.maxAge === 0) || invites.first();
                    if (permanentInvite) {
                        inviteUrl = `https://discord.gg/${permanentInvite.code}`;
                    }
                } catch (err) {}
                return {
                    name: guild.name,
                    icon: guild.iconURL(),
                    memberCount: guild.memberCount,
                    simulatorsCreated: server.simulatorsCreated,
                    inviteUrl: inviteUrl
                };
            }
        }
        return null;
    }));

    let totalGuilds = 0;
    let totalUsers = 0;
    const allGuilds = [];

    for (const client of readyClients) {
        totalGuilds += client.guilds.cache.size;
        totalUsers += client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        client.guilds.cache.forEach(g => {
            allGuilds.push({
                name: g.name,
                memberCount: g.memberCount,
                icon: g.iconURL()
            });
        });
    }

    const stats = {
        totalGuilds: totalGuilds,
        totalUsers: totalUsers,
        totalCommands: primaryClient.commands.size,
        totalPlayers: topPlayers.length,
        activeSimulators: activeSimulators,
        uptime: formatUptime(process.uptime()),
        totalBots: clients.length,
        onlineBots: readyClients.length
    };

    const botsInfo = readyClients.map(client => ({
        username: client.user.username,
        avatar: client.user.displayAvatarURL(),
        tag: client.user.tag,
        guilds: client.guilds.cache.size
    }));

    res.render('dashboard', {
        bot: {
            username: primaryClient.user.username,
            avatar: primaryClient.user.displayAvatarURL(),
            tag: primaryClient.user.tag
        },
        stats: stats,
        ready: true,
        rankGlobal: rankGlobalWithNames,
        topServers: topServers.filter(s => s !== null),
        guilds: allGuilds,
        bots: botsInfo
    });
});

app.get('/api/stats', async (req, res) => {
    const readyClients = clients.filter(c => c.isReady());
    
    if (readyClients.length === 0) {
        return res.status(503).json({ error: 'Nenhum bot está pronto' });
    }

    const { getRankGlobal, countActiveTournaments } = require('./utils/database');
    const activeSimulators = await countActiveTournaments();
    const topPlayers = await getRankGlobal(5);

    let totalGuilds = 0;
    let totalUsers = 0;
    for (const client of readyClients) {
        totalGuilds += client.guilds.cache.size;
        totalUsers += client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    }

    res.json({
        guilds: totalGuilds,
        users: totalUsers,
        commands: readyClients[0].commands.size,
        players: topPlayers.length,
        activeSimulators: activeSimulators,
        uptime: process.uptime(),
        totalBots: clients.length,
        onlineBots: readyClients.length,
        bots: readyClients.map(c => ({
            name: c.botConfig.name,
            tag: c.user.tag,
            guilds: c.guilds.cache.size
        }))
    });
});

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

async function registerCommands(client) {
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        delete require.cache[require.resolve(filePath)];
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        }
    }

    const applicationId = client.botConfig.applicationId || client.user.id;
    const rest = new REST({ version: '10' }).setToken(client.botConfig.token);

    try {
        console.log(`🔄 [${client.botConfig.name}] Registrando ${commands.length} comandos slash...`);
        await rest.put(
            Routes.applicationCommands(applicationId),
            { body: commands }
        );
        console.log(`✅ [${client.botConfig.name}] ${commands.length} comandos registrados com sucesso!`);
    } catch (error) {
        console.error(`❌ [${client.botConfig.name}] Erro ao registrar comandos:`, error);
    }
}

async function start() {
    try {
        console.log('🔄 Inicializando banco de dados...');
        await initDatabase();
        console.log('✅ Banco de dados inicializado!');

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🌐 Servidor web rodando na porta ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
            console.log(`🏓 Ping endpoint: http://localhost:${PORT}/ping`);
        });

        console.log('🔄 Fazendo login dos bots...');
        
        const loginPromises = clients.map(async (client) => {
            try {
                await client.login(client.botConfig.token);
                console.log(`✅ [${client.botConfig.name}] Online como ${client.user.tag}`);
                
                await registerCommands(client);
                
                return { success: true, name: client.botConfig.name };
            } catch (error) {
                console.error(`❌ [${client.botConfig.name}] Erro ao fazer login:`, error.message);
                return { success: false, name: client.botConfig.name, error: error.message };
            }
        });

        const results = await Promise.all(loginPromises);
        
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ ${successCount} bot(s) online`);
        if (failCount > 0) {
            console.log(`❌ ${failCount} bot(s) com erro`);
        }
        
        let totalGuilds = 0;
        let totalUsers = 0;
        for (const client of clients) {
            if (client.isReady()) {
                totalGuilds += client.guilds.cache.size;
                totalUsers += client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
            }
        }
        console.log(`📊 Total de servidores: ${totalGuilds}`);
        console.log(`👥 Total de usuários: ${totalUsers}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (successCount === 0) {
            console.error('❌ Nenhum bot conseguiu fazer login!');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Erro ao iniciar:', error);
        process.exit(1);
    }
}

module.exports = { clients };

start();
