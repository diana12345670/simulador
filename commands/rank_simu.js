
// rank_simu.js - Comando para mostrar ranking
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getRankGlobal, getRankLocal, addLiveRankPanel, countLiveRankPanelsByGuild } = require('../utils/database');
const { createRedEmbed, createErrorEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

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
        const emojis = getEmojis(interaction.client);
        console.log(`🔍 [rank_simu] Bot: ${interaction.client.botConfig?.name || 'undefined'}, Emoji raiopixel: ${emojis.raiopixel}`);
        const tipo = interaction.options.getString('tipo');
        const atualizacao = interaction.options.getString('atualizacao') || 'atual';

        if (atualizacao === 'ao_vivo') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    embeds: [createErrorEmbed(`${emojis.negative} Apenas administradores podem criar painéis de rank ao vivo.`)],
                    flags: MessageFlags.Ephemeral
                });
            }

            const panelCount = await countLiveRankPanelsByGuild(interaction.guildId);
            if (panelCount >= 2) {
                return interaction.reply({
                    embeds: [createErrorEmbed(`${emojis.negative} Este servidor já possui 2 painéis de rank ao vivo. Apague uma mensagem de rank existente para criar outra.`)],
                    flags: MessageFlags.Ephemeral
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
                embeds: [createErrorEmbed(`${emojis.negative} Ainda não há dados de ranking.`)],
                flags: MessageFlags.Ephemeral
            });
        }

        const rankDescription = rankData.map((player, index) => {
            const medal = index === 0 ? emojis.coroapixel : index === 1 ? emojis.trofeupixel : index === 2 ? emojis.fogo : emojis.raiopixel;
            return `${medal} **#${index + 1}** <@${player.user_id}>\n${emojis.moedapixel} Pontos: ${player.points || 0} | ${emojis.positive} Vitórias: ${player.wins || 0} | ${emojis.negative} Derrotas: ${player.losses || 0}`;
        }).join('\n\n');

        const footerText = atualizacao === 'ao_vivo' 
            ? `${emojis.fogo} AO VIVO - Atualiza automaticamente quando jogadores vencem`
            : `${emojis.moedapixel} Pontos: +1 por torneio vencido`;

        const rankEmbed = createRedEmbed({
            title: rankTitle + (atualizacao === 'ao_vivo' ? ` ${emojis.fogo}` : ''),
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
