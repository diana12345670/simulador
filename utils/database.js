
// database.js - PostgreSQL Database Manager
const { Pool } = require('pg');

// Cria pool de conexões com PostgreSQL
let pool;

function getPool() {
    if (!pool) {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            console.error('❌ DATABASE_URL não encontrada. Crie um PostgreSQL Database no Replit.');
            process.exit(1);
        }
        
        // Usa connection pooler para melhor performance
        const poolUrl = databaseUrl.replace('.us-east-2', '-pooler.us-east-2');
        pool = new Pool({
            connectionString: poolUrl,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        
        console.log('✅ Pool PostgreSQL criado');
    }
    return pool;
}

/**
 * Inicializa tabelas do banco de dados
 */
async function initDatabase() {
    const client = await getPool().connect();
    try {
        // Tabela de configuração
        await client.query(`
            CREATE TABLE IF NOT EXISTS config (
                key VARCHAR(255) PRIMARY KEY,
                value JSONB NOT NULL
            )
        `);

        // Tabela de torneios (simuladores)
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

        // Tabela de simuladores (legado - mantida para compatibilidade)
        await client.query(`
            CREATE TABLE IF NOT EXISTS simuladores (
                user_id VARCHAR(50) PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de bans (globais e locais)
        await client.query(`
            CREATE TABLE IF NOT EXISTS bans (
                user_id VARCHAR(50) NOT NULL,
                guild_id VARCHAR(50) DEFAULT '',
                reason TEXT,
                banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, guild_id)
            )
        `);

        // Tabela de servidores banidos
        await client.query(`
            CREATE TABLE IF NOT EXISTS servers_banidos (
                guild_id VARCHAR(50) PRIMARY KEY,
                reason TEXT,
                banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de ranking global
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

        // Tabela de ranking local (por servidor)
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

        // Índices para melhor performance
        await client.query('CREATE INDEX IF NOT EXISTS idx_rank_global_points ON rank_global(points DESC)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_rank_local_guild_points ON rank_local(guild_id, points DESC)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_tournaments_guild ON tournaments(guild_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_tournaments_state ON tournaments(state)');

        console.log('✅ Tabelas PostgreSQL inicializadas');
    } catch (error) {
        console.error('❌ Erro ao inicializar database:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Lê configuração
 */
async function readConfig(key, defaultValue = {}) {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT value FROM config WHERE key = $1', [key]);
        return result.rows.length > 0 ? result.rows[0].value : defaultValue;
    } catch (error) {
        console.error(`Erro ao ler config ${key}:`, error);
        return defaultValue;
    } finally {
        client.release();
    }
}

/**
 * Escreve configuração
 */
async function writeConfig(key, value) {
    const client = await getPool().connect();
    try {
        await client.query(`
            INSERT INTO config (key, value) 
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = $2
        `, [key, value]);
    } catch (error) {
        console.error(`Erro ao escrever config ${key}:`, error);
    } finally {
        client.release();
    }
}

/**
 * Lê simulador de um usuário
 */
async function getSimulador(userId) {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT data FROM simuladores WHERE user_id = $1', [userId]);
        return result.rows.length > 0 ? result.rows[0].data : null;
    } catch (error) {
        console.error(`Erro ao ler simulador ${userId}:`, error);
        return null;
    } finally {
        client.release();
    }
}

/**
 * Salva simulador de um usuário
 */
async function saveSimulador(userId, data) {
    const client = await getPool().connect();
    try {
        await client.query(`
            INSERT INTO simuladores (user_id, data, updated_at) 
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP
        `, [userId, data]);
    } catch (error) {
        console.error(`Erro ao salvar simulador ${userId}:`, error);
    } finally {
        client.release();
    }
}

/**
 * Atualiza ranking global
 */
async function updateRankGlobal(userId, stats) {
    const client = await getPool().connect();
    try {
        const { wins = 0, losses = 0, draws = 0, points = 0 } = stats;
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
        console.error(`Erro ao atualizar rank global ${userId}:`, error);
    } finally {
        client.release();
    }
}

/**
 * Atualiza ranking local
 */
async function updateRankLocal(guildId, userId, stats) {
    const client = await getPool().connect();
    try {
        const { wins = 0, losses = 0, draws = 0, points = 0 } = stats;
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
        console.error(`Erro ao atualizar rank local ${guildId}/${userId}:`, error);
    } finally {
        client.release();
    }
}

/**
 * Busca ranking global
 */
async function getRankGlobal(limit = 10) {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'SELECT * FROM rank_global ORDER BY points DESC, wins DESC LIMIT $1',
            [limit]
        );
        return result.rows;
    } catch (error) {
        console.error('Erro ao buscar rank global:', error);
        return [];
    } finally {
        client.release();
    }
}

/**
 * Busca ranking local de um servidor
 */
async function getRankLocal(guildId, limit = 10) {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'SELECT * FROM rank_local WHERE guild_id = $1 ORDER BY points DESC, wins DESC LIMIT $2',
            [guildId, limit]
        );
        return result.rows;
    } catch (error) {
        console.error(`Erro ao buscar rank local ${guildId}:`, error);
        return [];
    } finally {
        client.release();
    }
}

/**
 * Verifica se usuário está banido globalmente
 */
async function isUserBanned(userId) {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT 1 FROM bans WHERE user_id = $1 AND guild_id = $2', [userId, '']);
        return result.rows.length > 0;
    } catch (error) {
        console.error(`Erro ao verificar ban ${userId}:`, error);
        return false;
    } finally {
        client.release();
    }
}

/**
 * Verifica se usuário está banido localmente em um servidor
 */
async function isUserBannedInGuild(userId, guildId) {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'SELECT 1 FROM bans WHERE user_id = $1 AND guild_id = $2',
            [userId, guildId]
        );
        return result.rows.length > 0;
    } catch (error) {
        console.error(`Erro ao verificar ban local ${userId}/${guildId}:`, error);
        return false;
    } finally {
        client.release();
    }
}

/**
 * Bane um usuário
 */
async function banUser(userId, reason = 'Não especificado') {
    const client = await getPool().connect();
    try {
        await client.query('INSERT INTO bans (user_id, guild_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, '', reason]);
    } catch (error) {
        console.error(`Erro ao banir ${userId}:`, error);
    } finally {
        client.release();
    }
}

/**
 * Remove ban de um usuário
 */
async function unbanUser(userId) {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM bans WHERE user_id = $1 AND guild_id = $2', [userId, '']);
    } catch (error) {
        console.error(`Erro ao desbanir ${userId}:`, error);
    } finally {
        client.release();
    }
}

/**
 * Verifica se servidor está banido
 */
async function isGuildBanned(guildId) {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT 1 FROM servers_banidos WHERE guild_id = $1', [guildId]);
        return result.rows.length > 0;
    } catch (error) {
        console.error(`Erro ao verificar ban servidor ${guildId}:`, error);
        return false;
    } finally {
        client.release();
    }
}

/**
 * Cria um novo torneio
 */
async function createTournament(tournamentData) {
    const client = await getPool().connect();
    try {
        const {
            id, guild_id, channel_id, creator_id, mode, jogo, versao,
            max_players, prize, panel_message_id, category_id, players, bracket_data
        } = tournamentData;

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
        console.error(`Erro ao criar torneio ${tournamentData.id}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Busca torneio por ID
 */
async function getTournamentById(tournamentId) {
    const client = await getPool().connect();
    try {
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
        console.error(`Erro ao buscar torneio ${tournamentId}:`, error);
        return null;
    } finally {
        client.release();
    }
}

/**
 * Atualiza torneio (merge parcial)
 */
async function updateTournament(tournamentId, updates) {
    const client = await getPool().connect();
    try {
        // Primeiro busca o torneio atual
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
        console.error(`Erro ao atualizar torneio ${tournamentId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Deleta torneio
 */
async function deleteTournament(tournamentId) {
    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
    } catch (error) {
        console.error(`Erro ao deletar torneio ${tournamentId}:`, error);
    } finally {
        client.release();
    }
}

/**
 * Lista torneios abertos de um servidor
 */
async function listOpenTournamentsByGuild(guildId) {
    const client = await getPool().connect();
    try {
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
        console.error(`Erro ao listar torneios abertos ${guildId}:`, error);
        return [];
    } finally {
        client.release();
    }
}

/**
 * Conta simuladores ativos
 */
async function countActiveTournaments() {
    const client = await getPool().connect();
    try {
        const result = await client.query("SELECT COUNT(*) FROM tournaments WHERE state IN ('open', 'running')");
        return parseInt(result.rows[0].count);
    } catch (error) {
        console.error('Erro ao contar torneios ativos:', error);
        return 0;
    } finally {
        client.release();
    }
}

module.exports = {
    initDatabase,
    getPool,
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
