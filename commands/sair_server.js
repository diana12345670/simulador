// sair_server.js - Comando para o dono do bot sair de um servidor
const { SlashCommandBuilder } = require('discord.js');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sair_server')
        .setDescription('[DONO] Faz o bot sair de um servidor')
        .addStringOption(option =>
            option.setName('server_id')
                .setDescription('ID do servidor')
                .setRequired(true)),
    
    async execute(interaction) {
        // Verifica se é o dono do bot
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(':negative: Apenas o dono do bot pode usar este comando.')],
                ephemeral: true
            });
        }

        const serverId = interaction.options.getString('server_id');

        try {
            const guild = interaction.client.guilds.cache.get(serverId);

            if (!guild) {
                return interaction.reply({
                    embeds: [createErrorEmbed('<:negative:1442668040465682643> Servidor não encontrado.')],
                    ephemeral: true
                });
            }

            const guildName = guild.name;
            await guild.leave();

            await interaction.reply({
                embeds: [createSuccessEmbed(`<:positive:1442668038691491943> Bot saiu do servidor: ${guildName} (${serverId})`)]
            });
        } catch (error) {
            console.error('Erro ao sair do servidor:', error);
            await interaction.reply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Erro ao sair do servidor.')],
                ephemeral: true
            });
        }
    }
};
