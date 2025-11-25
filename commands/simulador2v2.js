// simulador2v2.js - Comando para criar simulador 2v2
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { readConfig } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { createSimulator } = require('../systems/tournament/manager');
const path = require('path');

const VALID_QUANTITIES = [4, 8, 16, 32, 64]; // Divisível por 2

module.exports = {
    data: new SlashCommandBuilder()
        .setName('simulador2v2')
        .setDescription('Cria um simulador 2v2')
        .addStringOption(option =>
            option.setName('jogo')
                .setDescription('Nome do jogo')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('versao')
                .setDescription('Versão do jogo')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('modo')
                .setDescription('Modo/Mapa de jogo')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('jogadores')
                .setDescription('Quantidade total de jogadores (4, 8, 16, 32 ou 64)')
                .setRequired(true)
                .addChoices(
                    { name: '4 jogadores (2 times)', value: 4 },
                    { name: '8 jogadores (4 times)', value: 8 },
                    { name: '16 jogadores (8 times)', value: 16 },
                    { name: '32 jogadores (16 times)', value: 32 },
                    { name: '64 jogadores (32 times)', value: 64 }
                ))
        .addStringOption(option =>
            option.setName('premio')
                .setDescription('Prêmio do torneio (opcional)')
                .setRequired(false)),
    
    async execute(interaction) {
        const jogo = interaction.options.getString('jogo');
        const versao = interaction.options.getString('versao');
        const modo = interaction.options.getString('modo');
        const jogadores = interaction.options.getInteger('jogadores');
        const premio = interaction.options.getString('premio') || 'Nenhum';

        if (!VALID_QUANTITIES.includes(jogadores)) {
            return interaction.reply({
                embeds: [createErrorEmbed(
                    `<:negative:1442668040465682643> Quantidade inválida para 2v2!\n\nQuantidades aceitas: ${VALID_QUANTITIES.join(', ')}`
                )],
                flags: MessageFlags.Ephemeral
            });
        }

        const config = await readConfig('guild_config', {});
        const guildConfig = config[interaction.guildId];

        if (!guildConfig || !guildConfig.simuCreatorRole) {
            return interaction.reply({
                embeds: [createErrorEmbed(
                    '<:negative:1442668040465682643> Este servidor ainda não configurou o cargo de criador.\n\nUse `/setup` primeiro.'
                )],
                flags: MessageFlags.Ephemeral
            });
        }

        const hasRole = interaction.member.roles.cache.has(guildConfig.simuCreatorRole);
        if (!hasRole && interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Você não tem permissão para criar simuladores.')],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        try {
            await createSimulator(interaction.guild, interaction.user, {
                mode: '2v2',
                jogo,
                versao,
                maxPlayers: jogadores,
                prize: premio,
                channel: interaction.channel
            });

            // Remove a resposta do defer já que o painel é a confirmação
            await interaction.deleteReply();
        } catch (error) {
            console.error('Erro ao criar simulador:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Erro ao criar simulador.')]
            });
        }
    }
};
