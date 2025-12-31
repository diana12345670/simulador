// ativar_ia.js - Ativa a IA Kaori no servidor
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/database');
const { createSuccessEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ativar_ia')
        .setDescription('Ativa as mensagens automáticas e interações da IA Kaori neste servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        let aiConfig = await readConfig('ai_enabled_guilds', {});
        aiConfig[interaction.guildId] = true;
        await writeConfig('ai_enabled_guilds', aiConfig);

        await interaction.reply({
            embeds: [createSuccessEmbed('A IA Kaori foi **ativada** com sucesso neste servidor!', interaction.client)]
        });
    }
};
