// servidores.js - Comando para o dono listar servidores
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createRedEmbed, createErrorEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servidores')
        .setDescription('[DONO] Lista todos os servidores do bot'),
    
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        
        // Verifica se é o dono do bot
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Apenas o dono do bot pode usar este comando.`)],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guilds = interaction.client.guilds.cache;

        if (guilds.size === 0) {
            return interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} O bot não está em nenhum servidor.`)]
            });
        }

        // Cria lista de servidores (limitado a 10 por mensagem)
        const guildsList = [];
        
        for (const [, guild] of guilds) {
            let inviteUrl = 'Sem permissão para criar invite';
            
            try {
                // Tenta criar um convite
                const channel = guild.channels.cache.find(ch => 
                    ch.type === 0 && ch.permissionsFor(guild.members.me).has('CreateInstantInvite')
                );
                
                if (channel) {
                    const invite = await channel.createInvite({ maxAge: 0, maxUses: 0 });
                    inviteUrl = invite.url;
                }
            } catch (error) {
                // Não conseguiu criar invite
            }

            guildsList.push({
                name: guild.name,
                id: guild.id,
                icon: guild.iconURL() || 'Sem ícone',
                memberCount: guild.memberCount,
                invite: inviteUrl
            });
        }

        // Divide em chunks de 5 servidores por embed
        const chunks = [];
        for (let i = 0; i < guildsList.length; i += 5) {
            chunks.push(guildsList.slice(i, i + 5));
        }

        // Envia primeiro embed
        const firstChunk = chunks[0];
        const fields = firstChunk.map(g => ({
            name: `${g.name} (${g.memberCount} membros)`,
            value: `${emojis.pergaminhopixel} ID: \`${g.id}\`\n${emojis.presentepixel} [Convite](${g.invite})`,
            inline: false
        }));

        const firstEmbed = createRedEmbed({
            title: `${emojis.trofeupixel} Servidores do Bot (${guilds.size} total)`,
            description: `Página 1 de ${chunks.length}`,
            fields: fields,
            timestamp: true
        });

        await interaction.editReply({ embeds: [firstEmbed] });

        // Envia demais embeds se houver
        for (let i = 1; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkFields = chunk.map(g => ({
                name: `${g.name} (${g.memberCount} membros)`,
                value: `${emojis.pergaminhopixel} ID: \`${g.id}\`\n${emojis.presentepixel} [Convite](${g.invite})`,
                inline: false
            }));

            const embed = createRedEmbed({
                description: `Página ${i + 1} de ${chunks.length}`,
                fields: chunkFields,
                timestamp: true
            });

            await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
};
