// ready.js - Evento disparado quando o bot está online
const { REST, Routes } = require('discord.js');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Bot online como ${client.user.tag}`);
        console.log(`📊 Servidores: ${client.guilds.cache.size}`);
        console.log(`👥 Usuários: ${client.users.cache.size}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Define status do bot
        client.user.setPresence({
            activities: [{ name: 'Torneios | /setup' }],
            status: 'online'
        });

        // Registra comandos automaticamente na API do Discord
        try {
            console.log('🔄 Registrando comandos slash no Discord...');
            
            const commands = [];
            for (const [, command] of client.commands) {
                commands.push(command.data.toJSON());
            }

            const rest = new REST().setToken(process.env.BOT_TOKEN);
            
            await rest.put(
                Routes.applicationCommands(process.env.APPLICATION_ID),
                { body: commands }
            );

            console.log(`✅ ${commands.length} comandos registrados com sucesso!`);
        } catch (error) {
            console.error('❌ Erro ao registrar comandos:', error);
        }
    }
};
