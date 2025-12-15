
// guildCreate.js - Evento quando o bot entra em um servidor
const { isGuildBanned } = require('../utils/database');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    name: 'guildCreate',
    async execute(guild) {
        console.log(`➕ Bot adicionado ao servidor: ${guild.name} (ID: ${guild.id})`);

        const emojis = getEmojis(guild.client);

        // Verifica se o servidor está banido
        const isBanned = await isGuildBanned(guild.id);
        
        if (isBanned) {
            console.log(`⚠️ Servidor ${guild.name} está banido. Saindo...`);
            
            try {
                const owner = await guild.fetchOwner();
                await owner.send(`${emojis.negative} Este servidor está banido de usar este bot.`);
            } catch (error) {
                console.log('Não foi possível enviar mensagem ao dono do servidor');
            }

            await guild.leave();
            return;
        }

        // Tenta enviar mensagem de boas-vindas
        try {
            const channel = guild.systemChannel || guild.channels.cache.find(ch => 
                ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages')
            );

            if (channel) {
                await channel.send({
                    embeds: [{
                        color: 0xFF0000,
                        title: `${emojis.fogo} Bot de Torneios Ativado!`,
                        description: `Obrigado por me adicionar!\n\n${emojis.pergaminhopixel} Use \`/setup\` para configurar o cargo que pode criar torneios.\n${emojis.trofeupixel} Use \`/simulador1v1\`, \`/simulador2v2\`, etc para criar torneios.`,
                        timestamp: new Date()
                    }]
                });
            }
        } catch (error) {
            console.log('Não foi possível enviar mensagem de boas-vindas');
        }
    }
};
