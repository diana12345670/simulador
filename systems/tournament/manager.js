// manager.js - Gerenciador principal de torneios (simuladores)
const { readJSON, writeJSON } = require('../../utils/jsonDB');
const { createRedEmbed } = require('../../utils/embeds');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const { generateBracket, advanceWinner, getRoundName } = require('./bracket');
const path = require('path');
const {
    createTournament,
    getTournamentById,
    updateTournament,
    deleteTournament,
    updateRankGlobal,
    updateRankLocal,
    incrementServerSimulators
} = require('../../utils/database');

const RANK_LOCAL_DIR = path.join(__dirname, '../../data/rank_local');

/**
 * Cria um novo simulador
 * @param {Object} guild - Guild do Discord
 * @param {Object} creator - Criador do simulador
 * @param {Object} options - Opções do simulador
 * @returns {Promise<Object>} Dados do simulador criado
 */
async function createSimulator(guild, creator, options) {
    const { mode, jogo, versao, modo, maxPlayers, teamSelection = 'aleatorio', prize = 'Nenhum', channel } = options;

    // Gera ID único
    const simulatorId = `sim-${guild.id}-${Date.now()}`;

    // Calcula quantos jogadores por time e total de times
    const playersPerTeam = parseInt(mode.charAt(0));
    const totalTeams = maxPlayers / playersPerTeam;

    // Inicializa estrutura de times para seleção manual
    const teamsData = {};
    if (teamSelection === 'manual') {
        for (let i = 1; i <= totalTeams; i++) {
            teamsData[`time${i}`] = [];
        }
    }

    // Cria dados do simulador
    const simulator = {
        id: simulatorId,
        guild_id: guild.id,
        channel_id: channel.id,
        creator_id: creator.id,
        mode,
        jogo,
        versao,
        modo_jogo: modo,
        max_players: maxPlayers,
        team_selection: teamSelection,
        players_per_team: playersPerTeam,
        total_teams: totalTeams,
        teams_data: teamsData,
        prize,
        players: [],
        bracket_data: null,
        state: 'open',
        panel_message_id: null,
        category_id: null
    };

    // Salva no banco de dados com todos os campos
    await createTournament({
        ...simulator,
        modoJogo: modo,
        teamSelection,
        playersPerTeam,
        totalTeams,
        teamsData
    });

    // Incrementa contador de simuladores do servidor (para Top Servidores)
    await incrementServerSimulators(guild.id);

    // Monta descrição do painel
    const selectionText = teamSelection === 'manual' 
        ? '<:joiapixel:1442668036090888274> **Escolha de Times:** Manual (escolha seu time)'
        : '<:joiapixel:1442668036090888274> **Escolha de Times:** Aleatório';

    let panelDescription;
    if (teamSelection === 'manual') {
        // Monta lista de times para seleção manual
        let teamsText = '';
        for (let i = 1; i <= totalTeams; i++) {
            teamsText += `\n**Time ${i}** (0/${playersPerTeam}): Vazio`;
        }
        panelDescription = `<:raiopixel:1442668029065564341> **Jogo:** ${jogo}\n<:pergaminhopixel:1442668033242959963> **Versão:** ${versao}\n<:joiapixel:1442668036090888274> **Modo/Mapa:** ${modo}\n${selectionText}\n<:presentepixel:1442667950313308332> **Prêmio:** ${prize}\n\n**Jogadores (0/${maxPlayers})**${teamsText}`;
    } else {
        panelDescription = `<:raiopixel:1442668029065564341> **Jogo:** ${jogo}\n<:pergaminhopixel:1442668033242959963> **Versão:** ${versao}\n<:joiapixel:1442668036090888274> **Modo/Mapa:** ${modo}\n${selectionText}\n<:presentepixel:1442667950313308332> **Prêmio:** ${prize}\n\n**Jogadores (0/${maxPlayers})**\nNenhum jogador ainda`;
    }

    // Cria e envia painel de entrada
    const panelEmbed = createRedEmbed({
        title: `<:fogo:1442667877332422847> Simulador ${mode} – ${jogo}`,
        description: panelDescription,
        footer: { text: '<:alerta:1442668042873081866> Aguardando jogadores...' },
        timestamp: true
    });

    // Adiciona imagem pequena no canto se disponível
    const guildImage = guild.bannerURL({ size: 256 }) || guild.iconURL({ size: 256 });
    if (guildImage) {
        panelEmbed.setThumbnail(guildImage);
    }

    // Cria botões dependendo do modo de seleção
    const components = [];

    if (teamSelection === 'manual') {
        // Se houver mais de 2 times, usa um menu de seleção
        if (totalTeams > 2) {
            const teamOptions = [];
            for (let i = 1; i <= totalTeams; i++) {
                teamOptions.push({
                    label: `Time ${i}`,
                    value: `time${i}`
                });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`team_select_${simulatorId}`)
                .setPlaceholder('Selecione um time...')
                .addOptions(teamOptions);

            components.push(new ActionRowBuilder().addComponents(selectMenu));
        } else {
            // Botões para escolher time (máximo 5 por row)
            let currentRow = new ActionRowBuilder();
            let buttonsInRow = 0;

            for (let i = 1; i <= totalTeams; i++) {
                if (buttonsInRow >= 5) {
                    components.push(currentRow);
                    currentRow = new ActionRowBuilder();
                    buttonsInRow = 0;
                }
                currentRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`team_join_${simulatorId}_${i}`)
                        .setLabel(`Time ${i}`)
                        .setStyle(ButtonStyle.Primary)
                );
                buttonsInRow++;
            }
            if (buttonsInRow > 0) {
                components.push(currentRow);
            }
        }

        // Adiciona botões de sair e cancelar
        const controlButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`simu_leave_${simulatorId}`)
                    .setLabel('Sair')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`simu_cancel_${simulatorId}`)
                    .setLabel('Cancelar Simulador')
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(controlButtons);
    } else {
        // Botões normais para seleção aleatória
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`simu_join_${simulatorId}`)
                    .setLabel('Entrar')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`simu_leave_${simulatorId}`)
                    .setLabel('Sair')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`simu_cancel_${simulatorId}`)
                    .setLabel('Cancelar Simulador')
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(buttons);
    }

    console.log(`📤 Enviando painel com ${components.length} rows de botões`);

    try {
        const panelMessage = await channel.send({
            embeds: [panelEmbed],
            components: components
        });

        console.log(`✅ Painel enviado - ID: ${panelMessage.id}`);
        console.log(`✅ Mensagem tem ${panelMessage.components.length} ActionRows`);

        // Atualiza com ID da mensagem do painel
        await updateTournament(simulatorId, { panelMessageId: panelMessage.id });
    } catch (error) {
        console.error('❌ Erro ao enviar painel:', error);
        throw error;
    }

    console.log(`✅ Simulador ${mode} criado: ${simulatorId}`);

    // Retorna com nomes de campos consistentes
    return {
        id: simulatorId,
        guildId: guild.id,
        channelId: channel.id,
        creatorId: creator.id,
        mode,
        jogo,
        versao,
        maxPlayers,
        players: [],
        prize,
        state: 'open',
        panelMessageId: null,
        categoryId: null,
        bracketData: null
    };
}

/**
 * Cancela simulador se não estiver cheio
 */
async function cancelSimulatorIfNotFull(client, simulatorId) {
    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') return;

    // Verifica se já está cheio
    if (simulator.players.length >= simulator.maxPlayers) return;

    // Cancela o simulador
    await updateTournament(simulatorId, { state: 'cancelled' });

    try {
        const guild = client.guilds.cache.get(simulator.guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(simulator.channelId);
        if (channel) {
            // Atualiza o painel para mostrar cancelamento
            if (simulator.panelMessageId) {
                try {
                    const panelMessage = await channel.messages.fetch(simulator.panelMessageId);

                    const cancelledEmbed = createRedEmbed({
                        title: `<:fogo:1442667877332422847> Simulador ${simulator.mode} – ${simulator.jogo}`,
                        description: `<:raiopixel:1442668029065564341> **Jogo:** ${simulator.jogo}\n<:pergaminhopixel:1442668033242959963> **Versão:** ${simulator.versao}\n<:trofeupixel:1442668024891969588> **Modo:** ${simulator.mode}\n<:presentepixel:1442667950313308332> **Prêmio:** ${simulator.prize}\n\n<:negative:1442668040465682643> **Este simulador foi cancelado automaticamente**\n<:alerta:1442668042873081866> Timeout de 6 minutos por falta de jogadores`,
                        footer: { text: '<:negative:1442668040465682643> Simulador cancelado por timeout' },
                        timestamp: true
                    });

                    await panelMessage.edit({
                        embeds: [cancelledEmbed],
                        components: []
                    });
                } catch (error) {
                    console.error('Erro ao atualizar painel:', error);
                }
            }

            // Tenta notificar criador
            try {
                const creator = await client.users.fetch(simulator.creatorId);
                await creator.send({
                    embeds: [createRedEmbed({
                        title: ':negative: Simulador Cancelado',
                        description: `Seu simulador "${simulator.jogo} ${simulator.mode}" foi cancelado por falta de jogadores (timeout de 6 minutos).`,
                        timestamp: true
                    })]
                });
            } catch (error) {
                console.log('Não foi possível enviar DM para o criador');
            }
        }

        // Apaga categoria se existir
        if (simulator.categoryId) {
            const category = guild.channels.cache.get(simulator.categoryId);
            if (category) {
                const categoryChannels = category.children.cache;
                for (const [, ch] of categoryChannels) {
                    await ch.delete('Limpeza de simulador cancelado');
                }
                await category.delete('Simulador cancelado');
            }
        }

        // Remove do banco
        await deleteTournament(simulatorId);
    } catch (error) {
        console.error('Erro ao cancelar simulador:', error);
    }
}

/**
 * Atualiza o painel do simulador
 */
async function updateSimulatorPanel(client, simulatorId) {
    const simulator = await getTournamentById(simulatorId);

    if (!simulator) return;

    const guild = client.guilds.cache.get(simulator.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(simulator.channelId);
    if (!channel) return;

    try {
        const message = await channel.messages.fetch(simulator.panelMessageId);

        console.log(`🔄 Atualizando painel - Mensagem tem ${message.components.length} ActionRows`);

        // Monta descrição dependendo do modo de seleção
        const selectionText = simulator.teamSelection === 'manual' 
            ? '<:joiapixel:1442668036090888274> **Escolha de Times:** Manual (escolha seu time)'
            : '<:joiapixel:1442668036090888274> **Escolha de Times:** Aleatório';

        let panelDescription;
        if (simulator.teamSelection === 'manual') {
            // Monta lista de times para seleção manual
            let teamsText = '';
            const teamsData = simulator.teamsData || {};
            const playersPerTeam = simulator.playersPerTeam || parseInt(simulator.mode.charAt(0));
            const totalTeams = simulator.totalTeams || Math.floor(simulator.maxPlayers / playersPerTeam);

            for (let i = 1; i <= totalTeams; i++) {
                const teamPlayers = teamsData[`time${i}`] || [];
                const playerMentions = teamPlayers.length > 0 
                    ? teamPlayers.map(id => `<@${id}>`).join(', ')
                    : 'Vazio';
                teamsText += `\n**Time ${i}** (${teamPlayers.length}/${playersPerTeam}): ${playerMentions}`;
            }
            const currentPlayers = simulator.players || [];
            panelDescription = `<:raiopixel:1442668029065564341> **Jogo:** ${simulator.jogo}\n<:pergaminhopixel:1442668033242959963> **Versão:** ${simulator.versao}\n<:joiapixel:1442668036090888274> **Modo/Mapa:** ${simulator.modoJogo || simulator.mode}\n${selectionText}\n<:presentepixel:1442667950313308332> **Prêmio:** ${simulator.prize}\n\n**Jogadores (${currentPlayers.length}/${simulator.maxPlayers})**${teamsText}`;
        } else {
            const playersList = simulator.players.length > 0
                ? simulator.players.map(id => `<@${id}>`).join('\n')
                : 'Nenhum jogador ainda';
            panelDescription = `<:raiopixel:1442668029065564341> **Jogo:** ${simulator.jogo}\n<:pergaminhopixel:1442668033242959963> **Versão:** ${simulator.versao}\n<:joiapixel:1442668036090888274> **Modo/Mapa:** ${simulator.modoJogo || simulator.mode}\n${selectionText}\n<:presentepixel:1442667950313308332> **Prêmio:** ${simulator.prize}\n\n**Jogadores (${simulator.players.length}/${simulator.maxPlayers})**\n${playersList}`;
        }

        const updatedEmbed = createRedEmbed({
            title: `<:fogo:1442667877332422847> Simulador ${simulator.mode} – ${simulator.jogo}`,
            description: panelDescription,
            footer: { text: simulator.players.length >= simulator.maxPlayers ? '<:positive:1442668038691491943> Simulador lotado!' : '<:alerta:1442668042873081866> Aguardando jogadores...' },
            timestamp: true
        });

        // Adiciona imagem pequena no canto se disponível
        const guildImage = guild.bannerURL({ size: 256 }) || guild.iconURL({ size: 256 });
        if (guildImage) {
            updatedEmbed.setThumbnail(guildImage);
        }

        // Mantém os botões originais ao editar
        await message.edit({
            embeds: [updatedEmbed],
            components: message.components
        });

        console.log(`✅ Painel atualizado`);

        // Se lotado, inicia torneio
        if (simulator.players.length >= simulator.maxPlayers && simulator.state === 'open') {
            await startTournament(client, simulatorId);
        }
    } catch (error) {
        console.error('Erro ao atualizar painel:', error);
    }
}

/**
 * Inicia o torneio
 */
async function startTournament(client, simulatorId) {
    const simulator = await getTournamentById(simulatorId);

    const guild = client.guilds.cache.get(simulator.guildId);
    const channel = guild.channels.cache.get(simulator.channelId);

    // Se for seleção manual, valida se todos os times estão completos
    if (simulator.teamSelection === 'manual') {
        const teamsData = simulator.teamsData || {};
        const playersPerTeam = simulator.playersPerTeam || parseInt(simulator.mode.charAt(0));
        const totalTeams = simulator.totalTeams || (simulator.maxPlayers / playersPerTeam);

        // Verifica se todos os times estão completos
        for (let i = 1; i <= totalTeams; i++) {
            const teamPlayers = teamsData[`time${i}`] || [];
            if (teamPlayers.length !== playersPerTeam) {
                console.log(`❌ Time ${i} incompleto: ${teamPlayers.length}/${playersPerTeam}`);
                await channel.send({
                    embeds: [createRedEmbed({
                        title: '<:negative:1442668040465682643> Erro ao iniciar torneio',
                        description: `O Time ${i} está incompleto! (${teamPlayers.length}/${playersPerTeam} jogadores)`,
                        timestamp: true
                    })]
                });
                return;
            }
        }
    }

    // Gera chaveamento (passa opções de times se for seleção manual)
    const bracketOptions = {
        teamSelection: simulator.teamSelection,
        teamsData: simulator.teamsData
    };
    const bracketData = generateBracket(simulator.players, simulator.mode, bracketOptions);

    // Cria categoria para partidas
    const category = await guild.channels.create({
        name: `Torneio ${simulator.jogo}`.substring(0, 100),
        type: ChannelType.GuildCategory
    });

    // Atualiza simulador com estado running, bracket e categoria
    await updateTournament(simulatorId, {
        state: 'running',
        bracketData: bracketData,
        categoryId: category.id
    });

    // Atualiza objeto local
    simulator.state = 'running';
    simulator.bracketData = bracketData;
    simulator.categoryId = category.id;

    await channel.send({
        embeds: [createRedEmbed({
            title: '<:fogo:1442667877332422847> TORNEIO INICIADO!',
            description: 'O chaveamento foi gerado! Preparando canais...',
            timestamp: true
        })]
    });

    // Cria canais para primeira rodada
    const firstRoundMatches = simulator.bracketData.matches.filter(m => m.round === 1);
    for (const match of firstRoundMatches) {
        const matchNumber = match.id.split('match')[1];
        await createMatchChannel(guild, category, simulator, match, `rodada-1-${matchNumber}`);
    }

    await channel.send({
        embeds: [createRedEmbed({
            title: '<:positive:1442668038691491943> Canais criados!',
            description: 'As partidas da primeira rodada foram criadas. Boa sorte!',
            timestamp: true
        })]
    });
}

/**
 * Cria canal de partida
 */
async function createMatchChannel(guild, category, simulator, match, channelName) {
    const { startInactivityTimer } = require('../kaori/assistant');

    const team1Mentions = match.team1.map(id => `<@${id}>`).join(', ');
    const team2Mentions = match.team2.map(id => `<@${id}>`).join(', ');

    const matchChannel = await guild.channels.create({
        name: channelName.substring(0, 100),
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            ...match.team1.map(playerId => ({
                id: playerId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            })),
            ...match.team2.map(playerId => ({
                id: playerId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            }))
        ]
    });

    match.channelId = matchChannel.id;
    await updateTournament(simulator.id, { bracketData: simulator.bracketData });

    const matchEmbed = createRedEmbed({
        title: '<:raiopixel:1442668029065564341> Partida',
        fields: [
            { name: 'Time 1', value: team1Mentions, inline: true },
            { name: 'VS', value: '<:raiopixel:1442668029065564341>', inline: true },
            { name: 'Time 2', value: team2Mentions, inline: true }
        ],
        description: 'Boa sorte! O criador do simulador declarará o vencedor.\n\n*Mencione o criador ou digite "Kaori" se precisar de ajuda!*',
        timestamp: true
    });

    const matchButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`match_win1_${simulator.id}_${match.id}`)
                .setLabel('Time 1 Venceu')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`match_win2_${simulator.id}_${match.id}`)
                .setLabel('Time 2 Venceu')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`match_wo_${simulator.id}_${match.id}`)
                .setLabel('W.O.')
                .setStyle(ButtonStyle.Secondary)
        );

    await matchChannel.send({
        embeds: [matchEmbed],
        components: [matchButtons]
    });

    startInactivityTimer(matchChannel.id, matchChannel, match, simulator.creatorId);
}

/**
 * Atualiza rankings
 */
async function updateRankings(guildId, memberCount, playerId, points) {
    // Atualiza ranking local e global usando funções do database
    // Vencedor do simulador recebe apenas 1 ponto
    await updateRankLocal(guildId, playerId, {
        wins: 1,
        points: 1
    });

    await updateRankGlobal(playerId, {
        wins: 1,
        points: 1
    });
}

module.exports = {
    createSimulator,
    updateSimulatorPanel,
    startTournament,
    createMatchChannel,
    updateRankings,
    advanceWinner,
    getRoundName
};