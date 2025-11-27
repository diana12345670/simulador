
// rank_simu.js - Comando para mostrar ranking
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getRankGlobal, getRankLocal, addLiveRankPanel, countLiveRankPanelsByGuild } = require('../utils/database');
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
                ))
        .addStringOption(option =>
            option.setName('atualizacao')
                .setDescription('Modo de atualização do ranking')
                .setRequired(false)
                .addChoices(
                    { name: 'Atual (mostra uma vez)', value: 'atual' },
                    { name: 'Ao Vivo (atualiza automaticamente)', value: 'ao_vivo' }
                )),
    
    async execute(interaction) {
        const tipo = interaction.options.getString('tipo');
        const atualizacao = interaction.options.getString('atualizacao') || 'atual';

        if (atualizacao === 'ao_vivo') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('<:negative:1442668040465682643> Apenas administradores podem criar painéis de rank ao vivo.')],
                    ephemeral: true
                });
            }

            const panelCount = await countLiveRankPanelsByGuild(interaction.guildId);
            if (panelCount >= 2) {
                return interaction.reply({
                    embeds: [createErrorEmbed('<:negative:1442668040465682643> Este servidor já possui 2 painéis de rank ao vivo. Apague uma mensagem de rank existente para criar outra.')],
                    ephemeral: true
                });
            }
        }

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

        const rankDescription = rankData.map((player, index) => {
            const medal = index === 0 ? '<:coroapixel:1442668026813087836>' : index === 1 ? '<:trofeupixel:1442668024891969588>' : index === 2 ? '<:fogo:1442667877332422847>' : '<:raiopixel:1442668029065564341>';
            return `${medal} **#${index + 1}** <@${player.user_id}>\n<:moedapixel:1442668030932029461> Pontos: ${player.points || 0} | <:positive:1442668038691491943> Vitórias: ${player.wins || 0} | <:negative:1442668040465682643> Derrotas: ${player.losses || 0}`;
        }).join('\n\n');

        const footerText = atualizacao === 'ao_vivo' 
            ? '🔴 AO VIVO - Atualiza automaticamente quando jogadores vencem'
            : '<:moedapixel:1442668030932029461> Pontos: +1 por torneio vencido';

        const rankEmbed = createRedEmbed({
            title: rankTitle + (atualizacao === 'ao_vivo' ? ' 🔴' : ''),
            description: rankDescription || 'Nenhum dado disponível',
            footer: { text: footerText },
            timestamp: true
        });

        const reply = await interaction.reply({ embeds: [rankEmbed], fetchReply: true });

        if (atualizacao === 'ao_vivo') {
            await addLiveRankPanel(interaction.guildId, interaction.channelId, reply.id, tipo);
            console.log(`✅ Painel de rank ao vivo criado: ${reply.id} (${tipo})`);
        }
    }
};
