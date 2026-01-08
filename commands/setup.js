
// setup.js - Comando para configurar cargo de criador de simuladores
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/database');
const { createRedEmbed, createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');
const { t } = require('../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configura os cargos e permissões do bot no servidor')
        .addRoleOption(option =>
            option.setName('cargo')
                .setDescription('Cargo que terá acesso aos comandos do bot')
                .setRequired(true))
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
        const role = interaction.options.getRole('cargo');

        // Defer ANTES de qualquer operação assíncrona
        await interaction.deferReply();

        // Carrega configuração sempre com a chave 'guild_config'
        let config = await readConfig('guild_config', {});
        
        // Garante que config é um objeto
        if (!config || typeof config !== 'object') {
            config = {};
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
                `${emojis.positive} ${t(lang, 'setup_success')}\n\n${t(lang, 'setup_role')}: ${role}\n${t(lang, 'setup_language')}: ${lang.toUpperCase()}\n\n${t(lang, 'setup_permission_info', { role: role.toString() })}`
            )]
        });
    }
};
