
// setup.js - Comando para configurar cargo de criador de simuladores
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/database');
const { createRedEmbed, createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configura os cargos, canais e permissões do bot no servidor')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal onde o bot enviará as mensagens')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('cargo')
                .setDescription('Cargo que terá acesso aos comandos do bot (opcional, usa padrão em guild específica)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('linguagem')
                .setDescription('Idioma padrão das mensagens do bot neste servidor')
                .addChoices(
                    { name: 'English', value: 'en' },
                    { name: '中文 (Zhōngwén)', value: 'zh' },
                    { name: 'Español', value: 'es' },
                    { name: 'Français', value: 'fr' },
                    { name: 'Deutsch', value: 'de' }
                )
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        let role = interaction.options.getRole('cargo');

        // Defer ANTES de qualquer operação assíncrona
        await interaction.deferReply();

        // Carrega configuração sempre com a chave 'guild_config'
        let config = await readConfig('guild_config', {});
        
        // Garante que config é um objeto
        if (!config || typeof config !== 'object') {
            config = {};
        }

        // Se não veio cargo e for o servidor padrão, aplica cargo padrão
        const DEFAULT_GUILD_ID = '1453881469306146828';
        const DEFAULT_ROLE_ID = '1454315408592212062';
        if (!role && interaction.guildId === DEFAULT_GUILD_ID) {
            try {
                role = await interaction.guild.roles.fetch(DEFAULT_ROLE_ID);
            } catch (err) {
                console.error('Erro ao buscar cargo padrão do servidor 1453881469306146828:', err);
            }
        }

        // Se ainda não há cargo válido, erro
        if (!role) {
            return interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} Cargo inválido ou não encontrado.`)]
            });
        }

        // Define cargo para esta guild
        if (!config[interaction.guildId]) {
            config[interaction.guildId] = {};
        }

        config[interaction.guildId].simuCreatorRole = role.id;
        const lang = interaction.options.getString('linguagem') || config[interaction.guildId].language || 'pt';
        config[interaction.guildId].language = lang;

        // Salva configuração no PostgreSQL com a chave 'guild_config'
        await writeConfig('guild_config', config);
        
        console.log(`✅ Cargo configurado para ${interaction.guildId}: ${role.id}`);
        console.log(`✅ Linguagem configurada para ${interaction.guildId}: ${lang}`);

        await interaction.editReply({
            embeds: [createSuccessEmbed(
                `${emojis.positive} Configuração salva!\n\nCargo: ${role}\nIdioma: ${lang.toUpperCase()}\n\nApenas membros com o cargo ${role} poderão criar simuladores.`
            )]
        });
    }
};
