const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getTournamentById, updateTournament, getOpenTournamentByChannel, getRunningTournamentByGuild } = require('../utils/database');
const { createErrorEmbed, createRedEmbed } = require('../utils/embeds');
const { updateSimulatorPanel } = require('../systems/tournament/manager');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remover-jogador')
        .setDescription('Remove um jogador do simulador no canal atual')
        .addUserOption(option =>
            option.setName('jogador')
                .setDescription('Jogador que será removido')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('substituir_por')
                .setDescription('Jogador que entrará no lugar (opcional)')
                .setRequired(false)),
    
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        const jogadorRemover = interaction.options.getUser('jogador');
        const jogadorSubstituto = interaction.options.getUser('substituir_por');

        if (jogadorSubstituto && jogadorRemover.id === jogadorSubstituto.id) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Os jogadores devem ser diferentes!`)],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        try {
            let simulator = await getOpenTournamentByChannel(interaction.channel.id);
            
            if (!simulator) {
                simulator = await getRunningTournamentByGuild(interaction.guildId);
            }

            if (!simulator) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} Nenhum simulador encontrado neste canal.`)]
                });
            }

            const OWNER_ID = process.env.OWNER_ID || '1339336477661724674';
            if (interaction.user.id !== simulator.creatorId && interaction.user.id !== OWNER_ID) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} Apenas o criador do simulador pode remover jogadores.`)]
                });
            }

            if (!simulator.players.includes(jogadorRemover.id)) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} ${jogadorRemover} não está participando deste simulador.`)]
                });
            }

            if (jogadorSubstituto && simulator.players.includes(jogadorSubstituto.id)) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} ${jogadorSubstituto} já está participando deste simulador.`)]
                });
            }

            let newPlayers;
            let teamsData = simulator.teamsData || {};
            let description;

            if (jogadorSubstituto) {
                newPlayers = simulator.players.map(id => id === jogadorRemover.id ? jogadorSubstituto.id : id);
                
                if (simulator.teamSelection === 'manual' && teamsData) {
                    for (const teamKey of Object.keys(teamsData)) {
                        const index = teamsData[teamKey].indexOf(jogadorRemover.id);
                        if (index !== -1) {
                            teamsData[teamKey][index] = jogadorSubstituto.id;
                        }
                    }
                }

                description = `**Removido:** ${jogadorRemover}\n**Substituído por:** ${jogadorSubstituto}`;
            } else {
                newPlayers = simulator.players.filter(id => id !== jogadorRemover.id);
                
                if (simulator.teamSelection === 'manual' && teamsData) {
                    for (const teamKey of Object.keys(teamsData)) {
                        teamsData[teamKey] = teamsData[teamKey].filter(id => id !== jogadorRemover.id);
                    }
                }

                description = `**Removido:** ${jogadorRemover}`;
            }

            if (simulator.state === 'running' && simulator.bracketData && simulator.bracketData.matches) {
                for (const match of simulator.bracketData.matches) {
                    if (match.status === 'completed') continue;

                    const indexTeam1 = match.team1.indexOf(jogadorRemover.id);
                    if (indexTeam1 !== -1) {
                        if (jogadorSubstituto) {
                            match.team1[indexTeam1] = jogadorSubstituto.id;
                        } else {
                            match.team1.splice(indexTeam1, 1);
                        }
                    }

                    const indexTeam2 = match.team2.indexOf(jogadorRemover.id);
                    if (indexTeam2 !== -1) {
                        if (jogadorSubstituto) {
                            match.team2[indexTeam2] = jogadorSubstituto.id;
                        } else {
                            match.team2.splice(indexTeam2, 1);
                        }
                    }

                    if (match.channelId) {
                        try {
                            const matchChannel = interaction.guild.channels.cache.get(match.channelId);
                            if (matchChannel) {
                                await matchChannel.permissionOverwrites.delete(jogadorRemover.id).catch(() => {});
                                
                                if (jogadorSubstituto) {
                                    await matchChannel.permissionOverwrites.edit(jogadorSubstituto.id, {
                                        ViewChannel: true,
                                        SendMessages: true
                                    });
                                }
                            }
                        } catch (error) {
                            console.error('Erro ao atualizar permissões do canal:', error);
                        }
                    }
                }

                await updateTournament(simulator.id, {
                    players: newPlayers,
                    bracketData: simulator.bracketData,
                    teamsData: teamsData
                });
            } else {
                await updateTournament(simulator.id, {
                    players: newPlayers,
                    teamsData: teamsData
                });
            }

            await updateSimulatorPanel(interaction.client, simulator.id);

            await interaction.editReply({
                embeds: [createRedEmbed({
                    title: `${emojis.positive} Jogador Removido`,
                    description: description,
                    footer: { text: `Simulador: ${simulator.jogo} ${simulator.mode}` },
                    timestamp: true
                })]
            });

        } catch (error) {
            console.error('Erro ao remover jogador:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} Erro ao remover jogador. Tente novamente.`)]
            });
        }
    }
};
