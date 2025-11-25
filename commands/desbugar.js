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
            // Busca por ID específico
            tournament = await getTournamentById(simulatorId);
        } else {
            // Busca pelo canal atual
            const client = await getPool().connect();
            try {
                const result = await client.query(
                    'SELECT * FROM tournaments WHERE channel_id = $1 OR category_id = $2',
                    [interaction.channelId, interaction.channel.parentId]
                );
                tournament = result.rows.length > 0 ? {
                    id: result.rows[0].id,
                    creatorId: result.rows[0].creator_id,
                    categoryId: result.rows[0].category_id
                } : null;
            } finally {
                client.release();
            }
        }

        if (!tournament) {
            return interaction.reply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Simulador não encontrado.')],
                ephemeral: true
            });
        }

        // Verifica permissão (criador ou dono do bot)
        const OWNER_ID = process.env.OWNER_ID;
        if (interaction.user.id !== tournament.creatorId && interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Apenas o criador do simulador ou o dono do bot pode desbugá-lo.')],
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            // Apaga categoria se existir
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

            // Remove do banco
            await deleteTournament(tournament.id);

            await interaction.editReply({
                embeds: [createSuccessEmbed('<:positive:1442668038691491943> Simulador desbugado com sucesso!')]
            });

        } catch (error) {
            console.error('Erro ao desbugar simulador:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Erro ao desbugar simulador.')]
            });
        }
    }
};