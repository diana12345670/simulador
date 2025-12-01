// ready.js - Evento disparado quando o bot está online
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

        client.user.setPresence({
            activities: [{ name: 'Torneios | /setup' }],
            status: 'dnd'
        });
    }
};
