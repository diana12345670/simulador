const { createRedEmbed, createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getTournamentById, updateTournament, deleteTournament, incrementServerSimulators } = require('../utils/database');
const { updateSimulatorPanel, startTournament, cancelSimulatorTimeout } = require('../systems/tournament/manager');
const { getEmojis } = require('../utils/emojis');
const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const timeouts = new Map(); 

async function handleButton(interaction) {
    const customId = interaction.customId;

    if (interaction.isStringSelectMenu()) {
        if (customId.startsWith('team_select_')) {
            await handleTeamSelect(interaction);
        }
        return;
    }

    if (customId.startsWith('simu_join_')) {
        await handleJoin(interaction);
    } else if (customId.startsWith('simu_leave_')) {
        await handleLeave(interaction);
    } else if (customId.startsWith('simu_cancel_')) {
        await handleCancel(interaction);
    } else if (customId.startsWith('simu_start_')) {
        await handleStart(interaction);
    } else if (customId.startsWith('team_join_')) {
        await handleTeamJoin(interaction);
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
        const emojis = getEmojis(interaction.client);
        await interaction.update({
            embeds: [createRedEmbed({
                description: `${emojis.negative} W.O. cancelado.`,
                timestamp: true
            })],
            components: []
        });
    }
}


async function handleTeamSelect(interaction) {
    // Novo formato: team_select_sim-GUILDID-TIMESTAMP_MENUINDEX
    // Precisamos extrair o simulatorId corretamente
    const customId = interaction.customId;
    const withoutPrefix = customId.replace('team_select_', '');
    // O último underscore separa o simulatorId do índice do menu
    const lastUnderscoreIndex = withoutPrefix.lastIndexOf('_');
    const simulatorId = lastUnderscoreIndex > 0 ? withoutPrefix.substring(0, lastUnderscoreIndex) : withoutPrefix;
    const selectedTeamNumber = parseInt(interaction.values[0].replace('time', ''));

    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador não está mais aberto.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const playerId = interaction.user.id;
    const currentPlayers = simulator.players || [];

    if (currentPlayers.includes(playerId)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Você já está inscrito neste simulador.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (currentPlayers.length >= simulator.maxPlayers) {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador já está lotado!', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const teamsData = simulator.teamsData || {};
    const playersPerTeam = simulator.playersPerTeam || parseInt(simulator.mode.charAt(0));

    let currentTeam = null;
    for (const [teamKey, players] of Object.entries(teamsData)) {
        if (players.includes(playerId)) {
            currentTeam = teamKey;
            break;
        }
    }

    if (currentTeam === `time${selectedTeamNumber}`) {
        return interaction.reply({
            embeds: [createErrorEmbed('Você já está neste time!', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const targetTeam = teamsData[`time${selectedTeamNumber}`] || [];
    if (targetTeam.length >= playersPerTeam) {
        return interaction.reply({
            embeds: [createErrorEmbed('Este time já está cheio!', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (currentTeam) {
        teamsData[currentTeam] = teamsData[currentTeam].filter(id => id !== playerId);
    }

    if (!teamsData[`time${selectedTeamNumber}`]) {
        teamsData[`time${selectedTeamNumber}`] = [];
    }
    teamsData[`time${selectedTeamNumber}`].push(playerId);

    const newPlayers = [];
    for (const teamPlayers of Object.values(teamsData)) {
        for (const pid of teamPlayers) {
            if (!newPlayers.includes(pid)) {
                newPlayers.push(pid);
            }
        }
    }

    await updateTournament(simulatorId, { 
        teamsData: teamsData,
        players: newPlayers 
    });

    const emojis = getEmojis(interaction.client);
    const action = currentTeam ? `trocou para o Time ${selectedTeamNumber}` : `entrou no Time ${selectedTeamNumber}`;
    await interaction.reply({
        embeds: [createRedEmbed({
            description: `${emojis.positive} Você ${action}!`,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    await updateSimulatorPanel(interaction.client, simulatorId);
}

async function handleTeamJoin(interaction) {
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const teamNumber = parseInt(parts[3]);

    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador não está mais aberto.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const playerId = interaction.user.id;
    const currentPlayers = simulator.players || [];

    if (currentPlayers.includes(playerId)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Você já está inscrito neste simulador.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (currentPlayers.length >= simulator.maxPlayers) {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador já está lotado!', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const teamsData = simulator.teamsData || {};
    const playersPerTeam = simulator.playersPerTeam || parseInt(simulator.mode.charAt(0));

    let currentTeam = null;
    for (const [teamKey, players] of Object.entries(teamsData)) {
        if (players.includes(playerId)) {
            currentTeam = teamKey;
            break;
        }
    }

    if (currentTeam === `time${teamNumber}`) {
        return interaction.reply({
            embeds: [createErrorEmbed('Você já está neste time!', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const targetTeam = teamsData[`time${teamNumber}`] || [];
    if (targetTeam.length >= playersPerTeam) {
        return interaction.reply({
            embeds: [createErrorEmbed('Este time já está cheio!', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (currentTeam) {
        teamsData[currentTeam] = teamsData[currentTeam].filter(id => id !== playerId);
    }

    if (!teamsData[`time${teamNumber}`]) {
        teamsData[`time${teamNumber}`] = [];
    }
    teamsData[`time${teamNumber}`].push(playerId);

    const newPlayers = [];
    for (const teamPlayers of Object.values(teamsData)) {
        for (const pid of teamPlayers) {
            if (!newPlayers.includes(pid)) {
                newPlayers.push(pid);
            }
        }
    }

    await updateTournament(simulatorId, { 
        teamsData: teamsData,
        players: newPlayers 
    });

    const emojis = getEmojis(interaction.client);
    const action = currentTeam ? `trocou para o Time ${teamNumber}` : `entrou no Time ${teamNumber}`;
    await interaction.reply({
        embeds: [createRedEmbed({
            description: `${emojis.positive} Você ${action}!`,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    await updateSimulatorPanel(interaction.client, simulatorId);
}

async function handleJoin(interaction) {
    const simulatorId = interaction.customId.replace('simu_join_', '');
    const playerId = interaction.user.id;
    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador não está mais aberto.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    // Verificação rigorosa de duplicidade e lotação
    const currentPlayers = simulator.players || [];
    if (currentPlayers.includes(playerId)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Você já está inscrito neste simulador.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (currentPlayers.length >= simulator.maxPlayers) {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador já está lotado.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const newPlayers = [...simulator.players, interaction.user.id];
    await updateTournament(simulatorId, { players: newPlayers });

    const emojis = getEmojis(interaction.client);
    await interaction.reply({
        embeds: [createRedEmbed({
            description: `${emojis.positive} Você entrou no simulador!`,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    await updateSimulatorPanel(interaction.client, simulatorId);
}

async function handleLeave(interaction) {
    const simulatorId = interaction.customId.replace('simu_leave_', '');
    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador não está mais aberto.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (!simulator.players.includes(interaction.user.id)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Você não está inscrito neste simulador.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const newPlayers = simulator.players.filter(id => id !== interaction.user.id);

    let teamsData = simulator.teamsData || {};
    if (simulator.teamSelection === 'manual') {
        for (const teamKey of Object.keys(teamsData)) {
            teamsData[teamKey] = teamsData[teamKey].filter(id => id !== interaction.user.id);
        }
    }

    await updateTournament(simulatorId, { 
        players: newPlayers,
        teamsData: teamsData
    });

    const emojis = getEmojis(interaction.client);
    await interaction.reply({
        embeds: [createRedEmbed({
            description: `${emojis.negative} Você saiu do simulador.`,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    await updateSimulatorPanel(interaction.client, simulatorId);
}

async function handleCancel(interaction) {
    const emojis = getEmojis(interaction.client);
    
    // Defer IMEDIATAMENTE para evitar timeout/duplicação
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const simulatorId = interaction.customId.replace('simu_cancel_', '');
    const simulator = await getTournamentById(simulatorId);

    if (!simulator) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Simulador não encontrado.', interaction.client)]
        });
    }

    const OWNER_ID = process.env.OWNER_ID || '1339336477661724674';
    if (interaction.user.id !== simulator.creatorId && interaction.user.id !== OWNER_ID) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Apenas o criador pode cancelar o simulador.', interaction.client)]
        });
    }

    cancelSimulatorTimeout(simulatorId);

    await interaction.editReply({
        embeds: [createRedEmbed({
            description: `${emojis.alerta} Cancelando simulador...`,
            timestamp: true
        })]
    });

    try {
        const mainChannel = interaction.guild.channels.cache.get(simulator.channelId);
        if (mainChannel && simulator.panelMessageId) {
            try {
                const panelMessage = await mainChannel.messages.fetch(simulator.panelMessageId);
                await panelMessage.edit({
                    embeds: [createRedEmbed({
                        title: `${emojis.fogo} Simulador ${simulator.mode} – ${simulator.jogo}`,
                        description: `${emojis.raiopixel} **Jogo:** ${simulator.jogo}\n${emojis.pergaminhopixel} **Versão:** ${simulator.versao}\n${emojis.trofeupixel} **Modo:** ${simulator.mode}\n${emojis.presentepixel} **Prêmio:** ${simulator.prize}\n\n${emojis.negative} **Este simulador foi cancelado**`,
                        footer: { text: 'Simulador cancelado' },
                        timestamp: true
                    })],
                    components: []
                });
            } catch (err) {
                console.error('Erro ao atualizar painel:', err);
            }
        }

        await deleteTournament(simulatorId);

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
                description: `${emojis.negative} Simulador cancelado com sucesso.`,
                timestamp: true
            })]
        });
    } catch (error) {
        console.error('Erro ao cancelar simulador:', error);
        await interaction.editReply({
            embeds: [createErrorEmbed('Erro ao cancelar simulador.', interaction.client)]
        });
    }
}

async function handleStart(interaction) {
    const emojis = getEmojis(interaction.client);
    const simulatorId = interaction.customId.replace('simu_start_', '');
    const simulator = await getTournamentById(simulatorId);

    if (!simulator) {
        return interaction.reply({
            embeds: [createErrorEmbed('Simulador não encontrado.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const OWNER_ID = process.env.OWNER_ID || '1339336477661724674';
    if (interaction.user.id !== simulator.creatorId && interaction.user.id !== OWNER_ID) {
        return interaction.reply({
            embeds: [createErrorEmbed('Apenas o criador pode iniciar o simulador.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (simulator.state !== 'open') {
        return interaction.reply({
            embeds: [createErrorEmbed('Este simulador não está mais aberto.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (simulator.players.length < simulator.maxPlayers) {
        return interaction.reply({
            embeds: [createErrorEmbed('O simulador ainda não está lotado.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.reply({
        embeds: [createRedEmbed({
            description: `${emojis.alerta} Iniciando simulador...`,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    await startTournament(interaction.client, simulatorId);
}

async function handleMatchWin(interaction, winnerTeamNum) {
    const emojis = getEmojis(interaction.client);
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const matchId = parts[3];

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) return;

    const OWNER_ID = process.env.OWNER_ID || '1339336477661724674';
    if (interaction.user.id !== simulator.creatorId && interaction.user.id !== OWNER_ID) {
        return interaction.reply({
            embeds: [createErrorEmbed('Apenas o criador pode declarar vencedor.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (!simulator.bracketData || !simulator.bracketData.matches) {
        return interaction.reply({
            embeds: [createErrorEmbed('Dados do torneio não encontrados.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const { advanceWinner } = require('../systems/tournament/bracket');
    const match = simulator.bracketData.matches.find(m => m.id === matchId);

    if (!match) {
        return interaction.reply({
            embeds: [createErrorEmbed('Partida não encontrada.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const winnerTeam = winnerTeamNum === 1 ? match.team1 : match.team2;
    
    if (!winnerTeam || !Array.isArray(winnerTeam)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Time inválido.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const result = advanceWinner(simulator.bracketData, matchId, winnerTeam);

    await updateTournament(simulator.id, { bracketData: result.bracketData });

    const winnerMentions = winnerTeam.map(id => `<@${id}>`).join(', ');
    await interaction.update({
        embeds: [createRedEmbed({
            description: `${emojis.positive} Vencedor: ${winnerMentions}`,
            timestamp: true
        })],
        components: []
    });

    await checkRoundComplete(interaction, simulator, result);
}

async function handleWalkover(interaction) {
    const emojis = getEmojis(interaction.client);
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const matchId = parts[3];

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) return;

    const OWNER_ID_WO = process.env.OWNER_ID || '1339336477661724674';
    if (interaction.user.id !== simulator.creatorId && interaction.user.id !== OWNER_ID_WO) {
        return interaction.reply({
            embeds: [createErrorEmbed('Apenas o criador pode declarar W.O.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (!simulator.bracketData || !simulator.bracketData.matches) {
        return interaction.reply({
            embeds: [createErrorEmbed('Dados do torneio não encontrados.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const match = simulator.bracketData.matches.find(m => m.id === matchId);
    
    if (!match || !match.team1 || !match.team2) {
        return interaction.reply({
            embeds: [createErrorEmbed('Partida não encontrada ou times inválidos.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const team1Mentions = match.team1.map(id => `<@${id}>`).join(', ');
    const team2Mentions = match.team2.map(id => `<@${id}>`).join(', ');

    const woButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`wo_team1_${simulatorId}_${matchId}`)
                .setLabel(`Time 1 venceu`)
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`wo_team2_${simulatorId}_${matchId}`)
                .setLabel(`Time 2 venceu`)
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`wo_cancel_${simulatorId}_${matchId}`)
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.reply({
        embeds: [createRedEmbed({
            title: `${emojis.alerta} Declarar W.O.`,
            description: `**Time 1:** ${team1Mentions}\n**Time 2:** ${team2Mentions}\n\n**Quem VENCEU pelo W.O.?**\n(O adversário sumiu/não compareceu)`,
            timestamp: true
        })],
        components: [woButtons],
        flags: MessageFlags.Ephemeral
    });
}

async function handleWalkoverSelection(interaction, winnerTeamNum) {
    const emojis = getEmojis(interaction.client);
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const matchId = parts[3];

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) return;

    if (!simulator.bracketData || !simulator.bracketData.matches) {
        return interaction.reply({
            embeds: [createErrorEmbed('Dados do torneio não encontrados.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const { advanceWinner } = require('../systems/tournament/bracket');
    const match = simulator.bracketData.matches.find(m => m.id === matchId);

    if (!match || !match.team1 || !match.team2) {
        return interaction.reply({
            embeds: [createErrorEmbed('Partida não encontrada ou times inválidos.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const winnerTeam = winnerTeamNum === 1 ? match.team1 : match.team2;
    const loserTeam = winnerTeamNum === 1 ? match.team2 : match.team1;
    
    if (!winnerTeam || !loserTeam || !Array.isArray(winnerTeam) || !Array.isArray(loserTeam)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Time inválido.', interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }

    const loserMentions = loserTeam.map(id => `<@${id}>`).join(', ');
    const winnerMentions = winnerTeam.map(id => `<@${id}>`).join(', ');

    const result = advanceWinner(simulator.bracketData, matchId, winnerTeam);

    await updateTournament(simulator.id, { bracketData: result.bracketData });

    await interaction.update({
        embeds: [createRedEmbed({
            title: `${emojis.positive} W.O. Registrado`,
            description: `**Vencedor:** ${winnerMentions}\n**Não compareceu:** ${loserMentions}`,
            timestamp: true
        })],
        components: []
    });

    await checkRoundComplete(interaction, simulator, result);
}

async function checkRoundComplete(interaction, simulator, result) {
    if (result.isFinal) {
        await handleChampion(interaction, simulator, result.champion, result.bracketData);
        return;
    }

    const updatedSimulator = await getTournamentById(simulator.id);
    if (!updatedSimulator) return;

    const bracketData = updatedSimulator.bracketData;

    // Filtra partidas pendentes (status !== 'completed')
    const pendingMatches = bracketData.matches.filter(m => m.status !== 'completed');
    
    if (pendingMatches.length === 0) {
        // Todas as partidas finalizadas
        return;
    }

    const currentRound = Math.min(...pendingMatches.map(m => m.round));

    const currentRoundMatches = bracketData.matches.filter(m => m.round === currentRound);
    const allCompleted = currentRoundMatches.every(m => m.status === 'completed');

    // Se é nova rodada, deleta canais antigos e cria novos
    if (result.isNewRound) {
        await deleteRoundChannels(interaction, simulator);

        if (result.nextMatch) {
            await createNextRoundChannels(interaction, simulator, result.nextMatch.round, bracketData);
        }
    }
}

async function deleteRoundChannels(interaction, simulator) {
    try {
        if (!simulator.categoryId) return;

        const category = interaction.guild.channels.cache.get(simulator.categoryId);
        if (!category) return;

        const matchChannels = category.children.cache.filter(ch => 
            ch.name.includes('rodada') || 
            ch.name.includes('quartas') || 
            ch.name.includes('semifinal') || 
            ch.name.includes('final')
        );

        for (const [, channel] of matchChannels) {
            try {
                await channel.delete('Rodada finalizada');
            } catch (err) {
                console.error('Erro ao deletar canal:', err.message);
            }
        }

        console.log(`✅ ${matchChannels.size} canais de partida deletados`);
    } catch (error) {
        console.error('Erro ao deletar canais da rodada:', error);
    }
}

async function handleChampion(interaction, simulator, championTeam, bracketData) {
    const { updateRankGlobal, updateRankLocal, recordMatchResult } = require('../utils/database');
    const championMentions = championTeam.map(id => `<@${id}>`).join(', ');

    const totalParticipants = simulator.players ? simulator.players.length : 0;
    const minParticipantsForPoints = 3;

    const loserIds = (simulator.players || []).filter(id => !championTeam.includes(id));

    const championEmbed = createRedEmbed({
        title: 'CAMPEÃO DO SIMULADOR',
        description: `Vencedor: ${championMentions}\nPrêmio: ${simulator.prize}${totalParticipants < minParticipantsForPoints ? '\n\n⚠️ Pontos não contabilizados (mínimo 3 participantes)' : ''}`,
        timestamp: true
    });

    const mainChannel = interaction.guild.channels.cache.get(simulator.channelId);
    if (mainChannel) {
        await mainChannel.send({ embeds: [championEmbed] });
    }

    if (totalParticipants >= minParticipantsForPoints) {
        for (const playerId of championTeam) {
            await updateRankGlobal(playerId, { wins: 1, points: 1 });
            await updateRankLocal(interaction.guildId, playerId, { wins: 1, points: 1 });
            
            await recordMatchResult(
                simulator.id,
                interaction.guildId,
                playerId,
                loserIds,
                simulator.mode,
                simulator.jogo
            );
        }
        console.log(`✅ Rankings e histórico atualizados para ${championTeam.length} jogadores`);
    } else {
        console.log(`⚠️ Simulador com apenas ${totalParticipants} participantes - pontos não contabilizados`);
    }

    await updateLiveRankPanels(interaction.client);

    await updateTournament(simulator.id, { state: 'finished', bracketData }); // Use simulator.id

    setTimeout(async () => {
        try {
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

            await deleteTournament(simulator.id); // Use simulator.id
            console.log(`✅ Simulador ${simulator.id} removido do banco de dados`);
        } catch (error) {
            console.error('Erro ao deletar canais:', error);
        }
    }, 5000);
}

async function createNextRoundChannels(interaction, simulator, round, bracketData) {
    const { createMatchChannel } = require('../systems/tournament/manager');
    const { getRoundName } = require('../systems/tournament/bracket');

    const category = interaction.guild.channels.cache.get(simulator.categoryId);
    if (!category) {
        console.error('❌ Categoria do torneio não encontrada');
        return;
    }
    
    const newMatches = bracketData.matches.filter(m => m.round === round && !m.isBye && m.status === 'pending');

    for (const match of newMatches) {
        if (!match.team1 || !match.team2 || !Array.isArray(match.team1) || !Array.isArray(match.team2)) {
            console.log(`⚠️ Pulando partida ${match.id} - times inválidos`);
            continue;
        }
        const roundName = getRoundName(match.round, bracketData.totalRounds);
        const matchNumber = match.id.split('match')[1];
        await createMatchChannel(interaction.guild, category, simulator, match, `${roundName}-${matchNumber}`);
    }
}

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

                const emojis = getEmojis(client);
                const rankDescription = rankData.map((player, index) => {
                    const medal = index === 0 ? emojis.coroapixel : index === 1 ? emojis.trofeupixel : index === 2 ? emojis.fogo : emojis.raiopixel;
                    return `${medal} **#${index + 1}** <@${player.user_id}>\n${emojis.moedapixel} Pontos: ${player.points || 0} | ${emojis.positive} Vitórias: ${player.wins || 0} | ${emojis.negative} Derrotas: ${player.losses || 0}`;
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

module.exports = { handleButton, checkRoundComplete };