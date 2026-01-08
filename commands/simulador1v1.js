// simulador1v1.js - Comando para criar simulador 1v1
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { readConfig, isUserBanned, isUserBannedInGuild } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed, createRedEmbed } = require('../utils/embeds');
const { createSimulator } = require('../systems/tournament/manager');
const { getEmojis } = require('../utils/emojis');
const path = require('path');

// Quantidades válidas para 1v1
const VALID_QUANTITIES = [2, 4, 8, 16, 32, 64];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('simulador1v1')
        .setDescription('Cria um simulador 1v1')
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
                .setDescription('Modo/Mapa de jogo (ex: Ranked, Mirage, etc)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('quantidade')
                .setDescription('Quantidade de jogadores (2, 4, 8, 16, 32 ou 64)')
                .setRequired(true)
                .addChoices(
                    { name: '2 jogadores', value: 2 },
                    { name: '4 jogadores', value: 4 },
                    { name: '8 jogadores', value: 8 },
                    { name: '16 jogadores', value: 16 },
                    { name: '32 jogadores', value: 32 },
                    { name: '64 jogadores', value: 64 }
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
        const emojis = getEmojis(interaction.client);
        const jogo = interaction.options.getString('jogo');
        const versao = interaction.options.getString('versao');
        const modo = interaction.options.getString('modo_mapa');
        const quantidade = interaction.options.getInteger('quantidade');
        const startMode = interaction.options.getString('start');
        const premio = interaction.options.getString('premio') || 'Nenhum';

        if (await isUserBanned(interaction.user.id)) {
            return interaction.reply({
                embeds: [createRedEmbed({
                    title: `${emojis.negative} Banido pela equipe Sky`,
                    description: `Você está banido de jogar simuladores pela equipe Sky.\n\n${emojis.pergaminhopixel} Peça apelo em: https://discord.com/invite/8M83fTdyRW`,
                    timestamp: true
                })],
                flags: MessageFlags.Ephemeral
            });
        }

        if (await isUserBannedInGuild(interaction.user.id, interaction.guildId)) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Você está banido de simuladores neste servidor.`, interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        if (!VALID_QUANTITIES.includes(quantidade)) {
            return interaction.reply({
                embeds: [createErrorEmbed(
                    `${emojis.negative} Quantidade inválida para 1v1!\n\nQuantidades aceitas: ${VALID_QUANTITIES.join(', ')}`
                )],
                flags: MessageFlags.Ephemeral
            });
        }

        // Busca configuração sempre com a chave 'guild_config'
        let config = await readConfig('guild_config', {});
        if (!config || typeof config !== 'object') {
            config = {};
        }
        const guildConfig = config[interaction.guildId] || {};
        const simuCreatorRole = guildConfig.simuCreatorRole;

        console.log(`🔍 Verificando cargo para guild ${interaction.guildId}: ${simuCreatorRole || 'não configurado'}`);


        if (!guildConfig || !guildConfig.simuCreatorRole) {
            return interaction.reply({
                embeds: [createErrorEmbed(
                    `${emojis.negative} Este servidor ainda não configurou o cargo de criador de simuladores.\n\nUm administrador deve usar \`/setup\` primeiro.`
                )],
                flags: MessageFlags.Ephemeral
            });
        }

        const hasRole = interaction.member.roles.cache.has(guildConfig.simuCreatorRole);
        if (!hasRole && interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Você não tem permissão para criar simuladores.`)],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        try {
            await createSimulator(interaction.client, interaction.guild, interaction.user, {
                mode: '1v1',
                jogo,
                versao,
                modo,
                maxPlayers: quantidade,
                startMode: startMode,
                prize: premio,
                channel: interaction.channel
            });

            // Remove a resposta do defer já que o painel é a confirmação
            await interaction.deleteReply();
        } catch (error) {
            console.error('Erro ao criar simulador:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} Erro ao criar simulador. Tente novamente.`)]
            });
        }
    }
};