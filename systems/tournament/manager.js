// manager.js - Gerenciador principal de torneios (simuladores)
const { readJSON, writeJSON } = require('../../utils/jsonDB');
const { createRedEmbed } = require('../../utils/embeds');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { generateBracket, advanceWinner, getRoundName } = require('./bracket');
const path = require('path');
const {
    createTournament,
    getTournamentById,
    updateTournament,
    deleteTournament,
    updateRankGlobal,
    updateRankLocal
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
    const { mode, jogo, versao, maxPlayers, prize = 'Nenhum', channel } = options;

    // Gera ID único
    const simulatorId = `sim-${guild.id}-${Date.now()}`;

    // Cria dados do simulador
    const simulator = {
        id: simulatorId,
        guild_id: guild.id,
        channel_id: channel.id,
        creator_id: creator.id,
        mode,
        jogo,
        versao,
        max_players: maxPlayers,
        prize,
        players: [],
        bracket_data: null,
        state: 'open',
        panel_message_id: null,
        category_id: null
    };

    // Salva no banco de dados
    await createTournament(simulator);

    // Cria e envia painel de entrada
    const panelEmbed = createRedEmbed({
        title: `<:fogo:1442667877332422847> Simulador ${mode} – ${jogo}`,
        description: `<:raiopixel:1442668029065564341> **Jogo:** ${jogo}\n<:pergaminhopixel:1442668033242959963> **Versão:** ${versao}\n<:joiapixel:1442668036090888274> **Modo/Mapa:** ${options.modo}\n<:presentepixel:1442667950313308332> **Prêmio:** ${prize}\n\n**Jogadores (0/${maxPlayers})**\nNenhum jogador ainda`,
        footer: { text: '<:alerta:1442668042873081866> Aguardando jogadores...' },
        timestamp: true
    });

    // Adiciona imagem pequena no canto se disponível
    const guildImage = guild.bannerURL({ size: 256 }) || guild.iconURL({ size: 256 });
    if (guildImage) {
        panelEmbed.setThumbnail(guildImage);
    }

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`simu_join_${simulatorId}`)
                .setLabel('Entrar')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`simu_leave_${simulatorId}`)
                .setLabel('Sair')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`simu_cancel_${simulatorId}`)
                .setLabel('Cancelar Simulador')
                .setStyle(ButtonStyle.Danger)
        );

    console.log(`📤 Enviando painel com ${buttons.components.length} botões`);
    console.log(`📋 Componentes:`, buttons.components.map(b => ({ customId: b.data.custom_id, label: b.data.label })));

    try {
        const panelMessage = await channel.send({
            embeds: [panelEmbed],
            components: [buttons]
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

        const playersList = simulator.players.length > 0
            ? simulator.players.map(id => `<@${id}>`).join('\n')
            : 'Nenhum jogador ainda';

        const updatedEmbed = createRedEmbed({
            title: `<:fogo:1442667877332422847> Simulador ${simulator.mode} – ${simulator.jogo}`,
            description: `<:raiopixel:1442668029065564341> **Jogo:** ${simulator.jogo}\n<:pergaminhopixel:1442668033242959963> **Versão:** ${simulator.versao}\n<:joiapixel:1442668036090888274> **Modo/Mapa:** ${simulator.mode}\n<:presentepixel:1442667950313308332> **Prêmio:** ${simulator.prize}\n\n**Jogadores (${simulator.players.length}/${simulator.maxPlayers})**\n${playersList}`,
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

    // Gera chaveamento
    const bracketData = generateBracket(simulator.players, simulator.mode);

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

    const matchEmbed = createRedEmbed({
        title: '<:raiopixel:1442668029065564341> Partida',
        fields: [
            { name: 'Time 1', value: team1Mentions, inline: true },
            { name: 'VS', value: '<:raiopixel:1442668029065564341>', inline: true },
            { name: 'Time 2', value: team2Mentions, inline: true }
        ],
        description: 'Boa sorte! O criador do simulador declarará o vencedor.',
        timestamp: true
    });

    const matchButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`match_win1_${simulator.id}_${match.id}`)
                .setLabel('Time 1 Venceu')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`match_win2_${simulator.id}_${match.id}`)
                .setLabel('Time 2 Venceu')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`match_wo_${simulator.id}_${match.id}`)
                .setLabel('W.O.')
                .setStyle(ButtonStyle.Danger)
        );

    await matchChannel.send({
        embeds: [matchEmbed],
        components: [matchButtons]
    });
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