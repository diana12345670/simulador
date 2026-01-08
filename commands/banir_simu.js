// banir_simu.js - Comando para banir usuário de simuladores
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { banUserInGuild, isUserBannedInGuild } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banir_simu')
        .setDescription('Bane um usuário de participar de simuladores neste servidor')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário a ser banido')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');

        try {
            const isBanned = await isUserBannedInGuild(user.id, interaction.guildId);

            if (isBanned) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Este usuário já está banido de simuladores neste servidor.', interaction.client)],
                    ephemeral: true
                });
            }

            await banUserInGuild(user.id, interaction.guildId, 'Banido de simuladores localmente');

            await interaction.reply({
                embeds: [createSuccessEmbed(`${user} foi banido de participar de simuladores neste servidor`, interaction.client)]
            });
        } catch (error) {
            console.error('Erro ao banir usuário:', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Erro ao processar banimento.', interaction.client)],
                ephemeral: true
            });
        }
    }
};
