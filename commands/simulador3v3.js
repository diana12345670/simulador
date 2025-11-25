// simulador3v3.js - Comando para criar simulador 3v3
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { readConfig } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { createSimulator } = require('../systems/tournament/manager');
const path = require('path');

const VALID_QUANTITIES = [6, 12, 24, 48, 96]; // Divisível por 3

module.exports = {
    data: new SlashCommandBuilder()
        .setName('simulador3v3')
        .setDescription('Cria um simulador 3v3')
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
                .setDescription('Quantidade total de jogadores (6, 12, 24, 48 ou 96)')
                .setRequired(true)
                .addChoices(
                    { name: '6 jogadores (2 times)', value: 6 },
                    { name: '12 jogadores (4 times)', value: 12 },
                    { name: '24 jogadores (8 times)', value: 24 },
                    { name: '48 jogadores (16 times)', value: 48 },
                    { name: '96 jogadores (32 times)', value: 96 }
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
                    `<:negative:1442668040465682643> Quantidade inválida para 3v3!\n\nQuantidades aceitas: ${VALID_QUANTITIES.join(', ')}`
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
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Você não tem permissão.')],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        try {
            await createSimulator(interaction.guild, interaction.user, {
                mode: '3v3',
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
