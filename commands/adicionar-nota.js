
// adicionar-nota.js - Comando para o dono do bot adicionar nota customizada no perfil
const { SlashCommandBuilder } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adicionar-nota')
        .setDescription('[DONO] Adiciona uma nota customizada no perfil do bot')
        .addStringOption(option =>
            option.setName('nota')
                .setDescription('A nota que aparecerá no perfil do bot')
                .setRequired(true)
                .setMaxLength(128)),
    
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed('Apenas o dono do bot pode usar este comando.', interaction.client)],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const nota = interaction.options.getString('nota');

        try {
            await interaction.client.user.setPresence({
                activities: [{
                    name: nota,
                    type: 4
                }],
                status: 'dnd'
            });

            await interaction.editReply({
                embeds: [createSuccessEmbed(
                    `Nota atualizada com sucesso!\n\n**Nova nota:** ${nota}\n\nA nota permanecerá até que você a altere novamente.`,
                    interaction.client
                )]
            });

            console.log(`📝 Nota do bot atualizada por ${interaction.user.tag}: "${nota}"`);
        } catch (error) {
            console.error('Erro ao atualizar nota do bot:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('Erro ao atualizar a nota do bot.', interaction.client)]
            });
        }
    }
};
