// ready.js - Evento disparado quando o bot está online
const { getBotNote } = require('../utils/database');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        const botName = client.botConfig ? client.botConfig.name : 'Bot';
        
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`✅ [${botName}] Online como ${client.user.tag}`);
        console.log(`📊 [${botName}] Servidores: ${client.guilds.cache.size}`);
        console.log(`👥 [${botName}] Usuários: ${client.users.cache.size}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        const savedNote = await getBotNote();
        const activityName = savedNote || 'Torneios | /setup';

        client.user.setPresence({
            activities: [{ name: activityName, type: savedNote ? 4 : 0 }],
            status: 'dnd'
        });

        if (savedNote) {
            console.log(`📝 Nota carregada do banco: "${savedNote}"`);
        }
    }
};
