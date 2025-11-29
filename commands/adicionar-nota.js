
// adicionar-nota.js - Comando para o dono do bot adicionar nota customizada no perfil
const { SlashCommandBuilder } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adicionar-nota')
        .setDescription('[DONO] Adiciona uma nota customizada no perfil do bot')
        .addStringOption(option =>
            option.setName('nota')
                .setDescription('A nota que aparecerá no perfil do bot')
                .setRequired(true)
                .setMaxLength(128)), // Discord limita custom status a 128 caracteres
    
    async execute(interaction) {
        // Verifica se é o dono do bot
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Apenas o dono do bot pode usar este comando.')],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const nota = interaction.options.getString('nota');

        try {
            // Atualiza o status do bot com a nota customizada
            await interaction.client.user.setPresence({
                activities: [{
                    name: nota,
                    type: 4 // Type 4 = Custom Status (aparece como nota/balãozinho)
                }],
                status: 'dnd' // Mantém o status "Não Perturbe"
            });

            await interaction.editReply({
                embeds: [createSuccessEmbed(
                    `<:positive:1442668038691491943> Nota atualizada com sucesso!\n\n**Nova nota:** ${nota}\n\nA nota permanecerá até que você a altere novamente.`
                )]
            });

            console.log(`📝 Nota do bot atualizada por ${interaction.user.tag}: "${nota}"`);
        } catch (error) {
            console.error('Erro ao atualizar nota do bot:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('<:negative:1442668040465682643> Erro ao atualizar a nota do bot.')]
            });
        }
    }
};
