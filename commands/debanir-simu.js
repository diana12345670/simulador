// debanir_simu.js - Comando para desbanir usuário de simuladores
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { unbanUserInGuild, isUserBannedInGuild } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getGuildLanguage } = require('../utils/lang');
const { t } = require('../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desbanir-simu')
        .setDescription('Desbane um usuário de participar de simuladores neste servidor')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário a ser desbanido')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const lang = await getGuildLanguage(interaction.guildId);
        const user = interaction.options.getUser('usuario');

        try {
            const isBanned = await isUserBannedInGuild(user.id, interaction.guildId);

            if (!isBanned) {
                return interaction.reply({
                    embeds: [createErrorEmbed(t(lang, 'not_banned_local'), interaction.client)],
                    ephemeral: true
                });
            }

            await unbanUserInGuild(user.id, interaction.guildId);

            await interaction.reply({
                embeds: [createSuccessEmbed(t(lang, 'unban_local_success', { user: user.toString() }), interaction.client)]
            });
        } catch (error) {
            console.error('Erro ao desbanir usuário:', error);
            await interaction.reply({
                embeds: [createErrorEmbed(t(lang, 'error_unban_process'), interaction.client)],
                ephemeral: true
            });
        }
    }
};
