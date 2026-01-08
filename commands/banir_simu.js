// banir_simu.js - Comando para banir usuário de simuladores
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { banUserInGuild, isUserBannedInGuild } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getGuildLanguage } = require('../utils/lang');
const { t } = require('../utils/i18n');

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
        const lang = await getGuildLanguage(interaction.guildId);
        const user = interaction.options.getUser('usuario');

        try {
            const isBanned = await isUserBannedInGuild(user.id, interaction.guildId);

            if (isBanned) {
                return interaction.reply({
                    embeds: [createErrorEmbed(t(lang, 'already_banned_local'), interaction.client)],
                    ephemeral: true
                });
            }

            await banUserInGuild(user.id, interaction.guildId, 'Banido de simuladores localmente');

            await interaction.reply({
                embeds: [createSuccessEmbed(t(lang, 'ban_local_success', { user: user.toString() }), interaction.client)]
            });
        } catch (error) {
            console.error('Erro ao banir usuário:', error);
            await interaction.reply({
                embeds: [createErrorEmbed(t(lang, 'error_ban_process'), interaction.client)],
                ephemeral: true
            });
        }
    }
};
