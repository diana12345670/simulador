// banir-jogador.js - Banimento GLOBAL pelo dono (todos os simuladores)
const { SlashCommandBuilder } = require('discord.js');
const { banUser, isUserBanned } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

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
        const emojis = getEmojis(interaction.client);

        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Apenas o dono do bot pode usar este comando.`, interaction.client)],
                ephemeral: true
            });
        }

        const user = interaction.options.getUser('usuario');
        const motivo = interaction.options.getString('motivo') || 'Banido pela equipe Sky';

        const alreadyBanned = await isUserBanned(user.id);
        if (alreadyBanned) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.alerta} ${user} já está banido globalmente.`, interaction.client)],
                ephemeral: true
            });
        }

        await banUser(user.id, motivo);

        await interaction.reply({
            embeds: [createSuccessEmbed(
                `${emojis.negative} ${user} foi banido globalmente de todos os simuladores.\n\n${emojis.pergaminhopixel} Motivo: ${motivo}`,
                interaction.client
            )]
        });
    }
};
