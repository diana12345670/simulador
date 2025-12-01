// banir_simu.js - Comando para banir usuário de simuladores
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getPool } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banir_simu')
        .setDescription('Bane um usuário de participar de simuladores neste servidor')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário a ser banido')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const dbClient = await getPool().connect();

        try {
            const checkResult = await dbClient.query(
                'SELECT 1 FROM bans WHERE user_id = $1 AND guild_id = $2',
                [user.id, interaction.guildId]
            );

            if (checkResult.rows.length > 0) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Este usuário já está banido de simuladores.', interaction.client)],
                    ephemeral: true
                });
            }

            await dbClient.query(
                'INSERT INTO bans (user_id, guild_id, reason) VALUES ($1, $2, $3)',
                [user.id, interaction.guildId, 'Banido de simuladores localmente']
            );

            await interaction.reply({
                embeds: [createSuccessEmbed(`${user} foi banido de participar de simuladores neste servidor.`, interaction.client)]
            });
        } finally {
            dbClient.release();
        }
    }
};
