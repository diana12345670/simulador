// sair_server.js - Comando para o dono do bot sair de um servidor
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sair_server')
        .setDescription('[DONO] Faz o bot sair de um servidor')
        .addStringOption(option =>
            option.setName('server_id')
                .setDescription('ID do servidor')
                .setRequired(true)),
    
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        
        // Verifica se é o dono do bot
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Apenas o dono do bot pode usar este comando.`)],
                flags: MessageFlags.Ephemeral
            });
        }

        const serverId = interaction.options.getString('server_id');

        // Defer a resposta para evitar timeout
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const guild = interaction.client.guilds.cache.get(serverId);

            if (!guild) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} Servidor não encontrado.`)]
                });
            }

            const guildName = guild.name;
            await guild.leave();

            await interaction.editReply({
                embeds: [createSuccessEmbed(`${emojis.positive} Bot saiu do servidor: ${guildName} (${serverId})`)]
            });
        } catch (error) {
            console.error('Erro ao sair do servidor:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} Erro ao sair do servidor.`)]
            });
        }
    }
};
