// database.js - Database Manager com JSON como principal e PostgreSQL opcional
const path = require('path');
const fs = require('fs');
const { readJSON, writeJSON } = require('./jsonDB');

let pool = null;
let usePostgres = false;

const DATA_DIR = path.join(__dirname, '..', 'data');
const JSON_FILES = {
    config: path.join(DATA_DIR, 'config.json'),
    simuladores: path.join(DATA_DIR, 'simuladores.json'),
    bans: path.join(DATA_DIR, 'bans.json'),
    servers_banidos: path.join(DATA_DIR, 'servers_banidos.json'),
    rank_global: path.join(DATA_DIR, 'rank_global.json'),
    rank_local_dir: path.join(DATA_DIR, 'rank_local'),
    tournaments: path.join(DATA_DIR, 'tournaments.json'),
    players: path.join(DATA_DIR, 'players.json'),
    match_history: path.join(DATA_DIR, 'match_history.json'),
    shop_catalog: path.join(DATA_DIR, 'shop_catalog.json'),
    live_rank_panels: path.join(DATA_DIR, 'live_rank_panels.json'),
    server_stats: path.join(DATA_DIR, 'server_stats.json')
};

async function tryConnectPostgres() {
    // Forçado a usar apenas JSON conforme solicitado
    return false;
}

function initJsonDatabase() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(JSON_FILES.rank_local_dir)) fs.mkdirSync(JSON_FILES.rank_local_dir, { recursive: true });
    
    // Inicializa arquivos se não existirem
    readJSON(JSON_FILES.config, {});
    readJSON(JSON_FILES.simuladores, {});
    readJSON(JSON_FILES.bans, { global: [], local: {} });
    readJSON(JSON_FILES.servers_banidos, []);
    readJSON(JSON_FILES.rank_global, {});
    readJSON(JSON_FILES.tournaments, {});
    readJSON(JSON_FILES.players, {});
    readJSON(JSON_FILES.match_history, []);
}

async function initDatabase() {
    initJsonDatabase();
    usePostgres = await tryConnectPostgres();
    console.log(`✅ Sistema de banco de dados inicializado (Principal: JSON, Postgres: ${usePostgres ? 'Ativo' : 'Inativo'}).`);
}

async function readConfig(key, defaultValue = {}) {
    if (usePostgres) {
        try {
            const client = await pool.connect();
            const res = await client.query('SELECT value FROM config WHERE key = $1', [key]);
            client.release();
            if (res.rows.length > 0) return res.rows[0].value;
        } catch (e) {}
    }
    const data = readJSON(JSON_FILES.config, {});
    return data[key] !== undefined ? data[key] : defaultValue;
}

async function writeConfig(key, value) {
    const data = readJSON(JSON_FILES.config, {});
    data[key] = value;
    writeJSON(JSON_FILES.config, data);
    
    if (usePostgres) {
        try {
            const client = await pool.connect();
            await client.query('INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
            client.release();
        } catch (e) {}
    }
}

async function getSimulador(userId) {
    if (usePostgres) {
        try {
            const client = await pool.connect();
            const res = await client.query('SELECT data FROM simuladores WHERE user_id = $1', [userId]);
            client.release();
            if (res.rows.length > 0) return res.rows[0].data;
        } catch (e) {}
    }
    const data = readJSON(JSON_FILES.simuladores, {});
    return data[userId] || null;
}

async function saveSimulador(userId, data) {
    const simuladores = readJSON(JSON_FILES.simuladores, {});
    simuladores[userId] = data;
    writeJSON(JSON_FILES.simuladores, simuladores);
    
    if (usePostgres) {
        try {
            const client = await pool.connect();
            await client.query('INSERT INTO simuladores (user_id, data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data = $2', [userId, data]);
            client.release();
        } catch (e) {}
    }
}

async function updateRankGlobal(userId, stats) {
    const { wins = 0, losses = 0, draws = 0, points = 0 } = stats;
    const rank = readJSON(JSON_FILES.rank_global, {});
    if (!rank[userId]) rank[userId] = { wins: 0, losses: 0, draws: 0, points: 0 };
    rank[userId].wins += wins; rank[userId].losses += losses; rank[userId].draws += draws; rank[userId].points += points;
    writeJSON(JSON_FILES.rank_global, rank);
    
    if (usePostgres) {
        try {
            const client = await pool.connect();
            await client.query('INSERT INTO rank_global (user_id, wins, losses, draws, points) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET wins = rank_global.wins + $2, losses = rank_global.losses + $3, draws = rank_global.draws + $4, points = rank_global.points + $5', [userId, wins, losses, draws, points]);
            client.release();
        } catch (e) {}
    }
}

async function updateRankLocal(guildId, userId, stats) {
    const { wins = 0, losses = 0, draws = 0, points = 0 } = stats;
    const filePath = path.join(JSON_FILES.rank_local_dir, `${guildId}.json`);
    const rank = readJSON(filePath, {});
    if (!rank[userId]) rank[userId] = { wins: 0, losses: 0, draws: 0, points: 0 };
    rank[userId].wins += wins; rank[userId].losses += losses; rank[userId].draws += draws; rank[userId].points += points;
    writeJSON(filePath, rank);
    
    if (usePostgres) {
        try {
            const client = await pool.connect();
            await client.query('INSERT INTO rank_local (guild_id, user_id, wins, losses, draws, points) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (guild_id, user_id) DO UPDATE SET wins = rank_local.wins + $3, losses = rank_local.losses + $4, draws = rank_local.draws + $5, points = rank_local.points + $6', [guildId, userId, wins, losses, draws, points]);
            client.release();
        } catch (e) {}
    }
}

async function getRankGlobal(limit = 10) {
    try {
        const rank = readJSON(JSON_FILES.rank_global, {});
        return Object.entries(rank)
            .map(([user_id, d]) => ({ user_id, ...d }))
            .sort((a, b) => (b.points || 0) - (a.points || 0))
            .slice(0, limit);
    } catch (error) {
        console.error('Erro ao buscar rank global:', error);
        return [];
    }
}

async function getRankLocal(guildId, limit = 10) {
    try {
        const filePath = path.join(JSON_FILES.rank_local_dir, `${guildId}.json`);
        const rank = readJSON(filePath, {});
        return Object.entries(rank)
            .map(([user_id, d]) => ({ user_id, ...d }))
            .sort((a, b) => (b.points || 0) - (a.points || 0))
            .slice(0, limit);
    } catch (error) {
        console.error(`Erro ao buscar rank local para guild ${guildId}:`, error);
        return [];
    }
}

async function isUserBanned(userId) {
    const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
    return bans.global.some(b => b.userId === userId);
}

async function isUserBannedInGuild(userId, guildId) {
    const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
    return (bans.local[guildId] || []).some(b => b.userId === userId);
}

async function banUser(userId, reason = 'N/A') {
    const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
    if (!bans.global.find(b => b.userId === userId)) {
        bans.global.push({ userId, reason, bannedAt: new Date().toISOString() });
        writeJSON(JSON_FILES.bans, bans);
    }
}

async function unbanUser(userId) {
    const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
    bans.global = bans.global.filter(b => b.userId !== userId);
    writeJSON(JSON_FILES.bans, bans);
}

async function banUserInGuild(userId, guildId, reason = 'N/A') {
    const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
    if (!bans.local[guildId]) bans.local[guildId] = [];
    if (!bans.local[guildId].find(b => b.userId === userId)) {
        bans.local[guildId].push({ userId, reason, bannedAt: new Date().toISOString() });
        writeJSON(JSON_FILES.bans, bans);
    }
}

async function unbanUserInGuild(userId, guildId) {
    const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
    bans.local[guildId] = (bans.local[guildId] || []).filter(b => b.userId !== userId);
    writeJSON(JSON_FILES.bans, bans);
}

async function isGuildBanned(guildId) {
    const servers = readJSON(JSON_FILES.servers_banidos, []);
    return servers.some(s => s.guildId === guildId);
}

async function createTournament(data) {
    const ts = readJSON(JSON_FILES.tournaments, {});
    ts[data.id] = data;
    writeJSON(JSON_FILES.tournaments, ts);
}

async function getTournamentById(id) {
    try {
        const ts = readJSON(JSON_FILES.tournaments, {});
        return ts[id] || null;
    } catch (error) {
        console.error(`Erro ao buscar torneio ${id}:`, error);
        return null;
    }
}

async function updateTournament(id, update) {
    try {
        const ts = readJSON(JSON_FILES.tournaments, {});
        if (ts[id]) {
            ts[id] = { ...ts[id], ...update };
            writeJSON(JSON_FILES.tournaments, ts);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Erro ao atualizar torneio ${id}:`, error);
        return false;
    }
}

async function deleteTournament(id) {
    const ts = readJSON(JSON_FILES.tournaments, {});
    delete ts[id];
    writeJSON(JSON_FILES.tournaments, ts);
}

async function getAllTournaments() {
    const ts = readJSON(JSON_FILES.tournaments, {});
    return Object.values(ts);
}

async function countActiveTournaments() {
    const ts = await getAllTournaments();
    return ts.filter(t => t.state === 'open' || t.state === 'running').length;
}

async function getTopServers(limit = 3) {
    const stats = readJSON(JSON_FILES.server_stats, {});
    return Object.entries(stats).map(([guildId, count]) => ({ guildId, simulatorsCreated: count })).sort((a, b) => b.simulatorsCreated - a.simulatorsCreated).slice(0, limit);
}

async function incrementServerSimulators(guildId) {
    const stats = readJSON(JSON_FILES.server_stats, {});
    stats[guildId] = (stats[guildId] || 0) + 1;
    writeJSON(JSON_FILES.server_stats, stats);
}

async function getPlayer(userId) {
    const ps = readJSON(JSON_FILES.players, {});
    return ps[userId] || null;
}

async function updatePlayer(userId, data) {
    const ps = readJSON(JSON_FILES.players, {});
    ps[userId] = { ...(ps[userId] || {}), ...data };
    writeJSON(JSON_FILES.players, ps);
}

async function addMatchHistory(match) {
    const hist = readJSON(JSON_FILES.match_history, []);
    hist.push(match);
    writeJSON(JSON_FILES.match_history, hist);
}

function getShopCatalog() {
    return readJSON(JSON_FILES.shop_catalog, { banners: [], titles: [], roles: [] });
}

async function getLiveRankPanels() {
    return readJSON(JSON_FILES.live_rank_panels, []);
}

async function saveLiveRankPanel(panel) {
    const panels = await getLiveRankPanels();
    panels.push(panel);
    writeJSON(JSON_FILES.live_rank_panels, panels);
}

async function banServer(guildId, reason = 'Não especificado') {
    const servers = readJSON(JSON_FILES.servers_banidos, []);
    if (!servers.find(s => s.guildId === guildId)) {
        servers.push({ guildId, reason, bannedAt: new Date().toISOString() });
        writeJSON(JSON_FILES.servers_banidos, servers);
    }
}

async function unbanServer(guildId) {
    let servers = readJSON(JSON_FILES.servers_banidos, []);
    servers = servers.filter(s => s.guildId !== guildId);
    writeJSON(JSON_FILES.servers_banidos, servers);
}

async function setBotNote(note) {
    await writeConfig('bot_note', note);
}

async function getBotNote() {
    return await readConfig('bot_note', '');
}

async function getLiveRankPanelsByGuild(guildId) {
    const panels = await getLiveRankPanels();
    return panels.filter(p => p.guildId === guildId);
}

async function removeLiveRankPanel(panelId) {
    let panels = await getLiveRankPanels();
    const initialLength = panels.length;
    panels = panels.filter(p => p.id !== panelId);
    if (panels.length !== initialLength) {
        writeJSON(JSON_FILES.live_rank_panels, panels);
    }
}

async function addOwnerHelper(userId) {
    const helpers = await readConfig('owner_helpers', []);
    if (!helpers.includes(userId)) {
        helpers.push(userId);
        await writeConfig('owner_helpers', helpers);
    }
    return helpers;
}

async function isOwnerOrAuthorized(userId) {
    if (!userId) return false;
    if (userId === process.env.OWNER_ID) return true;
    const helpers = await readConfig('owner_helpers', []);
    return helpers.includes(userId);
}

module.exports = {
    initDatabase, readConfig, writeConfig, getSimulador, saveSimulador,
    updateRankGlobal, updateRankLocal, getRankGlobal, getRankLocal,
    isUserBanned, isUserBannedInGuild, banUser, unbanUser, banUserInGuild, unbanUserInGuild, isGuildBanned,
    createTournament, getTournamentById, updateTournament, deleteTournament,
    getAllTournaments, countActiveTournaments, getTopServers, incrementServerSimulators,
    getPlayer, updatePlayer, addMatchHistory, getShopCatalog, getLiveRankPanels, saveLiveRankPanel,
    banServer, unbanServer, setBotNote, getBotNote, getLiveRankPanelsByGuild, removeLiveRankPanel,
    addOwnerHelper, isOwnerOrAuthorized
};
