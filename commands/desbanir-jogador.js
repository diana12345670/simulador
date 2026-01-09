// desbanir-jogador.js - Remove banimento GLOBAL pelo dono
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { unbanUser, isUserBanned } = require('../utils/database');
const { isOwnerOrAuthorized } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');
const { getGuildLanguage } = require('../utils/lang');
const { t } = require('../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desbanir-jogador')
        .setDescription('[DONO] Desbane um jogador de TODOS os simuladores')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário a ser desbanido globalmente')
                .setRequired(true)),

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
        const isBanned = await isUserBanned(user.id);

        if (!isBanned) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.alerta} ${t(lang, 'not_banned_global', { user: user.toString() })}`, interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        await unbanUser(user.id);

        await interaction.reply({
            embeds: [createSuccessEmbed(
                `${emojis.positive} ${t(lang, 'unban_global_success', { user: user.toString() })}`,
                interaction.client
            )]
        });
    }
};
