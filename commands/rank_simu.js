
// rank_simu.js - Comando para mostrar ranking
const { SlashCommandBuilder } = require('discord.js');
const { getRankGlobal, getRankLocal } = require('../utils/database');
const { createRedEmbed, createErrorEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank_simu')
        .setDescription('Mostra o ranking de simuladores')
        .addStringOption(option =>
            option.setName('tipo')
                .setDescription('Tipo de ranking')
                .setRequired(true)
                .addChoices(
                    { name: 'Local (este servidor)', value: 'local' },
                    { name: 'Global (todos servidores)', value: 'global' }
                )),
    
    async execute(interaction) {
        const tipo = interaction.options.getString('tipo');

        let rankData;
        let rankTitle;

        if (tipo === 'global') {
            rankData = await getRankGlobal(10);
            rankTitle = '🏆 Ranking Global de Simuladores';
        } else {
            rankData = await getRankLocal(interaction.guildId, 10);
            rankTitle = `🏆 Ranking Local de Simuladores`;
        }

        if (!rankData || rankData.length === 0) {
            return interaction.reply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Ainda não há dados de ranking.')],
                ephemeral: true
            });
        }

        // Cria descrição do ranking
        const rankDescription = rankData.map((player, index) => {
            const medal = index === 0 ? '<:coroapixel:1442668026813087836>' : index === 1 ? '<:trofeupixel:1442668024891969588>' : index === 2 ? '<:fogo:1442667877332422847>' : '<:raiopixel:1442668029065564341>';
            return `${medal} **#${index + 1}** <@${player.user_id}>\n<:moedapixel:1442668030932029461> Pontos: ${player.points || 0} | <:positive:1442668038691491943> Vitórias: ${player.wins || 0} | <:negative:1442668040465682643> Derrotas: ${player.losses || 0}`;
        }).join('\n\n');

        const rankEmbed = createRedEmbed({
            title: rankTitle,
            description: rankDescription || 'Nenhum dado disponível',
            footer: { text: '<:moedapixel:1442668030932029461> Pontos: +10 por vitória, +1 por torneio vencido' },
            timestamp: true
        });

        await interaction.reply({ embeds: [rankEmbed] });
    }
};
