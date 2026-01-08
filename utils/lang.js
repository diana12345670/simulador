// utils/lang.js - obtém linguagem da guild com fallback
const { readConfig } = require('./database');

async function getGuildLanguage(guildId) {
    try {
        const cfg = await readConfig('guild_config', {});
        if (cfg[guildId]?.language) return cfg[guildId].language;
    } catch (e) {}
    return 'en';
}

module.exports = { getGuildLanguage };
