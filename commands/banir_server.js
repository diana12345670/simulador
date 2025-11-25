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
        // Verifica se é o dono do bot
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(':negative: Apenas o dono do bot pode usar este comando.')],
                ephemeral: true
            });
        }

        const guildId = interaction.options.getString('server_id');

        // Adiciona servidor à lista de banidos no PostgreSQL
        const client = await getPool().connect();
        try {
            await client.query(`
                INSERT INTO servers_banidos (guild_id, reason)
                VALUES ($1, $2)
                ON CONFLICT (guild_id) DO UPDATE
                SET banned_at = CURRENT_TIMESTAMP, reason = $2
            `, [guildId, 'Banido manualmente']);
        } finally {
            client.release();
        }

        // Tenta sair do servidor se o bot estiver nele
        const guild = interaction.client.guilds.cache.get(guildId);
        if (guild) {
            try {
                await guild.leave();
            } catch (error) {
                console.log('Erro ao sair do servidor banido:', error);
            }
        }

        await interaction.reply({
                embeds: [createSuccessEmbed(`<:positive:1442668038691491943> Servidor ${guildId} foi banido e o bot saiu dele (se estava presente).`)]
            });
    }
};