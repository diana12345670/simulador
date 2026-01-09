// utils/lang.js - obtém linguagem da guild com fallback
const { readConfig } = require('./database');

async function getGuildLanguage(guildId) {
    try {
        const cfg = await readConfig('guild_config', {});
        console.log(`🌍 DEBUG LANG: Configuração completa:`, JSON.stringify(cfg, null, 2));
        console.log(`🌍 DEBUG LANG: Guild ${guildId} - Config encontrada:`, cfg[guildId]);
        
        if (cfg[guildId]?.language) {
            console.log(`🌍 DEBUG LANG: Guild ${guildId} - Idioma retornado: ${cfg[guildId].language}`);
            return cfg[guildId].language;
        }
    } catch (e) {
        console.error(`🌍 DEBUG LANG: Erro ao ler configuração:`, e);
    }
    console.log(`🌍 DEBUG LANG: Guild ${guildId} - Usando fallback 'pt'`);
    return 'pt';
}

module.exports = { getGuildLanguage };
