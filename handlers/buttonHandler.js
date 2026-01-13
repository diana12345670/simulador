const { createRedEmbed, createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getTournamentById, updateTournament, deleteTournament, incrementServerSimulators, isUserBanned, isUserBannedInGuild } = require('../utils/database');
const { updateSimulatorPanel, startTournament, cancelSimulatorTimeout } = require('../systems/tournament/manager');
const { getEmojis } = require('../utils/emojis');
const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getGuildLanguage } = require('../utils/lang');
const { t } = require('../utils/i18n');

// Versão atual do painel - incrementar quando fazer mudanças estruturais
const CURRENT_PANEL_VERSION = '2.0';

const timeouts = new Map(); 

async function handleButton(interaction) {
    const lang = await getGuildLanguage(interaction.guildId);
    const customId = interaction.customId;

    // Verificar se é um painel antigo (sem versão)
    if (customId.startsWith('simu_') && !customId.includes('_v2_')) {
        const emojis = getEmojis(interaction.client);
        return interaction.editReply({
            embeds: [createErrorEmbed(
                `${emojis.negative} ${t(lang, 'old_panel_warning', { alerta: emojis.alerta })}\n\n${t(lang, 'old_panel_solution')}`,
                interaction.client
            )],
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.isStringSelectMenu()) {
        if (customId.startsWith('team_select_v2_')) {
            await handleTeamSelect(interaction);
        }
        return;
    }

    if (customId.startsWith('simu_join_v2_')) {
        await handleJoin(interaction);
    } else if (customId.startsWith('simu_leave_v2_')) {
        await handleLeave(interaction);
    } else if (customId.startsWith('simu_cancel_v2_')) {
        await handleCancel(interaction);
    } else if (customId.startsWith('simu_start_v2_')) {
        await handleStart(interaction);
    } else if (customId.startsWith('team_join_v2_')) {
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const lang = await getGuildLanguage(interaction.guildId);
    // Novo formato: team_select_v2_sim-GUILDID-TIMESTAMP_MENUINDEX
    const customId = interaction.customId;
    const withoutPrefix = customId.replace('team_select_v2_', '');
    // O último underscore separa o simulatorId do índice do menu
    const lastUnderscoreIndex = withoutPrefix.lastIndexOf('_');
    const simulatorId = lastUnderscoreIndex > 0 ? withoutPrefix.substring(0, lastUnderscoreIndex) : withoutPrefix;
    const selectedTeamNumber = parseInt(interaction.values[0].replace('time', ''));

    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'simul_closed'), interaction.client)]
        });
    }

    const playerId = interaction.user.id;
    const emojis = getEmojis(interaction.client);

    if (await isUserBanned(playerId)) {
        return interaction.editReply({
            embeds: [createRedEmbed({
                title: `${emojis.negative} ${t(lang, 'banned_global_title')}`,
                description: t(lang, 'banned_global_desc'),
                timestamp: true
            })]
        });
    }

    if (await isUserBannedInGuild(playerId, interaction.guildId)) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'banned_local'), interaction.client)]
        });
    }

    const currentPlayers = simulator.players || [];

    if (currentPlayers.includes(playerId)) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'join_already'), interaction.client)]
        });
    }

    if (currentPlayers.length >= simulator.max_players) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'join_full'), interaction.client)]
        });
    }

    const teamsData = simulator.teams_data || {};
    const playersPerTeam = simulator.players_per_team || parseInt(simulator.mode.charAt(0));

    let currentTeam = null;
    for (const [teamKey, players] of Object.entries(teamsData)) {
        if (players.includes(playerId)) {
            currentTeam = teamKey;
            break;
        }
    }

    if (currentTeam === `time${selectedTeamNumber}`) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'team_same'), interaction.client)]
        });
    }

    const targetTeam = teamsData[`time${selectedTeamNumber}`] || [];
    if (targetTeam.length >= playersPerTeam) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'team_full'), interaction.client)]
        });
    }

    if (currentTeam) {
        console.log(`🔄 Removendo jogador do time atual: ${currentTeam}`);
        teamsData[currentTeam] = teamsData[currentTeam].filter(id => id !== playerId);
    }

    console.log(`➕ Adicionando jogador ao time${selectedTeamNumber}`);
    teamsData[`time${selectedTeamNumber}`].push(playerId);
    console.log(`📊 teamsData após atualização:`, JSON.stringify(teamsData));

    const newPlayers = [];
    for (const teamPlayers of Object.values(teamsData)) {
        for (const pid of teamPlayers) {
            if (!newPlayers.includes(pid)) {
                newPlayers.push(pid);
            }
        }
    }

    await updateTournament(simulatorId, { 
        teams_data: teamsData,
        players: newPlayers 
    });
    console.log(`💾 Dados salvos no banco`);

    const actionText = currentTeam
        ? t(lang, 'switch_team', { team: selectedTeamNumber })
        : t(lang, 'join_team', { team: selectedTeamNumber });
    await interaction.editReply({
        embeds: [createRedEmbed({
            description: `${emojis.positive} ${actionText}`,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    console.log(`🔄 Atualizando painel após seleção de time: ${simulatorId}`);
    
    // Pequeno delay para garantir que o banco tenha tempo de processar
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Busca dados atualizados do banco (agora deve estar consistente)
    const freshSimulator = await getTournamentById(simulatorId);
    console.log(`📊 Dados buscados do banco: teams_data=${JSON.stringify(freshSimulator.teams_data || {})}`);
    
    await updateSimulatorPanel(interaction.client, simulatorId);
    console.log(`✅ Painel atualizado com sucesso`);
}

async function handleTeamJoin(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const parts = interaction.customId.split('_');
    // Formato antigo: team_join_simulatorId_teamNumber
    // Formato novo: team_join_v2_simulatorId_teamNumber
    let simulatorId, teamNumber;
    
    if (parts[2] === 'v2') {
        // Formato novo: team_join_v2_simulatorId_teamNumber
        simulatorId = parts.slice(3, parts.length - 1).join('_');
        teamNumber = parseInt(parts[parts.length - 1]);
    } else {
        // Formato antigo: team_join_simulatorId_teamNumber
        simulatorId = parts.slice(2, parts.length - 1).join('_');
        teamNumber = parseInt(parts[parts.length - 1]);
    }
    
    const lang = await getGuildLanguage(interaction.guildId);
    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'simul_closed'), interaction.client)]
        });
    }

    const playerId = interaction.user.id;
    const emojis = getEmojis(interaction.client);

    if (await isUserBanned(playerId)) {
        return interaction.editReply({
            embeds: [createRedEmbed({
                title: `${emojis.negative} ${t(lang, 'banned_global_title')}`,
                description: t(lang, 'banned_global_desc'),
                timestamp: true
            })]
        });
    }

    if (await isUserBannedInGuild(playerId, interaction.guildId)) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'banned_local'), interaction.client)]
        });
    }

    const playersPerTeam = simulator.players_per_team || parseInt(simulator.mode.charAt(0));
    const teamsData = simulator.teams_data || {};
    const targetTeam = teamsData[`time${teamNumber}`] || [];
    
    if (targetTeam.length >= playersPerTeam) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'team_full'), interaction.client)]
        });
    }

    // Remove jogador de outros times se já estiver em algum
    let currentTeam = null;
    for (const [teamKey, teamPlayers] of Object.entries(teamsData)) {
        const playerIndex = teamPlayers.indexOf(playerId);
        if (playerIndex !== -1) {
            currentTeam = teamKey;
            teamPlayers.splice(playerIndex, 1);
            break;
        }
    }

    // Adiciona ao novo time
    teamsData[`time${teamNumber}`].push(playerId);
    console.log(`🔄 handleTeamJoin: Adicionando jogador ${playerId} ao time${teamNumber}`);

    // Reconstrói array de players
    const newPlayers = [];
    for (const teamPlayers of Object.values(teamsData)) {
        for (const pid of teamPlayers) {
            if (!newPlayers.includes(pid)) {
                newPlayers.push(pid);
            }
        }
    }

    console.log(`📊 handleTeamJoin: teamsData=${JSON.stringify(teamsData)}, players=${JSON.stringify(newPlayers)}`);

    await updateTournament(simulatorId, { 
        teams_data: teamsData,
        players: newPlayers 
    });

    const action = currentTeam ? `trocou para o Time ${teamNumber}` : `entrou no Time ${teamNumber}`;
    await interaction.editReply({
        embeds: [createRedEmbed({
            description: `${emojis.positive} Você ${action}!`,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    console.log(`🔄 handleTeamJoin: Atualizando painel após entrar no time: ${simulatorId}`);
    
    // Pequeno delay para garantir consistência
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Busca dados atualizados do banco
    const freshSimulator = await getTournamentById(simulatorId);
    console.log(`📊 handleTeamJoin: Dados buscados do banco: teams_data=${JSON.stringify(freshSimulator.teams_data || {})}`);
    
    await updateSimulatorPanel(interaction.client, simulatorId);
    console.log(`✅ handleTeamJoin: Painel atualizado com sucesso`);
}

async function handleJoin(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const lang = await getGuildLanguage(interaction.guildId);
    const simulatorId = interaction.customId.replace('simu_join_v2_', '');
    const playerId = interaction.user.id;
    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'simul_closed'), interaction.client)]
        });
    }

    const emojis = getEmojis(interaction.client);

    if (await isUserBanned(playerId)) {
        return interaction.editReply({
            embeds: [createRedEmbed({
                title: `${emojis.negative} ${t(lang, 'banned_global_title')}`,
                description: t(lang, 'banned_global_desc'),
                timestamp: true
            })]
        });
    }

    if (await isUserBannedInGuild(playerId, interaction.guildId)) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'banned_local'), interaction.client)]
        });
    }

    // Verificação rigorosa de duplicidade e lotação
    const currentPlayers = simulator.players || [];
    if (currentPlayers.includes(playerId)) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'join_already'), interaction.client)]
        });
    }

    if (currentPlayers.length >= simulator.max_players) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'join_full'), interaction.client)]
        });
    }

    const newPlayers = [...currentPlayers, playerId];
    await updateTournament(simulatorId, { players: newPlayers });

    await interaction.editReply({
        embeds: [createRedEmbed({
            description: `${emojis.positive} ${t(lang, 'join_success')}`,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    await updateSimulatorPanel(interaction.client, simulatorId);
}

async function handleLeave(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const lang = await getGuildLanguage(interaction.guildId);
    const simulatorId = interaction.customId.replace('simu_leave_v2_', '');
    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'simul_closed'), interaction.client)]
        });
    }

    if (!simulator.players.includes(interaction.user.id)) {
        return interaction.editReply({
            embeds: [createErrorEmbed(t(lang, 'leave_not_in'), interaction.client)]
        });
    }

    const newPlayers = simulator.players.filter(id => id !== interaction.user.id);

    let teamsData = simulator.teams_data || {};
    if (simulator.team_selection === 'manual') {
        console.log(`🔄 handleLeave: Removendo jogador ${interaction.user.id} dos times`);
        
        // Remove jogador de todos os times
        for (const teamKey of Object.keys(teamsData)) {
            teamsData[teamKey] = teamsData[teamKey].filter(id => id !== interaction.user.id);
        }
        
        console.log(`📊 handleLeave: teamsData após remoção=${JSON.stringify(teamsData)}`);
    }

    await updateTournament(simulatorId, { 
        players: newPlayers,
        teams_data: teamsData
    });

    const emojis = getEmojis(interaction.client);
    await interaction.editReply({
        embeds: [createRedEmbed({
            description: `${emojis.negative} ${t(lang, 'leave_success')}`,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });

    console.log(`🔄 handleLeave: Atualizando painel após sair: ${simulatorId}`);
    
    // Pequeno delay para garantir consistência
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Busca dados atualizados do banco
    const freshSimulator = await getTournamentById(simulatorId);
    console.log(`📊 handleLeave: Dados buscados do banco: teams_data=${JSON.stringify(freshSimulator.teams_data || {})}`);
    
    await updateSimulatorPanel(interaction.client, simulatorId);
    console.log(`✅ handleLeave: Painel atualizado com sucesso`);
}

async function handleCancel(interaction) {
    const emojis = getEmojis(interaction.client);
    
    // Defer IMEDIATAMENTE para evitar timeout/duplicação
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const simulatorId = interaction.customId.replace('simu_cancel_v2_', '');
    const simulator = await getTournamentById(simulatorId);

    if (!simulator) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Simulador não encontrado.', interaction.client)]
        });
    }

    const OWNER_ID = process.env.OWNER_ID || '1339336477661724674';
    const OWNER_ID_2 = process.env.OWNER_ID_2 || '1438204670920364103';
    console.log(`🔍 DEBUG OWNER: User ID: ${interaction.user.id}, OWNER_ID: ${OWNER_ID}, OWNER_ID_2: ${OWNER_ID_2}`);
    if (interaction.user.id !== simulator.creator_id && interaction.user.id !== OWNER_ID && interaction.user.id !== OWNER_ID_2) {
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
        const mainChannel = interaction.guild.channels.cache.get(simulator.channel_id);
        if (mainChannel && simulator.panel_message_id) {
            try {
                const panelMessage = await mainChannel.messages.fetch(simulator.panel_message_id);
                await panelMessage.edit({
                    embeds: [createRedEmbed({
                        title: `${emojis.fogo} Simulador ${simulator.mode} – ${simulator.jogo}`,
                        description: `${emojis.raiopixel} **Jogo:** ${simulator.jogo}\n${emojis.pergaminhopixel} **Versão:** ${simulator.versao}\n${emojis.trofeupixel} **Modo:** ${simulator.mode}\n${emojis.presentepixel} **Prêmio:** ${simulator.prize}\n\n${emojis.negative} **Este simulador foi cancelado**`,
                        footer: { text: `${emojis.negative} Simulador cancelado` },
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
                if (simulator.category_id) {
                    const category = interaction.guild.channels.cache.get(simulator.category_id);
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
    const simulatorId = interaction.customId.replace('simu_start_v2_', '');
    
    // Defer imediato para evitar timeout do Discord
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Simulador não encontrado.', interaction.client)]
        });
    }

    const OWNER_ID = process.env.OWNER_ID || '1339336477661724674';
    const OWNER_ID_2 = process.env.OWNER_ID_2 || '1438204670920364103';
    
    if (interaction.user.id !== simulator.creator_id && 
        interaction.user.id !== OWNER_ID && 
        interaction.user.id !== OWNER_ID_2) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Apenas o criador pode iniciar o simulador.', interaction.client)]
        });
    }

    if (simulator.state !== 'open') {
        return interaction.editReply({
            embeds: [createErrorEmbed('Este simulador não está mais aberto.', interaction.client)]
        });
    }

    if (simulator.players.length < simulator.max_players) {
        return interaction.editReply({
            embeds: [createErrorEmbed('O simulador ainda não está lotado.', interaction.client)]
        });
    }

    await interaction.editReply({
        embeds: [createRedEmbed({
            description: `${emojis.alerta} Iniciando simulador...`,
            timestamp: true
        })]
    });

    await startTournament(interaction.client, simulatorId);
}

async function handleMatchWin(interaction, winnerTeamNum) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const emojis = getEmojis(interaction.client);
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const matchId = parts[3];

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) return;

    const OWNER_ID = process.env.OWNER_ID || '1339336477661724674';
    const OWNER_ID_2 = process.env.OWNER_ID_2 || '1438204670920364103';
    if (interaction.user.id !== simulator.creator_id && interaction.user.id !== OWNER_ID && interaction.user.id !== OWNER_ID_2) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Apenas o criador pode declarar vencedor.', interaction.client)]
        });
    }

    if (!simulator.bracket_data || !simulator.bracket_data.matches) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Dados do torneio não encontrados.', interaction.client)]
        });
    }

    const { advanceWinner } = require('../systems/tournament/bracket');
    const match = simulator.bracket_data.matches.find(m => m.id === matchId);

    if (!match) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Partida não encontrada.', interaction.client)]
        });
    }

    const winnerTeam = winnerTeamNum === 1 ? match.team1 : match.team2;
    
    if (!winnerTeam || !Array.isArray(winnerTeam)) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Time inválido.', interaction.client)]
        });
    }

    const result = advanceWinner(simulator.bracket_data, matchId, winnerTeam);

    await updateTournament(simulator.id, { bracket_data: result.bracketData });

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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const emojis = getEmojis(interaction.client);
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const matchId = parts[3];

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) return;

    const OWNER_ID_WO = process.env.OWNER_ID || '1339336477661724674';
    const OWNER_ID_WO_2 = process.env.OWNER_ID_2 || '1438204670920364103';
    if (interaction.user.id !== simulator.creator_id && interaction.user.id !== OWNER_ID_WO && interaction.user.id !== OWNER_ID_WO_2) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Apenas o criador pode declarar W.O.', interaction.client)]
        });
    }

    if (!simulator.bracket_data || !simulator.bracket_data.matches) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Dados do torneio não encontrados.', interaction.client)]
        });
    }

    const match = simulator.bracket_data.matches.find(m => m.id === matchId);
    
    if (!match || !match.team1 || !match.team2) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Partida não encontrada ou times inválidos.', interaction.client)]
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

    await interaction.editReply({
        embeds: [createRedEmbed({
            title: `${emojis.alerta} Declarar W.O.`,
            description: `**Time 1:** ${team1Mentions}\n**Time 2:** ${team2Mentions}\n\n**Quem VENCEU pelo W.O.?**\n(O adversário sumiu/não compareceu)`,
            timestamp: true
        })],
        components: [woButtons]
    });
}

async function handleWalkoverSelection(interaction, winnerTeamNum) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const emojis = getEmojis(interaction.client);
    const parts = interaction.customId.split('_');
    const simulatorId = parts[2];
    const matchId = parts[3];

    const simulator = await getTournamentById(simulatorId);
    if (!simulator) return;

    if (!simulator.bracket_data || !simulator.bracket_data.matches) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Dados do torneio não encontrados.', interaction.client)]
        });
    }

    const { advanceWinner } = require('../systems/tournament/bracket');
    const match = simulator.bracket_data.matches.find(m => m.id === matchId);

    if (!match || !match.team1 || !match.team2) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Partida não encontrada ou times inválidos.', interaction.client)]
        });
    }

    const winnerTeam = winnerTeamNum === 1 ? match.team1 : match.team2;
    const loserTeam = winnerTeamNum === 1 ? match.team2 : match.team1;
    
    if (!winnerTeam || !loserTeam || !Array.isArray(winnerTeam) || !Array.isArray(loserTeam)) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Time inválido.', interaction.client)]
        });
    }

    const loserMentions = loserTeam.map(id => `<@${id}>`).join(', ');
    const winnerMentions = winnerTeam.map(id => `<@${id}>`).join(', ');

    const result = advanceWinner(simulator.bracket_data, matchId, winnerTeam);

    await updateTournament(simulator.id, { bracket_data: result.bracketData });

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
        await handleChampion(interaction, simulator, result.champion, result.bracket_data);
        return;
    }

    const updatedSimulator = await getTournamentById(simulator.id);
    if (!updatedSimulator) return;

    const bracketData = updatedSimulator.bracket_data;

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
        if (!simulator.category_id) return;

        const category = interaction.guild.channels.cache.get(simulator.category_id);
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

    const mainChannel = interaction.guild.channels.cache.get(simulator.channel_id);
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

    await updateTournament(simulator.id, { state: 'finished', bracket_data: bracketData });

    setTimeout(async () => {
        try {
            if (simulator.category_id) {
                const category = interaction.guild.channels.cache.get(simulator.category_id);
                if (category) {
                    const categoryChannels = category.children.cache;
                    for (const [, channel] of categoryChannels) {
                        await channel.delete('Simulador finalizado');
                    }
                    await category.delete('Simulador finalizado');
                }
            }

            await deleteTournament(simulator.id);
            console.log(`✅ Simulador ${simulator.id} removido do banco de dados`);
        } catch (error) {
            console.error('Erro ao deletar canais:', error);
        }
    }, 5000);
}

async function createNextRoundChannels(interaction, simulator, round, bracketData) {
    const { createMatchChannel } = require('../systems/tournament/manager');
    const { getRoundName } = require('../systems/tournament/bracket');

    const category = interaction.guild.channels.cache.get(simulator.category_id);
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
    const { getLiveRankPanels, removeLiveRankPanel, getRankGlobal, getRankLocal } = require('../utils/database');

    try {
        const panels = await getLiveRankPanels();

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
                    footer: { text: `${emojis.fogo} AO VIVO - Atualiza automaticamente quando jogadores vencem` },
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