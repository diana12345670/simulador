
// guildCreate.js - Evento quando o bot entra em um servidor
const { isGuildBanned } = require('../utils/database');

module.exports = {
    name: 'guildCreate',
    async execute(guild) {
        console.log(`➕ Bot adicionado ao servidor: ${guild.name} (ID: ${guild.id})`);

        // Verifica se o servidor está banido
        const isBanned = await isGuildBanned(guild.id);
        
        if (isBanned) {
            console.log(`⚠️ Servidor ${guild.name} está banido. Saindo...`);
            
            try {
                const owner = await guild.fetchOwner();
                await owner.send('<:negative:1442668040465682643> Este servidor está banido de usar este bot.');
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
                        title: '<:fogo:1442667877332422847> Bot de Torneios Ativado!',
                        description: 'Obrigado por me adicionar!\n\n<:pergaminhopixel:1442668033242959963> Use `/setup` para configurar o cargo que pode criar torneios.\n<:trofeupixel:1442668024891969588> Use `/simulador1v1`, `/simulador2v2`, etc para criar torneios.',
                        timestamp: new Date()
                    }]
                });
            }
        } catch (error) {
            console.log('Não foi possível enviar mensagem de boas-vindas');
        }
    }
};
