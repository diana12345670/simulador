// desbanir_server.js - Comando para o dono remover banimento de servidor
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { unbanServer, isGuildBanned } = require('../utils/database');
const { isOwnerOrAuthorized } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desbanir_server')
        .setDescription('[DONO] Remove o banimento de um servidor')
        .addStringOption(option =>
            option.setName('server_id')
                .setDescription('ID do servidor')
                .setRequired(true)),

    async execute(interaction) {
        const authorized = await isOwnerOrAuthorized(interaction.user.id);
        if (!authorized) {
            return interaction.reply({
                embeds: [createErrorEmbed('Apenas o dono do bot pode usar este comando.', interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        const guildId = interaction.options.getString('server_id');

        const banned = await isGuildBanned(guildId);
        if (!banned) {
            return interaction.reply({
                embeds: [createErrorEmbed('Este servidor não está banido.', interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            await unbanServer(guildId);
        } catch (error) {
            console.error('Erro ao desbanir servidor:', error);
            return interaction.reply({
                embeds: [createErrorEmbed('Erro ao remover banimento no banco de dados.', interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.reply({
            embeds: [createSuccessEmbed(`Servidor ${guildId} foi desbanido.`, interaction.client)]
        });
    }
};
