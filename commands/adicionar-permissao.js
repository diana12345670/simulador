// adicionar-permissao.js - Concede permissão de dono a um usuário (helpers)
const { SlashCommandBuilder } = require('discord.js');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');
const { addOwnerHelper, isOwnerOrAuthorized } = require('../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adicionar-permissao')
        .setDescription('[DONO] Concede permissão de usar comandos de dono a um usuário')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário que receberá a permissão')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('id')
                .setDescription('ID do usuário (use se estiver em DM ou sem menção)')
                .setRequired(false)),

    async execute(interaction) {
        const emojis = getEmojis(interaction.client);

        const authorized = await isOwnerOrAuthorized(interaction.user.id);
        if (!authorized) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Apenas o dono do bot pode usar este comando.`, interaction.client)],
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('usuario');
        const targetId = targetUser?.id || interaction.options.getString('id');

        if (!targetId) {
            return interaction.reply({
                embeds: [createErrorEmbed('Informe o usuário (menção) ou o ID.', interaction.client)],
                ephemeral: true
            });
        }

        if (targetId === process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.alerta} O dono já tem todas as permissões.`, interaction.client)],
                ephemeral: true
            });
        }

        await addOwnerHelper(targetId);

        await interaction.reply({
            embeds: [createSuccessEmbed(
                `${emojis.positive} <@${targetId}> agora tem permissão para usar os comandos de dono.`,
                interaction.client
            )]
        });
    }
};
