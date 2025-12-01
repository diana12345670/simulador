// desbugar.js - Comando para limpar simulador travado
const { SlashCommandBuilder } = require('discord.js');
const { getPool, getTournamentById, deleteTournament } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desbugar')
        .setDescription('Remove/limpa um simulador travado')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('ID do simulador (opcional, usa o canal atual se não informado)')
                .setRequired(false)),

    async execute(interaction) {
        const simulatorId = interaction.options.getString('id');
        let tournament;

        if (simulatorId) {
            tournament = await getTournamentById(simulatorId);
        } else {
            const dbClient = await getPool().connect();
            try {
                const result = await dbClient.query(
                    'SELECT * FROM tournaments WHERE channel_id = $1 OR category_id = $2',
                    [interaction.channelId, interaction.channel.parentId]
                );
                tournament = result.rows.length > 0 ? {
                    id: result.rows[0].id,
                    creatorId: result.rows[0].creator_id,
                    categoryId: result.rows[0].category_id
                } : null;
            } finally {
                dbClient.release();
            }
        }

        if (!tournament) {
            return interaction.reply({
                embeds: [createErrorEmbed('Simulador não encontrado.', interaction.client)],
                ephemeral: true
            });
        }

        const OWNER_ID = process.env.OWNER_ID;
        if (interaction.user.id !== tournament.creatorId && interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed('Apenas o criador do simulador ou o dono do bot pode desbugá-lo.', interaction.client)],
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            if (tournament.categoryId) {
                const category = interaction.guild.channels.cache.get(tournament.categoryId);
                if (category) {
                    const categoryChannels = category.children.cache;
                    for (const [, channel] of categoryChannels) {
                        await channel.delete('Simulador desbugado');
                    }
                    await category.delete('Simulador desbugado');
                }
            }

            await deleteTournament(tournament.id);

            await interaction.editReply({
                embeds: [createSuccessEmbed('Simulador desbugado com sucesso!', interaction.client)]
            });

        } catch (error) {
            console.error('Erro ao desbugar simulador:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('Erro ao desbugar simulador.', interaction.client)]
            });
        }
    }
};