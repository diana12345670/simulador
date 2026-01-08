// desbanir-jogador.js - Remove banimento GLOBAL pelo dono
const { SlashCommandBuilder } = require('discord.js');
const { unbanUser, isUserBanned } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desbanir-jogador')
        .setDescription('[DONO] Desbane um jogador de TODOS os simuladores')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário a ser desbanido globalmente')
                .setRequired(true)),

    async execute(interaction) {
        const emojis = getEmojis(interaction.client);

        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Apenas o dono do bot pode usar este comando.`, interaction.client)],
                ephemeral: true
            });
        }

        const user = interaction.options.getUser('usuario');
        const isBanned = await isUserBanned(user.id);

        if (!isBanned) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.alerta} ${user} não está banido globalmente.`, interaction.client)],
                ephemeral: true
            });
        }

        await unbanUser(user.id);

        await interaction.reply({
            embeds: [createSuccessEmbed(
                `${emojis.positive} ${user} foi desbanido globalmente e pode voltar a jogar simuladores.`,
                interaction.client
            )]
        });
    }
};
