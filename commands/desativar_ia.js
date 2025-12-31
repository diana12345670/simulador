// desativar_ia.js - Desativa a IA Kaori no servidor
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/database');
const { createSuccessEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desativar_ia')
        .setDescription('Desativa as mensagens automáticas e interações da IA Kaori neste servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        let aiConfig = await readConfig('ai_enabled_guilds', {});
        aiConfig[interaction.guildId] = false;
        await writeConfig('ai_enabled_guilds', aiConfig);

        await interaction.reply({
            embeds: [createSuccessEmbed('A IA Kaori foi **desativada** neste servidor.', interaction.client)]
        });
    }
};
