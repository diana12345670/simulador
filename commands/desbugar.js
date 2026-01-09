// desbugar.js - Comando para limpar simulador travado
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getTournamentById, deleteTournament, getAllTournaments } = require('../utils/database');
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
            const allTs = await getAllTournaments();
            tournament = allTs.find(t => t.channelId === interaction.channelId || t.categoryId === interaction.channel.parentId);
        }

        if (!tournament) {
            return interaction.reply({
                embeds: [createErrorEmbed('Simulador não encontrado.', interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        const OWNER_ID = process.env.OWNER_ID;
        if (interaction.user.id !== tournament.creatorId && interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed('Apenas o criador do simulador ou o dono do bot pode desbugá-lo.', interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        try {
            if (tournament.categoryId) {
                const category = interaction.guild.channels.cache.get(tournament.categoryId);
                if (category) {
                    const categoryChannels = category.children.cache;
                    for (const [, channel] of categoryChannels) {
                        try { await channel.delete('Simulador desbugado'); } catch (e) {}
                    }
                    try { await category.delete('Simulador desbugado'); } catch (e) {}
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