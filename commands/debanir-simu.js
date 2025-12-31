// debanir_simu.js - Comando para desbanir usuário de simuladores
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { unbanUser, isUserBannedInGuild } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debanir-simu')
        .setDescription('Desbane um usuário de participar de simuladores neste servidor')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário a ser desbanido')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');

        try {
            const isBanned = await isUserBannedInGuild(user.id, interaction.guildId);

            if (!isBanned) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Este usuário não está banido de simuladores neste servidor.', interaction.client)],
                    ephemeral: true
                });
            }

            await unbanUser(user.id);

            await interaction.reply({
                embeds: [createSuccessEmbed(`${user} foi desbanido de participar de simuladores neste servidor.`, interaction.client)]
            });
        } catch (error) {
            console.error('Erro ao desbanir usuário:', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Erro ao processar desbanimento.', interaction.client)],
                ephemeral: true
            });
        }
    }
};
