// simulador4v4.js - Comando para criar simulador 4v4
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { readConfig } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { createSimulator } = require('../systems/tournament/manager');
const path = require('path');

const VALID_QUANTITIES = [8, 16, 32, 64]; // Divisível por 4

module.exports = {
    data: new SlashCommandBuilder()
        .setName('simulador4v4')
        .setDescription('Cria um simulador 4v4')
        .addStringOption(option =>
            option.setName('jogo')
                .setDescription('Nome do jogo')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('versao')
                .setDescription('Versão do jogo')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('modo_mapa')
                .setDescription('Modo/Mapa de jogo')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('jogadores')
                .setDescription('Quantidade total de jogadores (8, 16, 32 ou 64)')
                .setRequired(true)
                .addChoices(
                    { name: '8 jogadores (2 times)', value: 8 },
                    { name: '16 jogadores (4 times)', value: 16 },
                    { name: '32 jogadores (8 times)', value: 32 },
                    { name: '64 jogadores (16 times)', value: 64 }
                ))
        .addStringOption(option =>
            option.setName('escolha_times')
                .setDescription('Como os times serão formados')
                .setRequired(true)
                .addChoices(
                    { name: 'Aleatório (bot distribui)', value: 'aleatorio' },
                    { name: 'Manual (jogadores escolhem)', value: 'manual' }
                ))
        .addStringOption(option =>
            option.setName('start')
                .setDescription('Quando o simulador deve iniciar')
                .setRequired(true)
                .addChoices(
                    { name: 'Automático (inicia quando lotar)', value: 'automatico' },
                    { name: 'Manual (botão para iniciar)', value: 'manual' }
                ))
        .addStringOption(option =>
            option.setName('premio')
                .setDescription('Prêmio do torneio (opcional)')
                .setRequired(false)),
    
    async execute(interaction) {
        const jogo = interaction.options.getString('jogo');
        const versao = interaction.options.getString('versao');
        const modo = interaction.options.getString('modo_mapa');
        const jogadores = interaction.options.getInteger('jogadores');
        const escolhaTimes = interaction.options.getString('escolha_times');
        const startMode = interaction.options.getString('start');
        const premio = interaction.options.getString('premio') || 'Nenhum';

        if (!VALID_QUANTITIES.includes(jogadores)) {
            return interaction.reply({
                embeds: [createErrorEmbed(
                    `<:negative:1442668040465682643> Quantidade inválida para 4v4!\n\nQuantidades aceitas: ${VALID_QUANTITIES.join(', ')}`
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
                mode: '4v4',
                jogo,
                versao,
                modo,
                maxPlayers: jogadores,
                teamSelection: escolhaTimes,
                startMode: startMode,
                prize: premio,
                channel: interaction.channel
            });

            // Remove a resposta do defer já que o painel é a confirmação
            await interaction.deleteReply();
        } catch (error) {
            console.error('Erro:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Erro ao criar simulador.')]
            });
        }
    }
};
