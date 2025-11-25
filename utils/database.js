
// database.js - Database Manager com fallback para JSON
const path = require('path');
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
    tournaments: path.join(DATA_DIR, 'tournaments.json')
};

async function tryConnectPostgres() {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
        console.log('⚠️ DATABASE_URL não encontrada. Usando banco de dados local (JSON).');
        return false;
    }

    let pg;
    try {
        pg = require('pg');
    } catch (err) {
        console.log('⚠️ Módulo pg não disponível. Usando banco de dados local (JSON).');
        return false;
    }

    try {
        const poolUrl = databaseUrl.includes('.us-east-2') 
            ? databaseUrl.replace('.us-east-2', '-pooler.us-east-2')
            : databaseUrl;
            
        pool = new pg.Pool({
            connectionString: poolUrl,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        });

        pool.on('error', (err) => {
            console.log('⚠️ Erro no pool PostgreSQL:', err.message);
        });

        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        
        console.log('✅ Conectado ao PostgreSQL com sucesso!');
        return true;
    } catch (error) {
        console.log('⚠️ Não foi possível conectar ao PostgreSQL:', error.message);
        console.log('⚠️ Usando banco de dados local (JSON) como fallback.');
        
        if (pool) {
            try {
                await pool.end();
            } catch (e) {}
        }
        pool = null;
        return false;
    }
}

function getPool() {
    return pool;
}

async function initDatabase() {
    try {
        usePostgres = await tryConnectPostgres();
    } catch (error) {
        console.log('⚠️ Erro ao tentar PostgreSQL:', error.message);
        usePostgres = false;
    }

    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            
            await client.query(`
                CREATE TABLE IF NOT EXISTS config (
                    key VARCHAR(255) PRIMARY KEY,
                    value JSONB NOT NULL
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS tournaments (
                    id VARCHAR(100) PRIMARY KEY,
                    guild_id VARCHAR(50) NOT NULL,
                    channel_id VARCHAR(50) NOT NULL,
                    creator_id VARCHAR(50) NOT NULL,
                    mode VARCHAR(20) NOT NULL,
                    jogo VARCHAR(100) NOT NULL,
                    versao VARCHAR(100) NOT NULL,
                    max_players INTEGER NOT NULL,
                    prize VARCHAR(255) DEFAULT 'Nenhum',
                    state VARCHAR(20) DEFAULT 'open',
                    panel_message_id VARCHAR(50),
                    category_id VARCHAR(50),
                    players JSONB DEFAULT '[]'::jsonb,
                    bracket_data JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS simuladores (
                    user_id VARCHAR(50) PRIMARY KEY,
                    data JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS bans (
                    user_id VARCHAR(50) NOT NULL,
                    guild_id VARCHAR(50) DEFAULT '',
                    reason TEXT,
                    banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, guild_id)
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS servers_banidos (
                    guild_id VARCHAR(50) PRIMARY KEY,
                    reason TEXT,
                    banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS rank_global (
                    user_id VARCHAR(50) PRIMARY KEY,
                    wins INTEGER DEFAULT 0,
                    losses INTEGER DEFAULT 0,
                    draws INTEGER DEFAULT 0,
                    points INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS rank_local (
                    guild_id VARCHAR(50),
                    user_id VARCHAR(50),
                    wins INTEGER DEFAULT 0,
                    losses INTEGER DEFAULT 0,
                    draws INTEGER DEFAULT 0,
                    points INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, user_id)
                )
            `);

            await client.query('CREATE INDEX IF NOT EXISTS idx_rank_global_points ON rank_global(points DESC)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_rank_local_guild_points ON rank_local(guild_id, points DESC)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_tournaments_guild ON tournaments(guild_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_tournaments_state ON tournaments(state)');

            console.log('✅ Tabelas PostgreSQL inicializadas');
        } catch (error) {
            console.log('⚠️ Erro ao inicializar PostgreSQL, usando JSON:', error.message);
            usePostgres = false;
            if (pool) {
                try { await pool.end(); } catch (e) {}
            }
            pool = null;
        } finally {
            if (client) {
                try { client.release(); } catch (e) {}
            }
        }
    }
    
    if (!usePostgres) {
        initJsonDatabase();
    }
}

function initJsonDatabase() {
    const fs = require('fs');
    
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(JSON_FILES.rank_local_dir)) {
        fs.mkdirSync(JSON_FILES.rank_local_dir, { recursive: true });
    }
    
    readJSON(JSON_FILES.config, {});
    readJSON(JSON_FILES.simuladores, {});
    readJSON(JSON_FILES.bans, { global: [], local: {} });
    readJSON(JSON_FILES.servers_banidos, []);
    readJSON(JSON_FILES.rank_global, {});
    readJSON(JSON_FILES.tournaments, {});
    
    console.log('✅ Banco de dados JSON inicializado');
}

async function readConfig(key, defaultValue = {}) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query('SELECT value FROM config WHERE key = $1', [key]);
            return result.rows.length > 0 ? result.rows[0].value : defaultValue;
        } catch (error) {
            console.error(`Erro ao ler config ${key}:`, error.message);
            return defaultValue;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const config = readJSON(JSON_FILES.config, {});
        return config[key] !== undefined ? config[key] : defaultValue;
    }
}

async function writeConfig(key, value) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(`
                INSERT INTO config (key, value) 
                VALUES ($1, $2)
                ON CONFLICT (key) DO UPDATE SET value = $2
            `, [key, value]);
        } catch (error) {
            console.error(`Erro ao escrever config ${key}:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const config = readJSON(JSON_FILES.config, {});
        config[key] = value;
        writeJSON(JSON_FILES.config, config);
    }
}

async function getSimulador(userId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query('SELECT data FROM simuladores WHERE user_id = $1', [userId]);
            return result.rows.length > 0 ? result.rows[0].data : null;
        } catch (error) {
            console.error(`Erro ao ler simulador ${userId}:`, error.message);
            return null;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const simuladores = readJSON(JSON_FILES.simuladores, {});
        return simuladores[userId] || null;
    }
}

async function saveSimulador(userId, data) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(`
                INSERT INTO simuladores (user_id, data, updated_at) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP
            `, [userId, data]);
        } catch (error) {
            console.error(`Erro ao salvar simulador ${userId}:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const simuladores = readJSON(JSON_FILES.simuladores, {});
        simuladores[userId] = data;
        writeJSON(JSON_FILES.simuladores, simuladores);
    }
}

async function updateRankGlobal(userId, stats) {
    const { wins = 0, losses = 0, draws = 0, points = 0 } = stats;

    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(`
                INSERT INTO rank_global (user_id, wins, losses, draws, points, updated_at) 
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE SET 
                    wins = rank_global.wins + $2,
                    losses = rank_global.losses + $3,
                    draws = rank_global.draws + $4,
                    points = rank_global.points + $5,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, wins, losses, draws, points]);
        } catch (error) {
            console.error(`Erro ao atualizar rank global ${userId}:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const rankGlobal = readJSON(JSON_FILES.rank_global, {});
        if (!rankGlobal[userId]) {
            rankGlobal[userId] = { wins: 0, losses: 0, draws: 0, points: 0 };
        }
        rankGlobal[userId].wins += wins;
        rankGlobal[userId].losses += losses;
        rankGlobal[userId].draws += draws;
        rankGlobal[userId].points += points;
        writeJSON(JSON_FILES.rank_global, rankGlobal);
    }
}

async function updateRankLocal(guildId, userId, stats) {
    const { wins = 0, losses = 0, draws = 0, points = 0 } = stats;

    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(`
                INSERT INTO rank_local (guild_id, user_id, wins, losses, draws, points, updated_at) 
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                ON CONFLICT (guild_id, user_id) DO UPDATE SET 
                    wins = rank_local.wins + $3,
                    losses = rank_local.losses + $4,
                    draws = rank_local.draws + $5,
                    points = rank_local.points + $6,
                    updated_at = CURRENT_TIMESTAMP
            `, [guildId, userId, wins, losses, draws, points]);
        } catch (error) {
            console.error(`Erro ao atualizar rank local ${guildId}/${userId}:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const filePath = path.join(JSON_FILES.rank_local_dir, `${guildId}.json`);
        const rankLocal = readJSON(filePath, {});
        if (!rankLocal[userId]) {
            rankLocal[userId] = { wins: 0, losses: 0, draws: 0, points: 0 };
        }
        rankLocal[userId].wins += wins;
        rankLocal[userId].losses += losses;
        rankLocal[userId].draws += draws;
        rankLocal[userId].points += points;
        writeJSON(filePath, rankLocal);
    }
}

async function getRankGlobal(limit = 10) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                'SELECT * FROM rank_global ORDER BY points DESC, wins DESC LIMIT $1',
                [limit]
            );
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar rank global:', error.message);
            return [];
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const rankGlobal = readJSON(JSON_FILES.rank_global, {});
        const sorted = Object.entries(rankGlobal)
            .map(([user_id, data]) => ({ user_id, ...data }))
            .sort((a, b) => b.points - a.points || b.wins - a.wins)
            .slice(0, limit);
        return sorted;
    }
}

async function getRankLocal(guildId, limit = 10) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                'SELECT * FROM rank_local WHERE guild_id = $1 ORDER BY points DESC, wins DESC LIMIT $2',
                [guildId, limit]
            );
            return result.rows;
        } catch (error) {
            console.error(`Erro ao buscar rank local ${guildId}:`, error.message);
            return [];
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const filePath = path.join(JSON_FILES.rank_local_dir, `${guildId}.json`);
        const rankLocal = readJSON(filePath, {});
        const sorted = Object.entries(rankLocal)
            .map(([user_id, data]) => ({ user_id, ...data }))
            .sort((a, b) => b.points - a.points || b.wins - a.wins)
            .slice(0, limit);
        return sorted;
    }
}

async function isUserBanned(userId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query('SELECT 1 FROM bans WHERE user_id = $1 AND guild_id = $2', [userId, '']);
            return result.rows.length > 0;
        } catch (error) {
            console.error(`Erro ao verificar ban ${userId}:`, error.message);
            return false;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
        return bans.global.some(b => b.userId === userId);
    }
}

async function isUserBannedInGuild(userId, guildId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                'SELECT 1 FROM bans WHERE user_id = $1 AND guild_id = $2',
                [userId, guildId]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error(`Erro ao verificar ban local ${userId}/${guildId}:`, error.message);
            return false;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
        const guildBans = bans.local[guildId] || [];
        return guildBans.some(b => b.userId === userId);
    }
}

async function banUser(userId, reason = 'Não especificado') {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query('INSERT INTO bans (user_id, guild_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, '', reason]);
        } catch (error) {
            console.error(`Erro ao banir ${userId}:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
        if (!bans.global.some(b => b.userId === userId)) {
            bans.global.push({ userId, reason, bannedAt: new Date().toISOString() });
            writeJSON(JSON_FILES.bans, bans);
        }
    }
}

async function unbanUser(userId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query('DELETE FROM bans WHERE user_id = $1 AND guild_id = $2', [userId, '']);
        } catch (error) {
            console.error(`Erro ao desbanir ${userId}:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const bans = readJSON(JSON_FILES.bans, { global: [], local: {} });
        bans.global = bans.global.filter(b => b.userId !== userId);
        writeJSON(JSON_FILES.bans, bans);
    }
}

async function isGuildBanned(guildId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query('SELECT 1 FROM servers_banidos WHERE guild_id = $1', [guildId]);
            return result.rows.length > 0;
        } catch (error) {
            console.error(`Erro ao verificar ban servidor ${guildId}:`, error.message);
            return false;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const servers = readJSON(JSON_FILES.servers_banidos, []);
        return servers.some(s => s.guildId === guildId);
    }
}

async function createTournament(tournamentData) {
    const {
        id, guild_id, channel_id, creator_id, mode, jogo, versao,
        max_players, prize, panel_message_id, category_id, players, bracket_data
    } = tournamentData;

    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(`
                INSERT INTO tournaments (
                    id, guild_id, channel_id, creator_id, mode, jogo, versao,
                    max_players, prize, panel_message_id, category_id, players, bracket_data, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
            `, [
                id, guild_id, channel_id, creator_id, mode, jogo, versao,
                max_players, prize || 'Nenhum', panel_message_id, category_id,
                JSON.stringify(players || []), bracket_data ? JSON.stringify(bracket_data) : null
            ]);
            return tournamentData;
        } catch (error) {
            console.error(`Erro ao criar torneio ${id}:`, error.message);
            throw error;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const tournaments = readJSON(JSON_FILES.tournaments, {});
        tournaments[id] = {
            id,
            guildId: guild_id,
            channelId: channel_id,
            creatorId: creator_id,
            mode,
            jogo,
            versao,
            maxPlayers: max_players,
            prize: prize || 'Nenhum',
            state: 'open',
            panelMessageId: panel_message_id,
            categoryId: category_id,
            players: players || [],
            bracketData: bracket_data || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        writeJSON(JSON_FILES.tournaments, tournaments);
        return tournamentData;
    }
}

async function getTournamentById(tournamentId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
            if (result.rows.length === 0) return null;

            const row = result.rows[0];
            return {
                id: row.id,
                guildId: row.guild_id,
                channelId: row.channel_id,
                creatorId: row.creator_id,
                mode: row.mode,
                jogo: row.jogo,
                versao: row.versao,
                maxPlayers: row.max_players,
                prize: row.prize,
                state: row.state,
                panelMessageId: row.panel_message_id,
                categoryId: row.category_id,
                players: row.players || [],
                bracketData: row.bracket_data,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            };
        } catch (error) {
            console.error(`Erro ao buscar torneio ${tournamentId}:`, error.message);
            return null;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const tournaments = readJSON(JSON_FILES.tournaments, {});
        return tournaments[tournamentId] || null;
    }
}

async function updateTournament(tournamentId, updates) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const current = await client.query('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
            
            if (current.rows.length === 0) {
                console.error(`Torneio ${tournamentId} não encontrado para atualização`);
                return;
            }

            const fields = [];
            const values = [];
            let paramIndex = 1;

            const fieldMap = {
                state: 'state',
                panelMessageId: 'panel_message_id',
                categoryId: 'category_id',
                players: 'players',
                bracketData: 'bracket_data'
            };

            for (const [key, dbField] of Object.entries(fieldMap)) {
                if (updates[key] !== undefined) {
                    fields.push(`${dbField} = $${paramIndex}`);
                    if (key === 'players' || key === 'bracketData') {
                        values.push(JSON.stringify(updates[key]));
                    } else {
                        values.push(updates[key]);
                    }
                    paramIndex++;
                }
            }

            if (fields.length === 0) return;

            fields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(tournamentId);

            const query = `UPDATE tournaments SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
            await client.query(query, values);
        } catch (error) {
            console.error(`Erro ao atualizar torneio ${tournamentId}:`, error.message);
            throw error;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const tournaments = readJSON(JSON_FILES.tournaments, {});
        if (tournaments[tournamentId]) {
            Object.assign(tournaments[tournamentId], updates, { updatedAt: new Date().toISOString() });
            writeJSON(JSON_FILES.tournaments, tournaments);
        }
    }
}

async function deleteTournament(tournamentId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
        } catch (error) {
            console.error(`Erro ao deletar torneio ${tournamentId}:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const tournaments = readJSON(JSON_FILES.tournaments, {});
        delete tournaments[tournamentId];
        writeJSON(JSON_FILES.tournaments, tournaments);
    }
}

async function listOpenTournamentsByGuild(guildId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                'SELECT * FROM tournaments WHERE guild_id = $1 AND state = $2',
                [guildId, 'open']
            );

            return result.rows.map(row => ({
                id: row.id,
                guildId: row.guild_id,
                channelId: row.channel_id,
                creatorId: row.creator_id,
                mode: row.mode,
                jogo: row.jogo,
                versao: row.versao,
                maxPlayers: row.max_players,
                prize: row.prize,
                state: row.state,
                panelMessageId: row.panel_message_id,
                categoryId: row.category_id,
                players: row.players || [],
                bracketData: row.bracket_data,
                createdAt: row.created_at
            }));
        } catch (error) {
            console.error(`Erro ao listar torneios abertos ${guildId}:`, error.message);
            return [];
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const tournaments = readJSON(JSON_FILES.tournaments, {});
        return Object.values(tournaments)
            .filter(t => t.guildId === guildId && t.state === 'open');
    }
}

async function countActiveTournaments() {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query("SELECT COUNT(*) FROM tournaments WHERE state IN ('open', 'running')");
            return parseInt(result.rows[0].count);
        } catch (error) {
            console.error('Erro ao contar torneios ativos:', error.message);
            return 0;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const tournaments = readJSON(JSON_FILES.tournaments, {});
        return Object.values(tournaments).filter(t => t.state === 'open' || t.state === 'running').length;
    }
}

function isUsingPostgres() {
    return usePostgres;
}

module.exports = {
    initDatabase,
    getPool,
    isUsingPostgres,
    readConfig,
    writeConfig,
    getSimulador,
    saveSimulador,
    updateRankGlobal,
    updateRankLocal,
    getRankGlobal,
    getRankLocal,
    isUserBanned,
    isUserBannedInGuild,
    banUser,
    unbanUser,
    isGuildBanned,
    createTournament,
    getTournamentById,
    updateTournament,
    deleteTournament,
    listOpenTournamentsByGuild,
    countActiveTournaments
};
