
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
    tournaments: path.join(DATA_DIR, 'tournaments.json'),
    players: path.join(DATA_DIR, 'players.json'),
    match_history: path.join(DATA_DIR, 'match_history.json'),
    shop_catalog: path.join(DATA_DIR, 'shop_catalog.json')
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
                    counted_in_stats BOOLEAN DEFAULT FALSE,
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

            await client.query(`
                CREATE TABLE IF NOT EXISTS live_rank_panels (
                    id SERIAL PRIMARY KEY,
                    guild_id VARCHAR(50) NOT NULL,
                    channel_id VARCHAR(50) NOT NULL,
                    message_id VARCHAR(50) NOT NULL,
                    tipo VARCHAR(20) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS server_stats (
                    guild_id VARCHAR(50) PRIMARY KEY,
                    simulators_created INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS players (
                    user_id VARCHAR(50) PRIMARY KEY,
                    coins INTEGER DEFAULT 0,
                    total_wins INTEGER DEFAULT 0,
                    total_losses INTEGER DEFAULT 0,
                    current_streak INTEGER DEFAULT 0,
                    best_streak INTEGER DEFAULT 0,
                    wins_vs_top10 INTEGER DEFAULT 0,
                    titles_owned JSONB DEFAULT '[]'::jsonb,
                    banners_owned JSONB DEFAULT '[]'::jsonb,
                    roles_owned JSONB DEFAULT '[]'::jsonb,
                    equipped_title VARCHAR(100),
                    equipped_banner VARCHAR(100),
                    achievements JSONB DEFAULT '[]'::jsonb,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS match_history (
                    id SERIAL PRIMARY KEY,
                    simulator_id VARCHAR(100) NOT NULL,
                    guild_id VARCHAR(50) NOT NULL,
                    winner_id VARCHAR(50) NOT NULL,
                    loser_ids JSONB NOT NULL,
                    mode VARCHAR(20) NOT NULL,
                    jogo VARCHAR(100),
                    was_vs_top10 BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query('CREATE INDEX IF NOT EXISTS idx_players_coins ON players(coins DESC)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_match_history_winner ON match_history(winner_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_rank_global_points ON rank_global(points DESC)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_rank_local_guild_points ON rank_local(guild_id, points DESC)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_tournaments_guild ON tournaments(guild_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_tournaments_state ON tournaments(state)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_live_rank_panels_guild ON live_rank_panels(guild_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_server_stats_simulators ON server_stats(simulators_created DESC)');

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
    readJSON(JSON_FILES.players, {});
    readJSON(JSON_FILES.match_history, []);
    
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
        max_players, prize, panel_message_id, category_id, players, bracket_data,
        modoJogo, teamSelection, startMode, playersPerTeam, totalTeams, teamsData
    } = tournamentData;

    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            
            await client.query(`
                ALTER TABLE tournaments 
                ADD COLUMN IF NOT EXISTS modo_jogo VARCHAR(100),
                ADD COLUMN IF NOT EXISTS team_selection VARCHAR(20),
                ADD COLUMN IF NOT EXISTS start_mode VARCHAR(20) DEFAULT 'automatico',
                ADD COLUMN IF NOT EXISTS players_per_team INTEGER,
                ADD COLUMN IF NOT EXISTS total_teams INTEGER,
                ADD COLUMN IF NOT EXISTS teams_data JSONB,
                ADD COLUMN IF NOT EXISTS counted_in_stats BOOLEAN DEFAULT FALSE
            `).catch(() => {});
            
            await client.query(`
                INSERT INTO tournaments (
                    id, guild_id, channel_id, creator_id, mode, jogo, versao,
                    max_players, prize, panel_message_id, category_id, players, bracket_data,
                    modo_jogo, team_selection, start_mode, players_per_team, total_teams, teams_data, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP)
            `, [
                id, guild_id, channel_id, creator_id, mode, jogo, versao,
                max_players, prize || 'Nenhum', panel_message_id, category_id,
                JSON.stringify(players || []), bracket_data ? JSON.stringify(bracket_data) : null,
                modoJogo, teamSelection || 'aleatorio', startMode || 'automatico', playersPerTeam, totalTeams,
                teamsData ? JSON.stringify(teamsData) : null
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
            modoJogo: modoJogo || mode,
            maxPlayers: max_players,
            teamSelection: teamSelection || 'aleatorio',
            startMode: startMode || 'automatico',
            playersPerTeam: playersPerTeam,
            totalTeams: totalTeams,
            teamsData: teamsData || {},
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
                modoJogo: row.modo_jogo,
                maxPlayers: row.max_players,
                teamSelection: row.team_selection || 'aleatorio',
                startMode: row.start_mode || 'automatico',
                playersPerTeam: row.players_per_team,
                totalTeams: row.total_teams,
                teamsData: row.teams_data || {},
                prize: row.prize,
                state: row.state,
                panelMessageId: row.panel_message_id,
                categoryId: row.category_id,
                players: row.players || [],
                bracketData: row.bracket_data,
                countedInStats: row.counted_in_stats || false,
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
                bracketData: 'bracket_data',
                teamsData: 'teams_data',
                counted_in_stats: 'counted_in_stats'
            };

            for (const [key, dbField] of Object.entries(fieldMap)) {
                if (updates[key] !== undefined) {
                    fields.push(`${dbField} = $${paramIndex}`);
                    if (key === 'players' || key === 'bracketData' || key === 'teamsData') {
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
                modoJogo: row.modo_jogo,
                maxPlayers: row.max_players,
                teamSelection: row.team_selection || 'aleatorio',
                startMode: row.start_mode || 'automatico',
                playersPerTeam: row.players_per_team,
                totalTeams: row.total_teams,
                teamsData: row.teams_data || {},
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

async function getRunningTournamentByGuild(guildId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                "SELECT * FROM tournaments WHERE guild_id = $1 AND state = 'running' ORDER BY created_at DESC LIMIT 1",
                [guildId]
            );
            
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
                modoJogo: row.modo_jogo,
                maxPlayers: row.max_players,
                teamSelection: row.team_selection || 'aleatorio',
                playersPerTeam: row.players_per_team,
                totalTeams: row.total_teams,
                teamsData: row.teams_data || {},
                prize: row.prize,
                state: row.state,
                panelMessageId: row.panel_message_id,
                categoryId: row.category_id,
                players: row.players || [],
                bracketData: row.bracket_data,
                createdAt: row.created_at
            };
        } catch (error) {
            console.error(`Erro ao buscar torneio em andamento ${guildId}:`, error.message);
            return null;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const tournaments = readJSON(JSON_FILES.tournaments, {});
        const runningTournaments = Object.values(tournaments)
            .filter(t => t.guildId === guildId && t.state === 'running')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return runningTournaments.length > 0 ? runningTournaments[0] : null;
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

async function addLiveRankPanel(guildId, channelId, messageId, tipo) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(
                'INSERT INTO live_rank_panels (guild_id, channel_id, message_id, tipo) VALUES ($1, $2, $3, $4)',
                [guildId, channelId, messageId, tipo]
            );
        } catch (error) {
            console.error(`Erro ao adicionar painel ao vivo:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const panels = readJSON(path.join(DATA_DIR, 'live_rank_panels.json'), []);
        panels.push({ guildId, channelId, messageId, tipo, createdAt: new Date().toISOString() });
        writeJSON(path.join(DATA_DIR, 'live_rank_panels.json'), panels);
    }
}

async function removeLiveRankPanel(guildId, messageId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(
                'DELETE FROM live_rank_panels WHERE guild_id = $1 AND message_id = $2',
                [guildId, messageId]
            );
        } catch (error) {
            console.error(`Erro ao remover painel ao vivo:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        let panels = readJSON(path.join(DATA_DIR, 'live_rank_panels.json'), []);
        panels = panels.filter(p => !(p.guildId === guildId && p.messageId === messageId));
        writeJSON(path.join(DATA_DIR, 'live_rank_panels.json'), panels);
    }
}

async function getLiveRankPanelsByGuild(guildId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                'SELECT * FROM live_rank_panels WHERE guild_id = $1',
                [guildId]
            );
            return result.rows.map(row => ({
                id: row.id,
                guildId: row.guild_id,
                channelId: row.channel_id,
                messageId: row.message_id,
                tipo: row.tipo,
                createdAt: row.created_at
            }));
        } catch (error) {
            console.error(`Erro ao buscar painéis ao vivo:`, error.message);
            return [];
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const panels = readJSON(path.join(DATA_DIR, 'live_rank_panels.json'), []);
        return panels.filter(p => p.guildId === guildId);
    }
}

async function getAllLiveRankPanels() {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query('SELECT * FROM live_rank_panels');
            return result.rows.map(row => ({
                id: row.id,
                guildId: row.guild_id,
                channelId: row.channel_id,
                messageId: row.message_id,
                tipo: row.tipo,
                createdAt: row.created_at
            }));
        } catch (error) {
            console.error(`Erro ao buscar todos painéis ao vivo:`, error.message);
            return [];
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        return readJSON(path.join(DATA_DIR, 'live_rank_panels.json'), []);
    }
}

async function countLiveRankPanelsByGuild(guildId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                'SELECT COUNT(*) FROM live_rank_panels WHERE guild_id = $1',
                [guildId]
            );
            return parseInt(result.rows[0].count);
        } catch (error) {
            console.error(`Erro ao contar painéis ao vivo:`, error.message);
            return 0;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const panels = readJSON(path.join(DATA_DIR, 'live_rank_panels.json'), []);
        return panels.filter(p => p.guildId === guildId).length;
    }
}

async function incrementServerSimulators(guildId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(`
                INSERT INTO server_stats (guild_id, simulators_created, updated_at) 
                VALUES ($1, 1, CURRENT_TIMESTAMP)
                ON CONFLICT (guild_id) DO UPDATE SET 
                    simulators_created = server_stats.simulators_created + 1,
                    updated_at = CURRENT_TIMESTAMP
            `, [guildId]);
        } catch (error) {
            console.error(`Erro ao incrementar simuladores do servidor ${guildId}:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const statsFile = path.join(DATA_DIR, 'server_stats.json');
        const stats = readJSON(statsFile, {});
        if (!stats[guildId]) {
            stats[guildId] = { simulators_created: 0 };
        }
        stats[guildId].simulators_created += 1;
        writeJSON(statsFile, stats);
    }
}

async function getTopServers(limit = 3) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                'SELECT guild_id, simulators_created FROM server_stats ORDER BY simulators_created DESC LIMIT $1',
                [limit]
            );
            return result.rows.map(row => ({
                guildId: row.guild_id,
                simulatorsCreated: row.simulators_created
            }));
        } catch (error) {
            console.error('Erro ao buscar top servidores:', error.message);
            return [];
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const statsFile = path.join(DATA_DIR, 'server_stats.json');
        const stats = readJSON(statsFile, {});
        const sorted = Object.entries(stats)
            .map(([guildId, data]) => ({ guildId, simulatorsCreated: data.simulators_created || 0 }))
            .sort((a, b) => b.simulatorsCreated - a.simulatorsCreated)
            .slice(0, limit);
        return sorted;
    }
}

async function getOpenTournamentByChannel(channelId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                "SELECT * FROM tournaments WHERE channel_id = $1 AND state = 'open' ORDER BY created_at DESC LIMIT 1",
                [channelId]
            );
            
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
                modoJogo: row.modo_jogo,
                maxPlayers: row.max_players,
                teamSelection: row.team_selection || 'aleatorio',
                playersPerTeam: row.players_per_team,
                totalTeams: row.total_teams,
                teamsData: row.teams_data || {},
                prize: row.prize,
                state: row.state,
                panelMessageId: row.panel_message_id,
                categoryId: row.category_id,
                players: row.players || [],
                bracketData: row.bracket_data,
                createdAt: row.created_at
            };
        } catch (error) {
            console.error(`Erro ao buscar torneio aberto no canal ${channelId}:`, error.message);
            return null;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const tournaments = readJSON(JSON_FILES.tournaments, {});
        const openTournaments = Object.values(tournaments)
            .filter(t => t.channelId === channelId && t.state === 'open')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return openTournaments.length > 0 ? openTournaments[0] : null;
    }
}

async function getAllTournaments() {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query("SELECT * FROM tournaments WHERE state IN ('open', 'running')");
            
            return result.rows.map(row => ({
                id: row.id,
                guildId: row.guild_id,
                channelId: row.channel_id,
                creatorId: row.creator_id,
                mode: row.mode,
                jogo: row.jogo,
                versao: row.versao,
                modoJogo: row.modo_jogo,
                maxPlayers: row.max_players,
                teamSelection: row.team_selection || 'aleatorio',
                playersPerTeam: row.players_per_team,
                totalTeams: row.total_teams,
                teamsData: row.teams_data || {},
                prize: row.prize,
                state: row.state,
                panelMessageId: row.panel_message_id,
                categoryId: row.category_id,
                players: row.players || [],
                bracketData: row.bracket_data,
                createdAt: row.created_at
            }));
        } catch (error) {
            console.error('Erro ao buscar todos torneios:', error.message);
            return [];
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const tournaments = readJSON(JSON_FILES.tournaments, {});
        return Object.values(tournaments).filter(t => t.state === 'open' || t.state === 'running');
    }
}

const DEFAULT_PLAYER = {
    coins: 0,
    totalWins: 0,
    totalLosses: 0,
    currentStreak: 0,
    bestStreak: 0,
    winsVsTop10: 0,
    titlesOwned: [],
    bannersOwned: [],
    rolesOwned: [],
    equippedTitle: null,
    equippedBanner: null,
    achievements: []
};

async function getPlayer(userId) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query('SELECT * FROM players WHERE user_id = $1', [userId]);
            if (result.rows.length === 0) {
                return { ...DEFAULT_PLAYER, userId };
            }
            const row = result.rows[0];
            return {
                userId: row.user_id,
                coins: row.coins || 0,
                totalWins: row.total_wins || 0,
                totalLosses: row.total_losses || 0,
                currentStreak: row.current_streak || 0,
                bestStreak: row.best_streak || 0,
                winsVsTop10: row.wins_vs_top10 || 0,
                titlesOwned: row.titles_owned || [],
                bannersOwned: row.banners_owned || [],
                rolesOwned: row.roles_owned || [],
                equippedTitle: row.equipped_title,
                equippedBanner: row.equipped_banner,
                achievements: row.achievements || []
            };
        } catch (error) {
            console.error(`Erro ao buscar jogador ${userId}:`, error.message);
            return { ...DEFAULT_PLAYER, userId };
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const players = readJSON(JSON_FILES.players, {});
        return players[userId] || { ...DEFAULT_PLAYER, userId };
    }
}

async function updatePlayer(userId, data) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const existing = await client.query('SELECT user_id FROM players WHERE user_id = $1', [userId]);
            
            if (existing.rows.length === 0) {
                await client.query(`
                    INSERT INTO players (user_id, coins, total_wins, total_losses, current_streak, best_streak, 
                        wins_vs_top10, titles_owned, banners_owned, roles_owned, equipped_title, equipped_banner, achievements)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `, [
                    userId,
                    data.coins || 0,
                    data.totalWins || 0,
                    data.totalLosses || 0,
                    data.currentStreak || 0,
                    data.bestStreak || 0,
                    data.winsVsTop10 || 0,
                    JSON.stringify(data.titlesOwned || []),
                    JSON.stringify(data.bannersOwned || []),
                    JSON.stringify(data.rolesOwned || []),
                    data.equippedTitle || null,
                    data.equippedBanner || null,
                    JSON.stringify(data.achievements || [])
                ]);
            } else {
                const updates = [];
                const values = [userId];
                let idx = 2;
                
                if (data.coins !== undefined) { updates.push(`coins = $${idx++}`); values.push(data.coins); }
                if (data.totalWins !== undefined) { updates.push(`total_wins = $${idx++}`); values.push(data.totalWins); }
                if (data.totalLosses !== undefined) { updates.push(`total_losses = $${idx++}`); values.push(data.totalLosses); }
                if (data.currentStreak !== undefined) { updates.push(`current_streak = $${idx++}`); values.push(data.currentStreak); }
                if (data.bestStreak !== undefined) { updates.push(`best_streak = $${idx++}`); values.push(data.bestStreak); }
                if (data.winsVsTop10 !== undefined) { updates.push(`wins_vs_top10 = $${idx++}`); values.push(data.winsVsTop10); }
                if (data.titlesOwned !== undefined) { updates.push(`titles_owned = $${idx++}`); values.push(JSON.stringify(data.titlesOwned)); }
                if (data.bannersOwned !== undefined) { updates.push(`banners_owned = $${idx++}`); values.push(JSON.stringify(data.bannersOwned)); }
                if (data.rolesOwned !== undefined) { updates.push(`roles_owned = $${idx++}`); values.push(JSON.stringify(data.rolesOwned)); }
                if (data.equippedTitle !== undefined) { updates.push(`equipped_title = $${idx++}`); values.push(data.equippedTitle); }
                if (data.equippedBanner !== undefined) { updates.push(`equipped_banner = $${idx++}`); values.push(data.equippedBanner); }
                if (data.achievements !== undefined) { updates.push(`achievements = $${idx++}`); values.push(JSON.stringify(data.achievements)); }
                
                updates.push('updated_at = CURRENT_TIMESTAMP');
                
                if (updates.length > 1) {
                    await client.query(`UPDATE players SET ${updates.join(', ')} WHERE user_id = $1`, values);
                }
            }
        } catch (error) {
            console.error(`Erro ao atualizar jogador ${userId}:`, error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const players = readJSON(JSON_FILES.players, {});
        players[userId] = { ...(players[userId] || DEFAULT_PLAYER), ...data, userId };
        writeJSON(JSON_FILES.players, players);
    }
}

async function addCoins(userId, amount) {
    const player = await getPlayer(userId);
    const newCoins = (player.coins || 0) + amount;
    await updatePlayer(userId, { coins: newCoins });
    return newCoins;
}

async function removeCoins(userId, amount) {
    const player = await getPlayer(userId);
    const currentCoins = player.coins || 0;
    if (currentCoins < amount) return false;
    await updatePlayer(userId, { coins: currentCoins - amount });
    return true;
}

async function addItemToInventory(userId, itemType, itemId) {
    const player = await getPlayer(userId);
    let field;
    if (itemType === 'banner') field = 'bannersOwned';
    else if (itemType === 'title') field = 'titlesOwned';
    else if (itemType === 'role') field = 'rolesOwned';
    else return false;
    
    const owned = player[field] || [];
    if (!owned.includes(itemId)) {
        owned.push(itemId);
        await updatePlayer(userId, { [field]: owned });
    }
    return true;
}

async function equipItem(userId, itemType, itemId) {
    const player = await getPlayer(userId);
    let ownedField, equippedField;
    
    if (itemType === 'banner') {
        ownedField = 'bannersOwned';
        equippedField = 'equippedBanner';
    } else if (itemType === 'title') {
        ownedField = 'titlesOwned';
        equippedField = 'equippedTitle';
    } else {
        return false;
    }
    
    const owned = player[ownedField] || [];
    if (!owned.includes(itemId)) return false;
    
    await updatePlayer(userId, { [equippedField]: itemId });
    return true;
}

async function recordMatchResult(simulatorId, guildId, winnerId, loserIds, mode, jogo) {
    const top10 = await getRankGlobal(10);
    const top10Ids = top10.map(p => p.user_id);
    const wasVsTop10 = loserIds.some(id => top10Ids.includes(id));
    
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(`
                INSERT INTO match_history (simulator_id, guild_id, winner_id, loser_ids, mode, jogo, was_vs_top10)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [simulatorId, guildId, winnerId, JSON.stringify(loserIds), mode, jogo, wasVsTop10]);
        } catch (error) {
            console.error('Erro ao registrar partida:', error.message);
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const history = readJSON(JSON_FILES.match_history, []);
        history.push({
            simulatorId,
            guildId,
            winnerId,
            loserIds,
            mode,
            jogo,
            wasVsTop10,
            createdAt: new Date().toISOString()
        });
        writeJSON(JSON_FILES.match_history, history);
    }
    
    const winner = await getPlayer(winnerId);
    const newStreak = (winner.currentStreak || 0) + 1;
    const newBestStreak = Math.max(newStreak, winner.bestStreak || 0);
    const newWins = (winner.totalWins || 0) + 1;
    const newWinsVsTop10 = (winner.winsVsTop10 || 0) + (wasVsTop10 ? 1 : 0);
    
    await updatePlayer(winnerId, {
        totalWins: newWins,
        currentStreak: newStreak,
        bestStreak: newBestStreak,
        winsVsTop10: newWinsVsTop10,
        coins: (winner.coins || 0) + 50
    });
    
    for (const loserId of loserIds) {
        const loser = await getPlayer(loserId);
        await updatePlayer(loserId, {
            totalLosses: (loser.totalLosses || 0) + 1,
            currentStreak: 0,
            coins: (loser.coins || 0) + 10
        });
    }
    
    return { wasVsTop10, coinsEarned: 50 };
}

async function getPlayerMatchHistory(userId, limit = 10) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(`
                SELECT * FROM match_history 
                WHERE winner_id = $1 OR $1 = ANY(SELECT jsonb_array_elements_text(loser_ids))
                ORDER BY created_at DESC LIMIT $2
            `, [userId, limit]);
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar histórico:', error.message);
            return [];
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const history = readJSON(JSON_FILES.match_history, []);
        return history
            .filter(m => m.winnerId === userId || m.loserIds.includes(userId))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
    }
}

function getShopCatalog() {
    const catalogFromFile = readJSON(JSON_FILES.shop_catalog, null);
    if (catalogFromFile && catalogFromFile.banners && catalogFromFile.banners.length > 0) {
        return catalogFromFile;
    }
    
    // Catálogo embutido como fallback para ambientes onde o arquivo não existe
    return {
        "banners": [
            { "id": "banner_ocean", "name": "Ondas do Oceano", "description": "Banner sereno com ondas azuis cristalinas", "price": 500, "rarity": "comum", "assetUrl": "/banners/ocean_waves_gaming_banner.png", "color": "#1E90FF" },
            { "id": "banner_brazil", "name": "Brasil Gaming", "description": "Banner com as cores vibrantes do Brasil", "price": 750, "rarity": "comum", "assetUrl": "/banners/brazilian_gaming_banner.png", "color": "#00BF63" },
            { "id": "banner_stumble", "name": "Stumble Party", "description": "Banner colorido estilo festa de obstáculos", "price": 800, "rarity": "comum", "assetUrl": "/banners/stumble_guys_style_banner.png", "color": "#FF69B4" },
            { "id": "banner_galaxy", "name": "Galáxia Espiral", "description": "Um banner cósmico com estrelas e nebulosas", "price": 1500, "rarity": "raro", "assetUrl": "/banners/galaxy_space_gaming_banner.png", "color": "#9400D3" },
            { "id": "banner_neon", "name": "Neon City", "description": "Banner cyberpunk com luzes neon brilhantes", "price": 1500, "rarity": "raro", "assetUrl": "/banners/neon_city_gaming_banner.png", "color": "#FF1493" },
            { "id": "banner_tropical", "name": "Brasil Tropical", "description": "Banner tropical com visual de pôr do sol brasileiro", "price": 1800, "rarity": "raro", "assetUrl": "/banners/brazil_tropical_gaming_banner.png", "color": "#FF6B35" },
            { "id": "banner_synthwave", "name": "Synthwave Retrô", "description": "Banner nostálgico estilo anos 80", "price": 2000, "rarity": "raro", "assetUrl": "/banners/synthwave_retro_gaming_banner.png", "color": "#FF00FF" },
            { "id": "banner_samurai", "name": "Samurai Lendário", "description": "Banner épico com estética de guerreiro samurai", "price": 3500, "rarity": "epico", "assetUrl": "/banners/samurai_gaming_banner.png", "color": "#DC143C" },
            { "id": "banner_storm", "name": "Tempestade Elétrica", "description": "Banner poderoso com raios e energia", "price": 4000, "rarity": "epico", "assetUrl": "/banners/storm_lightning_gaming_banner.png", "color": "#8B00FF" },
            { "id": "banner_champion", "name": "Campeão Supremo", "description": "Banner lendário dourado para os melhores competidores", "price": 7500, "rarity": "lendario", "assetUrl": "/banners/champion_gold_gaming_banner.png", "color": "#FFD700" }
        ],
        "titles": [
            { "id": "title_warrior", "name": "Guerreiro", "description": "Título de um guerreiro determinado", "price": 300, "rarity": "comum", "display": "« Guerreiro »" },
            { "id": "title_hunter", "name": "Caçador", "description": "Título de um caçador habilidoso", "price": 300, "rarity": "comum", "display": "◆ Caçador ◆" },
            { "id": "title_shadow", "name": "Sombra", "description": "Título misterioso e furtivo", "price": 400, "rarity": "comum", "display": "░ Sombra ░" },
            { "id": "title_veteran", "name": "Veterano", "description": "Título de experiência em batalha", "price": 800, "rarity": "raro", "display": "★ Veterano ★" },
            { "id": "title_ace", "name": "Ás", "description": "Título de um jogador excepcional", "price": 1000, "rarity": "raro", "display": "♠ Ás ♠" },
            { "id": "title_destroyer", "name": "Destruidor", "description": "Título de um jogador implacável", "price": 1200, "rarity": "raro", "display": "✦ Destruidor ✦" },
            { "id": "title_striker", "name": "Artilheiro", "description": "Título para quem sempre acerta o alvo", "price": 1500, "rarity": "raro", "display": "▸ Artilheiro ◂" },
            { "id": "title_elite", "name": "Elite", "description": "Título de jogador de elite", "price": 2000, "rarity": "epico", "display": "◈ Elite ◈" },
            { "id": "title_mastermind", "name": "Mente Brilhante", "description": "Título de estrategista supremo", "price": 2500, "rarity": "epico", "display": "◇ Mente Brilhante ◇" },
            { "id": "title_phantom", "name": "Fantasma", "description": "Título intimidador e misterioso", "price": 2500, "rarity": "epico", "display": "▓ Fantasma ▓" },
            { "id": "title_predator", "name": "Predador", "description": "Título de caçador supremo", "price": 3000, "rarity": "epico", "display": "◀ Predador ▶" },
            { "id": "title_legend", "name": "Lenda", "description": "Título lendário para os melhores", "price": 5000, "rarity": "lendario", "display": "『 Lenda 』" },
            { "id": "title_immortal", "name": "Imortal", "description": "Título de glória eterna", "price": 7500, "rarity": "lendario", "display": "【 Imortal 】" },
            { "id": "title_god", "name": "Divindade", "description": "O título supremo absoluto", "price": 15000, "rarity": "lendario", "display": "《 Divindade 》" }
        ],
        "roles": [
            { "id": "role_bronze", "name": "Cargo Bronze", "description": "Cargo Bronze decorativo", "price": 1000, "rarity": "comum", "color": "#CD7F32" },
            { "id": "role_silver", "name": "Cargo Prata", "description": "Cargo Prata decorativo", "price": 2500, "rarity": "raro", "color": "#C0C0C0" },
            { "id": "role_gold", "name": "Cargo Ouro", "description": "Cargo Ouro decorativo", "price": 5000, "rarity": "epico", "color": "#FFD700" },
            { "id": "role_diamond", "name": "Cargo Diamante", "description": "Cargo Diamante exclusivo", "price": 10000, "rarity": "lendario", "color": "#B9F2FF" }
        ],
        "rarityColors": { "comum": "#9E9E9E", "raro": "#2196F3", "epico": "#9C27B0", "lendario": "#FF9800" },
        "rarityEmojis": { "comum": "⚪", "raro": "🔵", "epico": "🟣", "lendario": "🟠" }
    };
}

async function getTopPlayersByCoins(limit = 10) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query('SELECT * FROM players ORDER BY coins DESC LIMIT $1', [limit]);
            return result.rows.map(row => ({
                userId: row.user_id,
                coins: row.coins,
                totalWins: row.total_wins,
                bestStreak: row.best_streak
            }));
        } catch (error) {
            console.error('Erro ao buscar top jogadores:', error.message);
            return [];
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const players = readJSON(JSON_FILES.players, {});
        return Object.entries(players)
            .map(([id, data]) => ({ userId: id, ...data }))
            .sort((a, b) => (b.coins || 0) - (a.coins || 0))
            .slice(0, limit);
    }
}

async function getBotNote() {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query("SELECT value FROM config WHERE key = 'bot_note'");
            if (result.rows.length > 0) {
                return result.rows[0].value.note || null;
            }
            return null;
        } catch (error) {
            console.error('Erro ao buscar nota do bot:', error.message);
            return null;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const config = readJSON(JSON_FILES.config, {});
        return config.botNote || null;
    }
}

async function setBotNote(note) {
    if (usePostgres && pool) {
        let client;
        try {
            client = await pool.connect();
            await client.query(`
                INSERT INTO config (key, value) VALUES ('bot_note', $1)
                ON CONFLICT (key) DO UPDATE SET value = $1
            `, [JSON.stringify({ note })]);
            return true;
        } catch (error) {
            console.error('Erro ao salvar nota do bot:', error.message);
            return false;
        } finally {
            if (client) try { client.release(); } catch (e) {}
        }
    } else {
        const config = readJSON(JSON_FILES.config, {});
        config.botNote = note;
        writeJSON(JSON_FILES.config, config);
        return true;
    }
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
    getRunningTournamentByGuild,
    getOpenTournamentByChannel,
    getAllTournaments,
    countActiveTournaments,
    addLiveRankPanel,
    removeLiveRankPanel,
    getLiveRankPanelsByGuild,
    getAllLiveRankPanels,
    countLiveRankPanelsByGuild,
    incrementServerSimulators,
    getTopServers,
    getPlayer,
    updatePlayer,
    addCoins,
    removeCoins,
    addItemToInventory,
    equipItem,
    recordMatchResult,
    getPlayerMatchHistory,
    getShopCatalog,
    getTopPlayersByCoins,
    getBotNote,
    setBotNote
};
