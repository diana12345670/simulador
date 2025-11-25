// index.js - Arquivo principal do bot Discord de torneios
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const { initDatabase } = require('./utils/database'); // Importa a função de inicialização do banco de dados
const app = express();
const PORT = process.env.PORT || 5000;

// IDs padrão configurados
const DEFAULT_APPLICATION_ID = '1442258129491329105';
const DEFAULT_OWNER_ID = '1339336477661724674';

// Verifica variáveis de ambiente
if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN não encontrado no arquivo .env');
    process.exit(1);
}

// Usa IDs padrão se não estiverem nas variáveis de ambiente
if (!process.env.OWNER_ID) {
    process.env.OWNER_ID = DEFAULT_OWNER_ID;
    console.log('✅ Usando OWNER_ID padrão:', DEFAULT_OWNER_ID);
}

if (!process.env.APPLICATION_ID) {
    process.env.APPLICATION_ID = DEFAULT_APPLICATION_ID;
    console.log('✅ Usando APPLICATION_ID padrão:', DEFAULT_APPLICATION_ID);
}

// Cria cliente do Discord com intents necessários
// IMPORTANTE: Você precisa habilitar "SERVER MEMBERS INTENT" no Discord Developer Portal
// Vá em: https://discord.com/developers/applications > Sua Aplicação > Bot > Privileged Gateway Intents
// Habilite: SERVER MEMBERS INTENT
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// Carrega comandos
client.commands = new Collection();
const { loadCommands } = require('./handlers/commandHandler');
loadCommands(client);

// Carrega eventos
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }

    console.log(`✅ Evento carregado: ${event.name}`);
}

// Tratamento de erros global
process.on('unhandledRejection', error => {
    console.error('❌ Erro não tratado (Promise Rejection):', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Erro não capturado (Exception):', error);
});

// Configuração do servidor web Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Endpoint de ping para Uptime Robot
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Endpoint de health check
app.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        bot: {
            online: client.isReady(),
            guilds: client.guilds.cache.size,
            users: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
        }
    };
    res.status(200).json(health);
});

// Rota principal - Dashboard
app.get('/', async (req, res) => {
    if (!client.isReady()) {
        return res.render('dashboard', {
            bot: null,
            stats: null,
            ready: false
        });
    }

    // Remove a chamada para readDB e usa as funções do PostgreSQL
    // const { readDB, DB_KEYS } = require('./utils/database');
    // const rankGlobal = await readDB(DB_KEYS.RANK_GLOBAL, {});
    // const simuladores = await readDB(DB_KEYS.SIMULADORES, {});

    const { getRankGlobal, countActiveTournaments } = require('./utils/database');

    // Conta simuladores ativos
    const activeSimulators = await countActiveTournaments();

    const topPlayers = await getRankGlobal(10); // Obtém os 10 melhores jogadores

    const stats = {
        totalGuilds: client.guilds.cache.size,
        totalUsers: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
        totalCommands: client.commands.size,
        totalPlayers: topPlayers.length, // Usa o número de top players como total de jogadores
        activeSimulators: activeSimulators,
        uptime: formatUptime(process.uptime())
    };

    res.render('dashboard', {
        bot: {
            username: client.user.username,
            avatar: client.user.displayAvatarURL(),
            tag: client.user.tag
        },
        stats: stats,
        ready: true,
        rankGlobal: topPlayers.map(player => ({ // Mapeia os top players para o formato esperado
            id: player.user_id, // Assume que a coluna é 'user_id'
            wins: player.wins || 0, // Assume que a coluna é 'wins'
            // Adicione outras propriedades conforme necessário
        })),
        guilds: client.guilds.cache.map(g => ({
            name: g.name,
            memberCount: g.memberCount,
            icon: g.iconURL()
        }))
    });
});

// API endpoint para estatísticas
app.get('/api/stats', async (req, res) => {
    if (!client.isReady()) {
        return res.status(503).json({ error: 'Bot não está pronto' });
    }

    // Remove a chamada para readDB e usa as funções do PostgreSQL
    // const { readDB, DB_KEYS } = require('./utils/database');
    // const rankGlobal = await readDB(DB_KEYS.RANK_GLOBAL, {});
    // const simuladores = await readDB(DB_KEYS.SIMULADORES, {});

    const { getRankGlobal, countActiveTournaments } = require('./utils/database');

    // Conta simuladores ativos
    const activeSimulators = await countActiveTournaments();

    const topPlayers = await getRankGlobal(5); // Obtém os 5 melhores jogadores

    res.json({
        guilds: client.guilds.cache.size,
        users: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
        commands: client.commands.size,
        players: topPlayers.length, // Usa o número de top players como total de jogadores
        activeSimulators: activeSimulators,
        uptime: process.uptime()
    });
});

// Função auxiliar para formatar uptime
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

// Inicializa database e depois inicia o bot e servidor
async function start() {
    try {
        // 1. Inicializa o banco de dados PRIMEIRO
        console.log('🔄 Inicializando PostgreSQL...');
        await initDatabase();
        console.log('✅ PostgreSQL inicializado com sucesso!');

        // 2. Inicia o servidor web
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🌐 Servidor web rodando na porta ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
            console.log(`🏓 Ping endpoint: http://localhost:${PORT}/ping`);
        });

        // 3. Faz login do bot
        console.log('🔄 Fazendo login no Discord...');
        await client.login(process.env.BOT_TOKEN);
        console.log('✅ Bot online com sucesso!');

    } catch (error) {
        console.error('❌ Erro ao iniciar o bot:', error);
        process.exit(1);
    }
}

// Inicia tudo
start();