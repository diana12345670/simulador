const { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTournamentById, updateTournament, getRunningTournamentByGuild } = require('../utils/database');
const { createErrorEmbed, createRedEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');
const { updateSimulatorPanel } = require('../systems/tournament/manager');
const { getGuildLanguage } = require('../utils/lang');
const { t } = require('../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('alterar-jogador')
        .setDescription('Substitui um jogador por outro em um torneio em andamento')
        .addUserOption(option =>
            option.setName('jogador_sair')
                .setDescription('Jogador que será removido do torneio')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('jogador_entrar')
                .setDescription('Jogador que entrará no lugar')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('torneio_id')
                .setDescription('ID do torneio (opcional - usa o torneio ativo do servidor)')
                .setRequired(false)),
    
    async execute(interaction) {
        const lang = await getGuildLanguage(interaction.guildId);
        const emojis = getEmojis(interaction.client);
        const jogadorSair = interaction.options.getUser('jogador_sair');
        const jogadorEntrar = interaction.options.getUser('jogador_entrar');
        const torneioId = interaction.options.getString('torneio_id');

        if (jogadorSair.id === jogadorEntrar.id) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} ${t(lang, 'different_players_required')}`)],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        try {
            let simulator = null;

            if (torneioId) {
                simulator = await getTournamentById(torneioId);
            } else {
                simulator = await getRunningTournamentByGuild(interaction.guildId);
            }

            if (!simulator) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} ${t(lang, 'no_running_tournament')}`)]
                });
            }

            const OWNER_ID = process.env.OWNER_ID || '1339336477661724674';
            if (interaction.user.id !== simulator.creatorId && interaction.user.id !== OWNER_ID) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} ${t(lang, 'only_creator_alter')}`)]
                });
            }

            if (!simulator.players.includes(jogadorSair.id)) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} ${t(lang, 'player_not_in_tournament', { player: jogadorSair.toString() })}`)]
                });
            }

            if (simulator.players.includes(jogadorEntrar.id)) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} ${t(lang, 'substitute_already_in_tournament', { player: jogadorEntrar.toString() })}`)]
                });
            }

            const bracketData = simulator.bracketData;
            if (!bracketData || !bracketData.matches) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} ${t(lang, 'no_bracket_generated')}`)]
                });
            }

            let substituicaoFeita = false;
            let matchEncontrada = null;
            let timeEncontrado = null;

            for (const match of bracketData.matches) {
                if (match.status === 'completed') continue;

                const indexTeam1 = match.team1.indexOf(jogadorSair.id);
                if (indexTeam1 !== -1) {
                    match.team1[indexTeam1] = jogadorEntrar.id;
                    substituicaoFeita = true;
                    matchEncontrada = match;
                    timeEncontrado = 'Time 1';
                    break;
                }

                const indexTeam2 = match.team2.indexOf(jogadorSair.id);
                if (indexTeam2 !== -1) {
                    match.team2[indexTeam2] = jogadorEntrar.id;
                    substituicaoFeita = true;
                    matchEncontrada = match;
                    timeEncontrado = 'Time 2';
                    break;
                }
            }

            if (!substituicaoFeita) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} ${t(lang, 'player_not_in_pending_matches', { player: jogadorSair.toString() })}`)]
                });
            }

            const newPlayers = simulator.players.map(id => id === jogadorSair.id ? jogadorEntrar.id : id);

            let teamsData = simulator.teamsData || {};
            if (simulator.teamSelection === 'manual' && teamsData) {
                for (const teamKey of Object.keys(teamsData)) {
                    const index = teamsData[teamKey].indexOf(jogadorSair.id);
                    if (index !== -1) {
                        teamsData[teamKey][index] = jogadorEntrar.id;
                    }
                }
            }

            await updateTournament(simulator.id, {
                players: newPlayers,
                bracketData: bracketData,
                teamsData: teamsData
            });

            if (matchEncontrada && matchEncontrada.channelId) {
                try {
                    const matchChannel = interaction.guild.channels.cache.get(matchEncontrada.channelId);
                    if (matchChannel) {
                        await matchChannel.permissionOverwrites.delete(jogadorSair.id).catch(() => {});

                        await matchChannel.permissionOverwrites.edit(jogadorEntrar.id, {
                            ViewChannel: true,
                            SendMessages: true
                        });

                        await matchChannel.send({
                            embeds: [createRedEmbed({
                                title: `${emojis.alerta} ${t(lang, 'player_substitution_title')}`,
                                description: t(lang, 'player_substitution_desc', { removed: jogadorSair.toString(), added: jogadorEntrar.toString() }),
                                timestamp: true
                            })]
                        });

                        // Atualiza o embed principal da partida com os novos jogadores
                        const messages = await matchChannel.messages.fetch({ limit: 20 });
                        const matchMessage = messages.find(m => 
                            m.author.bot && 
                            m.embeds.length > 0 && 
                            m.embeds[0].title?.includes('Partida') &&
                            m.components.length > 0
                        );

                        if (matchMessage) {
                            const team1Mentions = matchEncontrada.team1.map(id => `<@${id}>`).join(', ');
                            const team2Mentions = matchEncontrada.team2.map(id => `<@${id}>`).join(', ');

                            const updatedMatchEmbed = createRedEmbed({
                                title: `${emojis.raiopixel} Partida`,
                                fields: [
                                    { name: 'Time 1', value: team1Mentions, inline: true },
                                    { name: 'VS', value: emojis.raiopixel, inline: true },
                                    { name: 'Time 2', value: team2Mentions, inline: true }
                                ],
                                description: 'Boa sorte! O criador do simulador declarará o vencedor.\n\n*Mencione o criador ou digite "Kaori" se precisar de ajuda!*',
                                timestamp: true
                            });

                            await matchMessage.edit({
                                embeds: [updatedMatchEmbed],
                                components: matchMessage.components
                            });
                        }
                    }
                } catch (error) {
                    console.error('Erro ao atualizar canal da partida:', error);
                }
            }

            // Atualiza o painel principal do simulador
            await updateSimulatorPanel(interaction.client, simulator.id);

            const roundName = getRoundName(matchEncontrada.round, bracketData.totalRounds);

            await interaction.editReply({
                embeds: [createRedEmbed({
                    title: `${emojis.positive} ${t(lang, 'player_substituted_title')}`,
                    description: t(lang, 'player_substituted_desc', { removed: jogadorSair.toString(), added: jogadorEntrar.toString(), match: `${roundName} - ${matchEncontrada.id}`, team: timeEncontrado }),
                    footer: { text: t(lang, 'tournament_footer', { game: simulator.jogo, mode: simulator.mode }) },
                    timestamp: true
                })]
            });

        } catch (error) {
            console.error('Erro ao alterar jogador:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} ${t(lang, 'error_substitute_player')}`)]
            });
        }
    }
};

function getRoundName(round, totalRounds) {
    if (round === totalRounds) return 'Final';
    if (round === totalRounds - 1) return 'Semifinal';
    if (round === totalRounds - 2) return 'Quartas de Final';
    if (round === totalRounds - 3) return 'Oitavas de Final';
    return `Rodada ${round}`;
}
