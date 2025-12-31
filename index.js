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
const PORT = process.env.PORT || 5000;

let DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.APPLICATION_ID || null;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

function setDiscordClientId(id) {
    if (!DISCORD_CLIENT_ID && id) {
        DISCORD_CLIENT_ID = id;
        console.log('✅ DISCORD_CLIENT_ID obtido automaticamente:', id);
    }
}

function getDiscordClientId() {
    return DISCORD_CLIENT_ID;
}

// Construir a URL de redirect do OAuth2
let DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
if (!DISCORD_REDIRECT_URI) {
    const replId = process.env.REPL_ID;
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    
    if (replId) {
        // Replit - usa o formato correto com REPL_ID
        DISCORD_REDIRECT_URI = `https://${replId}.id.repl.co/auth/discord/callback`;
    } else if (renderUrl) {
        // Render
        DISCORD_REDIRECT_URI = `${renderUrl}/auth/discord/callback`;
    } else {
        // Localhost
        DISCORD_REDIRECT_URI = 'http://localhost:5000/auth/discord/callback';
    }
}

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
        console.warn('⚠️ Nenhum token de bot configurado! O Dashboard funcionará em modo limitado.');
    }

console.log(`📦 ${botConfigs.length} bot(s) configurado(s)`);

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

    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

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
app.use(cookieParser());
app.set('trust proxy', 1);
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

const crypto = require('crypto');

app.get('/auth/discord', (req, res) => {
    const clientId = DISCORD_CLIENT_ID || global.DISCORD_CLIENT_ID;
    if (!clientId || !DISCORD_CLIENT_SECRET) {
        console.log('OAuth não configurado - clientId:', clientId, 'secret:', !!DISCORD_CLIENT_SECRET);
        return res.redirect('/loja?error=oauth_not_configured');
    }
    
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify',
        state: state
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
    const { code, state, error: oauthError } = req.query;
    const clientId = DISCORD_CLIENT_ID || global.DISCORD_CLIENT_ID;
    
    if (oauthError) {
        console.error('OAuth error from Discord:', oauthError);
        return res.redirect('/loja?error=discord_denied');
    }
    
    if (!state || state !== req.session.oauthState) {
        console.error('OAuth state mismatch - possible CSRF attack');
        return res.redirect('/loja?error=invalid_state');
    }
    
    delete req.session.oauthState;
    
    if (!code) {
        return res.redirect('/loja?error=no_code');
    }

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI
            })
        });

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            console.error('OAuth error:', tokenData);
            return res.redirect('/loja?error=token_failed');
        }

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`
            }
        });

        const userData = await userResponse.json();
        if (!userData.id) {
            return res.redirect('/loja?error=user_failed');
        }

        const { getPlayer } = require('./utils/database');
        const playerData = await getPlayer(userData.id);

        req.session.user = {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar: userData.avatar 
                ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator || '0') % 5}.png`,
            coins: playerData?.coins || 0
        };

        console.log('✅ Login bem-sucedido:', userData.username);
        res.redirect('/loja?login=success');
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect('/loja?error=callback_failed');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/loja');
});

app.post('/api/purchase', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Voce precisa estar logado' });
    }

    const { itemId, itemType } = req.body;
    if (!itemId || !itemType) {
        return res.status(400).json({ success: false, error: 'Item invalido' });
    }

    try {
        const { getPlayer, updatePlayer, getShopCatalog } = require('./utils/database');
        const catalog = getShopCatalog();
        
        let item = null;
        if (itemType === 'banner') {
            item = catalog.banners.find(b => b.id === itemId);
        } else if (itemType === 'title') {
            item = catalog.titles.find(t => t.id === itemId);
        } else if (itemType === 'role') {
            item = catalog.roles.find(r => r.id === itemId);
        }

        if (!item) {
            return res.status(404).json({ success: false, error: 'Item nao encontrado' });
        }

        const player = await getPlayer(req.session.user.id);
        if (!player) {
            return res.status(404).json({ success: false, error: 'Jogador nao encontrado. Participe de um simulador primeiro!' });
        }

        const isOwner = req.session.user.id === process.env.OWNER_ID;

        if (!isOwner && (player.coins || 0) < item.price) {
            return res.status(400).json({ success: false, error: `Moedas insuficientes. Voce tem ${player.coins || 0} moedas, precisa de ${item.price}` });
        }

        const inventoryKey = itemType === 'banner' ? 'bannersOwned' : itemType === 'title' ? 'titlesOwned' : 'rolesOwned';
        const currentItems = player[inventoryKey] || [];
        
        if (currentItems.includes(itemId)) {
            return res.status(400).json({ success: false, error: 'Voce ja possui este item!' });
        }

        const newItems = [...currentItems, itemId];

        const newCoins = isOwner ? (player.coins || 0) : (player.coins || 0) - item.price;
        
        await updatePlayer(req.session.user.id, {
            coins: newCoins,
            [inventoryKey]: newItems
        });

        req.session.user.coins = newCoins;

        res.json({ 
            success: true, 
            message: `Voce comprou ${item.name}!`,
            newBalance: req.session.user.coins
        });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ success: false, error: 'Erro ao processar compra' });
    }
});

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

    const topServersData = await getTopServers(10); // Pegar mais para garantir que temos o suficiente após o filtro
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
                    if (permanentInvite) {
                        inviteUrl = `https://discord.gg/${permanentInvite.code}`;
                    }
                } catch (err) {}
                
                topServers.push({
                    name: guild.name,
                    icon: guild.iconURL(),
                    memberCount: guild.memberCount,
                    simulatorsCreated: server.simulatorsCreated,
                    inviteUrl: inviteUrl
                });
                break; // Achou a guild, vai para o próximo serverData
            }
        }
    }

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

    // Ordenar servidores por número de membros (decrescente)
    allGuilds.sort((a, b) => b.memberCount - a.memberCount);

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

app.get('/loja', async (req, res) => {
    const { getShopCatalog, getTopPlayersByCoins, getPlayer } = require('./utils/database');
    const catalog = getShopCatalog();
    const topBuyers = await getTopPlayersByCoins(5);
    
    const readyClients = clients.filter(c => c.isReady());
    const primaryClient = readyClients.length > 0 ? readyClients[0] : null;

    let user = null;
    if (req.session.user) {
        const playerData = await getPlayer(req.session.user.id);
        user = {
            ...req.session.user,
            coins: playerData?.coins || 0
        };
        req.session.user.coins = user.coins;
    }
    
    res.render('loja', {
        catalog,
        topBuyers,
        user,
        bot: primaryClient ? {
            username: primaryClient.user.username,
            avatar: primaryClient.user.displayAvatarURL(),
            tag: primaryClient.user.tag
        } : null,
        ready: readyClients.length > 0
    });
});

app.get('/api/shop', (req, res) => {
    const { getShopCatalog } = require('./utils/database');
    const catalog = getShopCatalog();
    res.json(catalog);
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

        console.log('🔄 Fazendo login dos bots...');
        
        // Iniciamos o servidor web antes do login para que o Railway consiga dar o "health check" (pong)
        // mesmo que o bot demore para logar ou o token esteja faltando.
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🌐 Servidor web rodando na porta ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
            console.log(`🏓 Ping endpoint: http://localhost:${PORT}/ping`);
        });

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

    } catch (error) {
        console.error('❌ Erro ao iniciar:', error);
        process.exit(1);
    }
}

module.exports = { clients };

start();
