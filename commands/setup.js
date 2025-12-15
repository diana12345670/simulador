
// setup.js - Comando para configurar cargo de criador de simuladores
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/database');
const { createRedEmbed, createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configura o cargo que pode criar simuladores')
        .addRoleOption(option =>
            option.setName('cargo')
                .setDescription('Cargo que poderá criar simuladores')
                .setRequired(true))
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

        // Salva configuração no PostgreSQL com a chave 'guild_config'
        await writeConfig('guild_config', config);
        
        console.log(`✅ Cargo configurado para ${interaction.guildId}: ${role.id}`);

        await interaction.editReply({
            embeds: [createSuccessEmbed(
                `${emojis.positive} Cargo configurado!\n\nApenas membros com o cargo ${role} poderão criar simuladores.`
            )]
        });
    }
};
