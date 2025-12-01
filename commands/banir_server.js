// banir_server.js - Comando para o dono banir um servidor
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getPool } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banir_server')
        .setDescription('[DONO] Bane um servidor de usar o bot')
        .addStringOption(option =>
            option.setName('server_id')
                .setDescription('ID do servidor')
                .setRequired(true)),

    async execute(interaction) {
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed('Apenas o dono do bot pode usar este comando.', interaction.client)],
                ephemeral: true
            });
        }

        const guildId = interaction.options.getString('server_id');

        const dbClient = await getPool().connect();
        try {
            await dbClient.query(`
                INSERT INTO servers_banidos (guild_id, reason)
                VALUES ($1, $2)
                ON CONFLICT (guild_id) DO UPDATE
                SET banned_at = CURRENT_TIMESTAMP, reason = $2
            `, [guildId, 'Banido manualmente']);
        } finally {
            dbClient.release();
        }

        const guild = interaction.client.guilds.cache.get(guildId);
        if (guild) {
            try {
                await guild.leave();
            } catch (error) {
                console.log('Erro ao sair do servidor banido:', error);
            }
        }

        await interaction.reply({
            embeds: [createSuccessEmbed(`Servidor ${guildId} foi banido e o bot saiu dele (se estava presente).`, interaction.client)]
        });
    }
};