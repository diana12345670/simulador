
// migrate-to-db.js - Migra dados JSON para Replit Database
const { readJSON } = require('./utils/jsonDB');
const { writeDB, DB_KEYS } = require('./utils/database');
const path = require('path');
const fs = require('fs');

async function migrate() {
    console.log('🔄 Iniciando migração para Replit Database...\n');

    try {
        // Migra config.json
        const configPath = path.join(__dirname, 'data/config.json');
        if (fs.existsSync(configPath)) {
            const config = readJSON(configPath, {});
            await writeDB(DB_KEYS.CONFIG, config);
            console.log('✅ Config migrado');
        }

        // Migra simuladores.json
        const simuladoresPath = path.join(__dirname, 'data/simuladores.json');
        if (fs.existsSync(simuladoresPath)) {
            const simuladores = readJSON(simuladoresPath, {});
            await writeDB(DB_KEYS.SIMULADORES, simuladores);
            console.log('✅ Simuladores migrados');
        }

        // Migra bans.json
        const bansPath = path.join(__dirname, 'data/bans.json');
        if (fs.existsSync(bansPath)) {
            const bans = readJSON(bansPath, {});
            await writeDB(DB_KEYS.BANS, bans);
            console.log('✅ Bans migrados');
        }

        // Migra rank_global.json
        const rankGlobalPath = path.join(__dirname, 'data/rank_global.json');
        if (fs.existsSync(rankGlobalPath)) {
            const rankGlobal = readJSON(rankGlobalPath, {});
            await writeDB(DB_KEYS.RANK_GLOBAL, rankGlobal);
            console.log('✅ Rank global migrado');
        }

        // Migra servers_banidos.json
        const serversBanidosPath = path.join(__dirname, 'data/servers_banidos.json');
        if (fs.existsSync(serversBanidosPath)) {
            const serversBanidos = readJSON(serversBanidosPath, {});
            await writeDB(DB_KEYS.SERVERS_BANIDOS, serversBanidos);
            console.log('✅ Servidores banidos migrados');
        }

        // Migra rank_local
        const rankLocalDir = path.join(__dirname, 'data/rank_local');
        if (fs.existsSync(rankLocalDir)) {
            const files = fs.readdirSync(rankLocalDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                const guildId = file.replace('.json', '');
                const rankLocal = readJSON(path.join(rankLocalDir, file), {});
                const key = `${DB_KEYS.RANK_LOCAL_PREFIX}${guildId}`;
                await writeDB(key, rankLocal);
                console.log(`✅ Rank local migrado: ${guildId}`);
            }
        }

        console.log('\n🎉 Migração concluída com sucesso!');
        console.log('💡 Os arquivos JSON antigos podem ser removidos da pasta data/');
        
    } catch (error) {
        console.error('❌ Erro durante migração:', error);
        process.exit(1);
    }
}

migrate();
