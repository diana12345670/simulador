// buttonHandler.js - Handler para botões do Discord
const { createRedEmbed, createErrorEmbed } = require('../utils/embeds');
const { getTournamentById, updateTournament, deleteTournament } = require('../utils/database');
const { updateSimulatorPanel } = require('../systems/tournament/manager');
const { MessageFlags } = require('discord.js');

/**
 * Processa interações de botões
 */
async function handleButton(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('simu_join_')) {
        await handleJoin(interaction);
    } else if (customId.startsWith('simu_leave_')) {
        await handleLeave(interaction);
    } else if (customId.startsWith('simu_cancel_')) {
        await handleCancel(interaction);
    } else if (customId.startsWith('match_win1_')) {
        await handleMatchWin(interaction, 1);
    } else if (customId.startsWith('match_win2_')) {
        await handleMatchWin(interaction, 2);
    } else if (customId.startsWith('match_wo_')) {
        await handleWalkover(interaction);
    } else if (customId.startsWith('wo_team1_')) {
        await handleWalkoverSelection(interaction, 1);
    } else if (customId.startsWith('wo_team2_')) {
        await handleWalkoverSelection(interaction, 2);
    } else if (customId.startsWith('wo_cancel_')) {
        await interaction.update({
            embeds: [createRedEmbed({
                description: '❌ W.O. cancelado.',
                timestamp: true
            })],
            components: []
        });
    }
}

/**
 * Lida com entrada de jogador no simulador
 */
async function handleJoin(interaction) {
    const simulatorId = interaction.customId.replace('simu_join_', '');
    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador não está mais aberto.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Verifica se já está inscrito
    if (simulator.players.includes(interaction.user.id)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Você já está inscrito neste simulador.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Verifica se está cheio
    if (simulator.players.length >= simulator.maxPlayers) {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador já está lotado.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Adiciona jogador
    const newPlayers = [...simulator.players, interaction.user.id];
    await updateTournament(simulatorId, { players: newPlayers });

    await interaction.reply({
        embeds: [createRedEmbed({
            description: '✅ Você entrou no simulador!',
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    await updateSimulatorPanel(interaction.client, simulatorId);
}

/**
 * Lida com saída de jogador do simulador
 */
async function handleLeave(interaction) {
    const simulatorId = interaction.customId.replace('simu_leave_', '');
    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador não está mais aberto.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Verifica se está inscrito
    if (!simulator.players.includes(interaction.user.id)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Você não está inscrito neste simulador.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Remove jogador
    const newPlayers = simulator.players.filter(id => id !== interaction.user.id);
    await updateTournament(simulatorId, { players: newPlayers });

    await interaction.reply({
        embeds: [createRedEmbed({
            description: '❌ Você saiu do simulador.',
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    await updateSimulatorPanel(interaction.client, simulatorId);
}

/**
 * Lida com cancelamento de simulador
 */
async function handleCancel(interaction) {
    const simulatorId = interaction.customId.replace('simu_cancel_', '');
    const simulator = await getTournamentById(simulatorId);

    if (!simulator) {
        return interaction.reply({
            embeds: [createErrorEmbed('Simulador não encontrado.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Verifica se é o criador ou owner
    const OWNER_ID = process.env.OWNER_ID || '1339336477661724674';
    if (interaction.user.id !== simulator.creatorId && interaction.user.id !== OWNER_ID) {
        return interaction.reply({
            embeds: [createErrorEmbed('Apenas o criador pode cancelar o simulador.')],
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.reply({
        embeds: [createRedEmbed({
            description: '⏳ Cancelando simulador...',
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    try {
        // Atualiza o painel principal primeiro
        const mainChannel = interaction.guild.channels.cache.get(simulator.channelId);
        if (mainChannel && simulator.panelMessageId) {
            try {
                const panelMessage = await mainChannel.messages.fetch(simulator.panelMessageId);
                await panelMessage.edit({
                    embeds: [createRedEmbed({
                        title: `🔥 Simulador ${simulator.mode} – ${simulator.jogo}`,
                        description: `⚔️ **Jogo:** ${simulator.jogo}\n🔧 **Versão:** ${simulator.versao}\n🏆 **Modo:** ${simulator.mode}\n🎁 **Prêmio:** ${simulator.prize}\n\n❌ **Este simulador foi cancelado**`,
                        footer: { text: '❌ Simulador cancelado' },
                        timestamp: true
                    })],
                    components: []
                });
            } catch (err) {
                console.error('Erro ao atualizar painel:', err);
            }
        }

        // Remove do banco primeiro
        await deleteTournament(simulatorId);

        // Apaga categoria e canais depois de um delay
        setTimeout(async () => {
            try {
                if (simulator.categoryId) {
                    const category = interaction.guild.channels.cache.get(simulator.categoryId);
                    if (category) {
                        const categoryChannels = category.children.cache;
                        for (const [, channel] of categoryChannels) {
                            await channel.delete('Simulador cancelado');
                        }
                        await category.delete('Simulador cancelado');
                    }
                }
            } catch (error) {
                console.error('Erro ao deletar canais:', error);
            }
        }, 3000);

        await interaction.editReply({
            embeds: [createRedEmbed({
                description: '❌ Simulador cancelado com sucesso.',
                timestamp: true
            })]
        });
    } catch (error) {
        console.error('Erro ao cancelar simulador:', error);
        await interaction.editReply({
            embeds: [createErrorEmbed('Erro ao cancelar simulador.')]
        });
    }
}

/**
 * Lida com vitória de partida
 */
async function handleMatchWin(interaction, winnerTeamNum) {
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const matchId = parts[3];

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) return;

    // Verifica se é o criador
    if (interaction.user.id !== simulator.creatorId) {
        return interaction.reply({
            embeds: [createErrorEmbed('Apenas o criador pode declarar vencedor.')],
            flags: MessageFlags.Ephemeral
        });
    }

    const { advanceWinner } = require('../systems/tournament/bracket');
    const match = simulator.bracketData.matches.find(m => m.id === matchId);

    const winnerTeam = winnerTeamNum === 1 ? match.team1 : match.team2;
    const result = advanceWinner(simulator.bracketData, matchId, winnerTeam);

    if (result.isFinal) {
        await handleChampion(interaction, simulator, result.champion, result.bracketData);
    } else if (result.isNewRound && result.nextMatch) {
        await createNextRoundChannels(interaction, simulator, result.nextMatch.round, result.bracketData);
    }

    await updateTournament(simulatorId, { bracketData: result.bracketData });

    const winnerMentions = winnerTeam.map(id => `<@${id}>`).join(', ');
    await interaction.update({
        embeds: [createRedEmbed({
            description: `✅ Vencedor: ${winnerMentions}`,
            timestamp: true
        })],
        components: []
    });

    // Apaga o canal da partida
    const channel = interaction.guild.channels.cache.get(interaction.channelId);
    if (channel && (channel.name.includes('rodada') || channel.name.includes('quartas') || 
                    channel.name.includes('semifinal') || channel.name.includes('final'))) {
        setTimeout(() => channel.delete('Partida finalizada'), 3000);
    }
}

/**
 * Lida com W.O.
 */
async function handleWalkover(interaction) {
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const matchId = parts[3];

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) return;

    // Verifica se é o criador
    if (interaction.user.id !== simulator.creatorId) {
        return interaction.reply({
            embeds: [createErrorEmbed('Apenas o criador pode declarar W.O.')],
            flags: MessageFlags.Ephemeral
        });
    }

    const match = simulator.bracketData.matches.find(m => m.id === matchId);
    const team1Mentions = match.team1.map(id => `<@${id}>`).join(', ');
    const team2Mentions = match.team2.map(id => `<@${id}>`).join(', ');

    // Cria botões para escolher qual time recebeu W.O.
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const woButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`wo_team1_${simulatorId}_${matchId}`)
                .setLabel(`Time 1 levou W.O.`)
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`wo_team2_${simulatorId}_${matchId}`)
                .setLabel(`Time 2 levou W.O.`)
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`wo_cancel_${simulatorId}_${matchId}`)
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.reply({
        embeds: [createRedEmbed({
            title: '⚠️ Declarar W.O.',
            description: `**Time 1:** ${team1Mentions}\n**Time 2:** ${team2Mentions}\n\nQual time **LEVOU W.O.** (não compareceu)?`,
            timestamp: true
        })],
        components: [woButtons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * Processa a seleção de W.O.
 */
async function handleWalkoverSelection(interaction, woTeamNum) {
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const matchId = parts[3];

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) return;

    const { advanceWinner } = require('../systems/tournament/bracket');
    const match = simulator.bracketData.matches.find(m => m.id === matchId);

    // O time que NÃO recebeu W.O. avança
    const winnerTeam = woTeamNum === 1 ? match.team2 : match.team1;
    const loserMentions = (woTeamNum === 1 ? match.team1 : match.team2).map(id => `<@${id}>`).join(', ');
    const winnerMentions = winnerTeam.map(id => `<@${id}>`).join(', ');

    const result = advanceWinner(simulator.bracketData, matchId, winnerTeam);

    if (result.isFinal) {
        await handleChampion(interaction, simulator, result.champion, result.bracketData);
    } else if (result.isNewRound && result.nextMatch) {
        await createNextRoundChannels(interaction, simulator, result.nextMatch.round, result.bracketData);
    }

    await updateTournament(simulatorId, { bracketData: result.bracketData });

    await interaction.update({
        embeds: [createRedEmbed({
            title: '✅ W.O. Registrado',
            description: `**Faltou:** ${loserMentions}\n**Avançou:** ${winnerMentions}`,
            timestamp: true
        })],
        components: []
    });

    // Apaga o canal da partida
    const channel = interaction.guild.channels.cache.get(interaction.channelId);
    if (channel && (channel.name.includes('rodada') || channel.name.includes('quartas') || 
                    channel.name.includes('semifinal') || channel.name.includes('final'))) {
        setTimeout(() => channel.delete('Partida finalizada por W.O.'), 3000);
    }
}

/**
 * Lida com campeão - ATUALIZA RANKING E REMOVE SIMULADOR
 */
async function handleChampion(interaction, simulator, championTeam, bracketData) {
    const { updateRankGlobal, updateRankLocal } = require('../utils/database');
    const championMentions = championTeam.map(id => `<@${id}>`).join(', ');

    const championEmbed = createRedEmbed({
        title: 'CAMPEÃO DO SIMULADOR',
        description: `Vencedor: ${championMentions}\nPrêmio: ${simulator.prize}`,
        image: interaction.guild.iconURL() || interaction.guild.bannerURL() || null,
        timestamp: true
    });

    const mainChannel = interaction.guild.channels.cache.get(simulator.channelId);
    if (mainChannel) {
        await mainChannel.send({ embeds: [championEmbed] });
    }

    // ✅ ATUALIZA RANKINGS para cada membro do time vencedor
    for (const playerId of championTeam) {
        await updateRankGlobal(playerId, { wins: 1, points: 1 });
        await updateRankLocal(interaction.guildId, playerId, { wins: 1, points: 1 });
    }

    console.log(`✅ Rankings atualizados para ${championTeam.length} jogadores`);

    // ✅ ATUALIZA PAINÉIS AO VIVO
    await updateLiveRankPanels(interaction.client);

    // Marca como finalizado no banco
    await updateTournament(simulator.id, { state: 'finished', bracketData });

    // Apaga categoria e canais após 5 segundos
    setTimeout(async () => {
        try {
            // Apaga categoria e canais dos brackets
            if (simulator.categoryId) {
                const category = interaction.guild.channels.cache.get(simulator.categoryId);
                if (category) {
                    const categoryChannels = category.children.cache;
                    for (const [, channel] of categoryChannels) {
                        await channel.delete('Simulador finalizado');
                    }
                    await category.delete('Simulador finalizado');
                }
            }

            // ✅ REMOVE DO BANCO DE DADOS
            await deleteTournament(simulator.id);
            console.log(`✅ Simulador ${simulator.id} removido do banco de dados`);
        } catch (error) {
            console.error('Erro ao deletar canais:', error);
        }
    }, 5000);
}

/**
 * Cria canais para próxima rodada
 */
async function createNextRoundChannels(interaction, simulator, round, bracketData) {
    const { createMatchChannel } = require('../systems/tournament/manager');
    const { getRoundName } = require('../systems/tournament/bracket');

    const category = interaction.guild.channels.cache.get(simulator.categoryId);
    const newMatches = bracketData.matches.filter(m => m.round === round);

    for (const match of newMatches) {
        const roundName = getRoundName(match.round, bracketData.totalRounds);
        const matchNumber = match.id.split('match')[1];
        await createMatchChannel(interaction.guild, category, simulator, match, `${roundName}-${matchNumber}`);
    }
}

/**
 * Atualiza todos os painéis de rank ao vivo
 */
async function updateLiveRankPanels(client) {
    const { getAllLiveRankPanels, removeLiveRankPanel, getRankGlobal, getRankLocal } = require('../utils/database');
    
    try {
        const panels = await getAllLiveRankPanels();
        
        for (const panel of panels) {
            try {
                const guild = client.guilds.cache.get(panel.guildId);
                if (!guild) {
                    await removeLiveRankPanel(panel.guildId, panel.messageId);
                    console.log(`🗑️ Painel removido: servidor não encontrado`);
                    continue;
                }

                const channel = guild.channels.cache.get(panel.channelId);
                if (!channel) {
                    await removeLiveRankPanel(panel.guildId, panel.messageId);
                    console.log(`🗑️ Painel removido: canal não encontrado`);
                    continue;
                }

                let message;
                try {
                    message = await channel.messages.fetch(panel.messageId);
                } catch (err) {
                    await removeLiveRankPanel(panel.guildId, panel.messageId);
                    console.log(`🗑️ Painel removido: mensagem apagada`);
                    continue;
                }

                let rankData;
                let rankTitle;

                if (panel.tipo === 'global') {
                    rankData = await getRankGlobal(10);
                    rankTitle = '🏆 Ranking Global de Simuladores 🔴';
                } else {
                    rankData = await getRankLocal(panel.guildId, 10);
                    rankTitle = '🏆 Ranking Local de Simuladores 🔴';
                }

                if (!rankData || rankData.length === 0) {
                    continue;
                }

                const rankDescription = rankData.map((player, index) => {
                    const medal = index === 0 ? '<:coroapixel:1442668026813087836>' : index === 1 ? '<:trofeupixel:1442668024891969588>' : index === 2 ? '<:fogo:1442667877332422847>' : '<:raiopixel:1442668029065564341>';
                    return `${medal} **#${index + 1}** <@${player.user_id}>\n<:moedapixel:1442668030932029461> Pontos: ${player.points || 0} | <:positive:1442668038691491943> Vitórias: ${player.wins || 0} | <:negative:1442668040465682643> Derrotas: ${player.losses || 0}`;
                }).join('\n\n');

                const rankEmbed = createRedEmbed({
                    title: rankTitle,
                    description: rankDescription || 'Nenhum dado disponível',
                    footer: { text: '🔴 AO VIVO - Atualiza automaticamente quando jogadores vencem' },
                    timestamp: true
                });

                await message.edit({ embeds: [rankEmbed] });
                console.log(`✅ Painel ao vivo atualizado: ${panel.messageId}`);
            } catch (error) {
                console.error(`Erro ao atualizar painel ${panel.messageId}:`, error.message);
            }
        }
    } catch (error) {
        console.error('Erro ao atualizar painéis ao vivo:', error.message);
    }
}

module.exports = { handleButton };