// banir-jogador.js - Banimento GLOBAL pelo dono (todos os simuladores)
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { banUser, isUserBanned, isOwnerOrAuthorized } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');
const { getGuildLanguage } = require('../utils/lang');
const { t } = require('../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banir-jogador')
        .setDescription('[DONO] Bana um jogador de TODOS os simuladores')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário a ser banido globalmente')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo do banimento')
                .setRequired(false)),

    async execute(interaction) {
        const lang = await getGuildLanguage(interaction.guildId);
        const emojis = getEmojis(interaction.client);

        const authorized = await isOwnerOrAuthorized(interaction.user.id);
        if (!authorized) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} ${t(lang, 'owner_only')}`, interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        const user = interaction.options.getUser('usuario');
        const motivo = interaction.options.getString('motivo') || t(lang, 'default_ban_reason');

        const alreadyBanned = await isUserBanned(user.id);
        if (alreadyBanned) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.alerta} ${t(lang, 'already_banned_global', { user: user.toString() })}`, interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        await banUser(user.id, motivo);

        await interaction.reply({
            embeds: [createSuccessEmbed(
                `${emojis.negative} ${t(lang, 'ban_global_success', { user: user.toString(), motivo })}`,
                interaction.client
            )]
        });
    }
};
