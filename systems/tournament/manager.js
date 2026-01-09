// manager.js - Gerenciador principal de torneios (simuladores)
const { readJSON, writeJSON } = require('../../utils/jsonDB');
const { createRedEmbed } = require('../../utils/embeds');
const { getEmojis } = require('../../utils/emojis');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const { generateBracket, advanceWinner, getRoundName } = require('./bracket');
const { t } = require('../../utils/i18n');
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

const simulatorTimeouts = new Map();
const TIMEOUT_DURATION = 6 * 60 * 1000;

/**
 * Cria um novo simulador
 * @param {Object} client - Cliente do Discord
 * @param {Object} guild - Guild do Discord
 * @param {Object} creator - Criador do simulador
 * @param {Object} options - Opções do simulador
 * @returns {Promise<Object>} Dados do simulador criado
 */
async function createSimulator(client, guild, creator, options) {
    const { mode, jogo, versao, modo, maxPlayers, teamSelection = 'aleatorio', startMode = 'automatico', prize = 'Nenhum', channel } = options;

    const emojis = getEmojis(client);
    const { getGuildLanguage } = require('../../utils/lang');
    const { t } = require('../../utils/i18n');
    const lang = await getGuildLanguage(guild.id);
    
    console.log(`🌍 DEBUG: Guild ${guild.id} - Idioma detectado: ${lang}`);

    const simulatorId = `sim-${guild.id}-${Date.now()}`;

    const playersPerTeam = parseInt(mode.charAt(0));
    const totalTeams = maxPlayers / playersPerTeam;

    const teamsData = {};
    if (teamSelection === 'manual') {
        for (let i = 1; i <= totalTeams; i++) {
            teamsData[`time${i}`] = [];
        }
    }

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
        start_mode: startMode,
        players_per_team: playersPerTeam,
        total_teams: totalTeams,
        teams_data: teamsData,
        prize,
        players: [],
        bracket_data: null,
        state: 'open',
        panel_message_id: null,
        category_id: null,
        language: lang // Salva o idioma no simulador
    };

    await createTournament({
        ...simulator,
        modoJogo: modo,
        teamSelection,
        startMode,
        playersPerTeam,
        totalTeams,
        teamsData
    });

    // Monta descrição do painel
    const selectionText = teamSelection === 'manual' 
        ? `${emojis.joiapixel} ${t(lang, 'selection_manual')}`
        : `${emojis.joiapixel} ${t(lang, 'selection_auto')}`;

    let panelDescription;
    if (teamSelection === 'manual') {
        // Monta lista de times para seleção manual
        let teamsText = '';
        for (let i = 1; i <= totalTeams; i++) {
            teamsText += `\n${t(lang, 'panel_team_line', { num: i, count: 0, max: playersPerTeam, players: t(lang, 'panel_no_players') })}`;
        }
        panelDescription = `${emojis.raiopixel} **${t(lang, 'panel_game')}:** ${jogo}\n${emojis.pergaminhopixel} **${t(lang, 'panel_version')}:** ${versao}\n${emojis.joiapixel} **${t(lang, 'panel_mode')}:** ${modo}\n${selectionText}\n${emojis.presentepixel} **${t(lang, 'panel_prize')}:** ${prize}\n\n${t(lang, 'panel_players', { count: 0, max: maxPlayers })}${teamsText}`;
    } else {
        panelDescription = `${emojis.raiopixel} **${t(lang, 'panel_game')}:** ${jogo}\n${emojis.pergaminhopixel} **${t(lang, 'panel_version')}:** ${versao}\n${emojis.joiapixel} **${t(lang, 'panel_mode')}:** ${modo}\n${selectionText}\n${emojis.presentepixel} **${t(lang, 'panel_prize')}:** ${prize}\n\n${t(lang, 'panel_players', { count: 0, max: maxPlayers })}\n${t(lang, 'panel_no_players')}`;
    }

    // Cria e envia painel de entrada
    const panelEmbed = createRedEmbed({
        title: `${emojis.fogo} ${t(lang, 'panel_title', { mode, game: jogo })}`,
        description: panelDescription,
        footer: { text: t(lang, 'panel_waiting') },
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
                    label: t(lang, 'team_name', { num: i }),
                    value: `time${i}`
                });
            }

            // Discord limita a 25 opções por select menu
            // Se houver mais de 25 times, divide em múltiplos menus
            const MAX_OPTIONS = 25;
            const chunks = [];
            for (let i = 0; i < teamOptions.length; i += MAX_OPTIONS) {
                chunks.push(teamOptions.slice(i, i + MAX_OPTIONS));
            }

            // Adiciona cada chunk como um select menu separado (máximo 4 para deixar espaço para botões de controle)
            const maxMenus = Math.min(chunks.length, 4);
            for (let i = 0; i < maxMenus; i++) {
                const chunk = chunks[i];
                const startNum = i * MAX_OPTIONS + 1;
                const endNum = Math.min((i + 1) * MAX_OPTIONS, totalTeams);

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`team_select_${simulatorId}_${i}`)
                    .setPlaceholder(t(lang, 'select_team_placeholder', { range: `${startNum}-${endNum}` }))
                    .addOptions(chunk);

                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }
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
                        .setLabel(t(lang, 'team_name', { num: i }))
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
                    .setLabel(t(lang, 'button_leave'))
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`simu_cancel_${simulatorId}`)
                    .setLabel(t(lang, 'button_cancel'))
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(controlButtons);
    } else {
        // Botões normais para seleção aleatória
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`simu_join_v2_${simulatorId}`)
                    .setLabel(t(lang, 'button_join'))
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`simu_leave_v2_${simulatorId}`)
                    .setLabel(t(lang, 'button_leave'))
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`simu_cancel_v2_${simulatorId}`)
                    .setLabel(t(lang, 'button_cancel'))
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
        await updateTournament(simulatorId, { panel_message_id: panelMessage.id });
    } catch (error) {
        console.error('❌ Erro ao enviar painel:', error);
        throw error;
    }

    console.log(`✅ Simulador ${mode} criado: ${simulatorId}`);

    const timeoutId = setTimeout(() => {
        console.log(`⏰ DEBUG: Timeout disparado para: ${simulatorId} após ${TIMEOUT_DURATION / 60000} minutos`);
        cancelSimulatorIfNotFull(client, simulatorId);
    }, TIMEOUT_DURATION);
    
    // Limpa qualquer timer existente para este simulador (prevenção de duplicação)
    if (simulatorTimeouts.has(simulatorId)) {
        clearTimeout(simulatorTimeouts.get(simulatorId));
        console.log(`⏰ DEBUG: Timer duplicado encontrado e limpo para: ${simulatorId}`);
    }
    
    simulatorTimeouts.set(simulatorId, timeoutId);
    console.log(`⏱️ Timer de ${TIMEOUT_DURATION / 60000} minutos iniciado para: ${simulatorId}`);
    console.log(`⏰ DEBUG: Timeout ID: ${timeoutId}, Total timers ativos: ${simulatorTimeouts.size}`);

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
    console.log(`⏰ DEBUG: cancelSimulatorIfNotFull chamado para: ${simulatorId}`);
    
    if (simulatorTimeouts.has(simulatorId)) {
        clearTimeout(simulatorTimeouts.get(simulatorId));
        simulatorTimeouts.delete(simulatorId);
        console.log(`⏰ DEBUG: Timer limpo para: ${simulatorId}`);
    } else {
        console.log(`⏰ DEBUG: Nenhum timer encontrado para: ${simulatorId}`);
    }

    const simulator = await getTournamentById(simulatorId);

    if (!simulator || simulator.state !== 'open') return;

    // Verifica se já está cheio
    if (simulator.players.length >= simulator.max_players) return;

    console.log(`⏱️ Cancelando simulador por timeout: ${simulatorId}`);
    const emojis = getEmojis(client);

    // Cancela o simulador
    await updateTournament(simulatorId, { state: 'cancelled' });

    try {
        const guild = client.guilds.cache.get(simulator.guild_id);
        if (!guild) return;

        const channel = guild.channels.cache.get(simulator.channel_id);
        if (channel) {
            // Atualiza o painel para mostrar cancelamento
            if (simulator.panel_message_id) {
                try {
                    const panelMessage = await channel.messages.fetch(simulator.panel_message_id);

                    const cancelledEmbed = createRedEmbed({
                        title: `${emojis.fogo} ${t(simulator.language || 'pt', 'panel_title', { mode: simulator.mode, game: simulator.jogo })}`,
                        description: `${emojis.raiopixel} **${t(simulator.language || 'pt', 'panel_game')}:** ${simulator.jogo}\n${emojis.pergaminhopixel} **${t(simulator.language || 'pt', 'panel_version')}:** ${simulator.versao}\n${emojis.trofeupixel} **${t(simulator.language || 'pt', 'panel_mode')}:** ${simulator.mode}\n${emojis.presentepixel} **${t(simulator.language || 'pt', 'panel_prize')}:** ${simulator.prize}\n\n${emojis.negative} **${t(simulator.language || 'pt', 'simulator_cancelled_auto')}**\n${emojis.alerta} ${t(simulator.language || 'pt', 'simulator_timeout_reason')}`,
                        footer: { text: t(simulator.language || 'pt', 'simulator_cancelled_timeout') },
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

        }

        // Apaga categoria se existir
        if (simulator.category_id) {
            const category = guild.channels.cache.get(simulator.category_id);
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

    const emojis = getEmojis(client);

    // Compatibilidade com chaves antigas (snake_case) gravadas no JSON
    const guildId = simulator.guildId || simulator.guild_id;
    const channelId = simulator.channelId || simulator.channel_id;
    const panelMessageId = simulator.panelMessageId || simulator.panel_message_id;
    const maxPlayers = simulator.maxPlayers || simulator.max_players;
    const playersPerTeam = simulator.playersPerTeam || simulator.players_per_team || parseInt((simulator.mode || '1v1').charAt(0));
    const totalTeams = simulator.totalTeams || simulator.total_teams || Math.floor((maxPlayers || 2) / playersPerTeam) || 1;
    const players = simulator.players || simulator.players_list || [];
    const teamsData = simulator.teamsData || simulator.teams_data || {};
    const teamSelection = simulator.teamSelection || simulator.team_selection || 'aleatorio';
    const startMode = simulator.startMode || simulator.start_mode || 'automatico';
    const guildLanguage = (simulator.language) || (simulator.guildLanguage) || null; // se vier salvo
    const { getGuildLanguage } = require('../../utils/lang');
    const lang = guildLanguage || (await getGuildLanguage(guildId));
    const { t } = require('../../utils/i18n');

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    try {
        const message = await channel.messages.fetch(panelMessageId);
        if (!message) return;
        
        console.log(`🔄 Atualizando painel - Mensagem tem ${message.components.length} ActionRows`);

        // Monta descrição dependendo do modo de seleção
        const selectionText = teamSelection === 'manual' 
            ? `${emojis.joiapixel} ${t(lang, 'selection_manual')}`
            : `${emojis.joiapixel} ${t(lang, 'selection_auto')}`;

        let panelDescription;
        if (teamSelection === 'manual') {
            // Monta lista de times para seleção manual
            let teamsText = '';

            for (let i = 1; i <= totalTeams; i++) {
                const teamPlayers = teamsData[`time${i}`] || [];
                const playerMentions = teamPlayers.length > 0 
                    ? teamPlayers.map(id => `<@${id}>`).join(', ')
                    : 'Vazio';
                teamsText += `\n**Time ${i}** (${teamPlayers.length}/${playersPerTeam}): ${playerMentions}`;
            }
            panelDescription = `${emojis.raiopixel} **Jogo:** ${simulator.jogo}\n${emojis.pergaminhopixel} **Versão:** ${simulator.versao}\n${emojis.joiapixel} **Modo/Mapa:** ${simulator.modoJogo || simulator.mode}\n${selectionText}\n${emojis.presentepixel} **Prêmio:** ${simulator.prize}\n\n${t(lang, 'panel_players', { count: players.length, max: maxPlayers })}${teamsText}`;
        } else {
            const playersList = players.length > 0
                ? players.map(id => `<@${id}>`).join('\n')
                : 'Nenhum jogador ainda';
            const playersText = players.length > 0 ? playersList : t(lang, 'panel_no_players');
            panelDescription = `${emojis.raiopixel} **Jogo:** ${simulator.jogo}\n${emojis.pergaminhopixel} **Versão:** ${simulator.versao}\n${emojis.joiapixel} **Modo/Mapa:** ${simulator.modoJogo || simulator.mode}\n${selectionText}\n${emojis.presentepixel} **Prêmio:** ${simulator.prize}\n\n${t(lang, 'panel_players', { count: players.length, max: maxPlayers })}\n${playersText}`;
        }

        const updatedEmbed = createRedEmbed({
            title: `${emojis.fogo} ${t(lang, 'panel_title', { mode: simulator.mode, game: simulator.jogo })}`,
            description: panelDescription,
            footer: { text: players.length >= maxPlayers ? t(lang, 'panel_full') : t(lang, 'panel_waiting') },
            timestamp: true
        });

        // Adiciona imagem pequena no canto se disponível
        const guildImage = guild.bannerURL({ size: 256 }) || guild.iconURL({ size: 256 });
        if (guildImage) {
            updatedEmbed.setThumbnail(guildImage);
        }

        const isFull = players.length >= maxPlayers;
        let newComponents = [];

        if (isFull && startMode === 'manual') {
            const controlButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`simu_start_v2_${simulatorId}`)
                        .setLabel('Começar Simulador')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`simu_cancel_v2_${simulatorId}`)
                        .setLabel('Cancelar Simulador')
                        .setStyle(ButtonStyle.Danger)
                );
            newComponents = [controlButtons];
        } else if (!isFull) {
            if (teamSelection === 'manual') {

                if (totalTeams > 2) {
                    const teamOptions = [];
                    for (let i = 1; i <= totalTeams; i++) {
                        teamOptions.push({
                            label: `Time ${i}`,
                            value: `time${i}`
                        });
                    }

                    const MAX_OPTIONS = 25;
                    const chunks = [];
                    for (let i = 0; i < teamOptions.length; i += MAX_OPTIONS) {
                        chunks.push(teamOptions.slice(i, i + MAX_OPTIONS));
                    }

                    const maxMenus = Math.min(chunks.length, 4);
                    for (let i = 0; i < maxMenus; i++) {
                        const chunk = chunks[i];
                        const startNum = i * MAX_OPTIONS + 1;
                        const endNum = Math.min((i + 1) * MAX_OPTIONS, totalTeams);

                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId(`team_select_v2_${simulatorId}_${i}`)
                            .setPlaceholder(`Selecione um time (${startNum}-${endNum})...`)
                            .addOptions(chunk);

                        newComponents.push(new ActionRowBuilder().addComponents(selectMenu));
                    }
                } else {
                    let currentRow = new ActionRowBuilder();
                    let buttonsInRow = 0;

                    for (let i = 1; i <= totalTeams; i++) {
                        if (buttonsInRow >= 5) {
                            newComponents.push(currentRow);
                            currentRow = new ActionRowBuilder();
                            buttonsInRow = 0;
                        }
                        currentRow.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`team_join_v2_${simulatorId}_${i}`)
                                .setLabel(`Time ${i}`)
                                .setStyle(ButtonStyle.Primary)
                        );
                        buttonsInRow++;
                    }
                    if (buttonsInRow > 0) {
                        newComponents.push(currentRow);
                    }
                }

                const controlButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`simu_leave_v2_${simulatorId}`)
                            .setLabel('Sair')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`simu_cancel_v2_${simulatorId}`)
                            .setLabel('Cancelar Simulador')
                            .setStyle(ButtonStyle.Secondary)
                    );
                newComponents.push(controlButtons);
            } else {
                const buttons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`simu_join_v2_${simulatorId}`)
                            .setLabel('Entrar')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(`simu_leave_v2_${simulatorId}`)
                            .setLabel('Sair')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`simu_cancel_v2_${simulatorId}`)
                            .setLabel('Cancelar Simulador')
                            .setStyle(ButtonStyle.Secondary)
                    );
                newComponents.push(buttons);
            }
        }

        await message.edit({
            embeds: [updatedEmbed],
            components: newComponents
        });

        console.log(`✅ Painel atualizado`);

        if (isFull && simulator.state === 'open' && startMode === 'automatico') {
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
    if (simulatorTimeouts.has(simulatorId)) {
        clearTimeout(simulatorTimeouts.get(simulatorId));
        simulatorTimeouts.delete(simulatorId);
        console.log(`⏱️ Timer cancelado para simulador iniciado: ${simulatorId}`);
    }

    const simulator = await getTournamentById(simulatorId);

    const emojis = getEmojis(client);
    const lang = simulator.language || 'pt';
    const teamSelection = simulator.team_selection || 'automatico';

    const guild = client.guilds.cache.get(simulator.guild_id);
    if (!guild) {
        console.error(`❌ Guild não encontrada: ${simulator.guild_id}`);
        return;
    }

    const channel = guild.channels.cache.get(simulator.channel_id);
    if (!channel) {
        console.error(`❌ Canal não encontrado: ${simulator.channel_id}`);
        return;
    }

    // Incrementa o contador de simuladores para o rank de servidores APENAS quando o torneio iniciar
    // Verifica se já não foi contado antes
    if (!simulator.counted_in_stats) {
        await incrementServerSimulators(simulator.guild_id);
        await updateTournament(simulatorId, { counted_in_stats: true });
    }

    // Se for seleção manual, valida se todos os times estão completos
    if (teamSelection === 'manual') {
        const teamsData = simulator.teams_data || {};
        const playersPerTeam = simulator.players_per_team || parseInt(simulator.mode.charAt(0));
        const totalTeams = simulator.total_teams || (simulator.max_players / playersPerTeam);

        // Verifica se todos os times estão completos
        for (let i = 1; i <= totalTeams; i++) {
            const teamPlayers = teamsData[`time${i}`] || [];
            if (teamPlayers.length !== playersPerTeam) {
                console.log(`❌ Time ${i} incompleto: ${teamPlayers.length}/${playersPerTeam}`);
                
                // Impede que o torneio inicie se houver times incompletos na seleção manual
                if (simulator.state === 'open') {
                    try {
                        await channel.send({
                            embeds: [createRedEmbed({
                                title: `${emojis.negative} Erro ao iniciar torneio`,
                                description: `O Time ${i} está incompleto! (${teamPlayers.length}/${playersPerTeam} jogadores)\n\nO torneio manual só pode ser iniciado com todos os times cheios.`,
                                timestamp: true
                            })]
                        });
                    } catch (e) { console.error(e); }
                    return;
                }
            }
        }
    }

    // Gera chaveamento (passa opções de times se for seleção manual)
    const bracketOptions = {
        teamSelection: simulator.team_selection || 'automatico',
        teamsData: simulator.teams_data || {}
    };
    const bracketData = generateBracket(simulator.players, simulator.mode, bracketOptions);

    // Cria categoria para partidas com permissão para o criador
    const categoryPermissions = [
        {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
        }
    ];
    
    // Adiciona o criador à categoria para poder ver todos os canais
    if (simulator.creator_id) {
        categoryPermissions.push({
            id: simulator.creator_id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        });
    }
    
    const category = await guild.channels.create({
        name: `${t(lang, 'tournament_category', { game: simulator.jogo })}`.substring(0, 100),
        type: ChannelType.GuildCategory,
        permissionOverwrites: categoryPermissions
    });

    // Atualiza simulador com estado running, bracket e categoria
    await updateTournament(simulatorId, {
        state: 'running',
        bracket_data: bracketData,
        category_id: category.id
    });

    // Atualiza objeto local
    simulator.state = 'running';
    simulator.bracket_data = bracketData;
    simulator.category_id = category.id;

    await channel.send({
        embeds: [createRedEmbed({
            title: `${emojis.fogo} ${t(lang, 'tournament_started')}`,
            description: t(lang, 'tournament_bracket_generating'),
            timestamp: true
        })]
    });

    // Cria canais para primeira rodada (ignora partidas BYE)
    const firstRoundMatches = simulator.bracket_data.matches.filter(m => m.round === 1 && !m.isBye && m.status === 'pending');
    for (const match of firstRoundMatches) {
        if (!match.team1 || !match.team2) {
            console.log(`⚠️ Pulando partida ${match.id} - time incompleto`);
            continue;
        }
        const matchNumber = match.id.split('match')[1];
        await createMatchChannel(guild, category, simulator, match, `${t(lang, 'round_channel', { round: 1, number: matchNumber })}`);
    }

    // Verifica se há BYEs e já processa a próxima rodada se necessário
    const byeMatches = simulator.bracket_data.matches.filter(m => m.isBye);
    if (byeMatches.length > 0) {
        console.log(`✅ ${byeMatches.length} partida(s) BYE processada(s) automaticamente`);
    }

    await channel.send({
        embeds: [createRedEmbed({
            title: `${emojis.positive} ${t(lang, 'channels_created')}`,
            description: t(lang, 'channels_first_round'),
            timestamp: true
        })]
    });
}

/**
 * Cria canal de partida
 */
async function createMatchChannel(guild, category, simulator, match, channelName) {
    const { startInactivityTimer } = require('../kaori/assistant');
    const lang = simulator.language || 'pt';

    if (!match.team1 || !match.team2 || !Array.isArray(match.team1) || !Array.isArray(match.team2)) {
        console.error(`❌ Erro ao criar canal - times inválidos para partida ${match.id}`);
        return null;
    }

    const team1Mentions = match.team1.map(id => `<@${id}>`).join(', ');
    const team2Mentions = match.team2.map(id => `<@${id}>`).join(', ');

    const permissionOverwrites = [
        {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
        }
    ];

    // Adiciona o criador do simulador a todos os canais de partida
    if (simulator.creator_id) {
        permissionOverwrites.push({
            id: simulator.creator_id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        });
    }

    for (const playerId of match.team1) {
        if (playerId) {
            permissionOverwrites.push({
                id: playerId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            });
        }
    }

    for (const playerId of match.team2) {
        if (playerId) {
            permissionOverwrites.push({
                id: playerId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            });
        }
    }

    const matchChannel = await guild.channels.create({
        name: channelName.substring(0, 100),
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: permissionOverwrites
    });

    match.channelId = matchChannel.id;
    await updateTournament(simulator.id, { bracket_data: simulator.bracket_data });

    const matchEmojis = getEmojis(guild.client);
    const matchEmbed = createRedEmbed({
        title: `${matchEmojis.raiopixel} ${t(lang, 'match_title')}`,
        fields: [
            { name: t(lang, 'match_team1'), value: team1Mentions, inline: true },
            { name: t(lang, 'match_vs'), value: matchEmojis.raiopixel, inline: true },
            { name: t(lang, 'match_team2'), value: team2Mentions, inline: true }
        ],
        description: t(lang, 'match_description'),
        timestamp: true
    });

    const matchButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`match_win1_${simulator.id}_${match.id}`)
                .setLabel(t(lang, 'button_team1_wins'))
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`match_win2_${simulator.id}_${match.id}`)
                .setLabel(t(lang, 'button_team2_wins'))
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`match_wo_${simulator.id}_${match.id}`)
                .setLabel(t(lang, 'button_wo'))
                .setStyle(ButtonStyle.Secondary)
        );

    await matchChannel.send({
        embeds: [matchEmbed],
        components: [matchButtons]
    });

    startInactivityTimer(matchChannel.id, matchChannel, match, simulator.creator_id);
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

/**
 * Cancela o timer de timeout de um simulador
 */
function cancelSimulatorTimeout(simulatorId) {
    if (simulatorTimeouts.has(simulatorId)) {
        clearTimeout(simulatorTimeouts.get(simulatorId));
        simulatorTimeouts.delete(simulatorId);
        console.log(`⏱️ Timer cancelado manualmente para: ${simulatorId}`);
        return true;
    }
    return false;
}

module.exports = {
    createSimulator,
    updateSimulatorPanel,
    startTournament,
    createMatchChannel,
    updateRankings,
    advanceWinner,
    getRoundName,
    cancelSimulatorTimeout
};