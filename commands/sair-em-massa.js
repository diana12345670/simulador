// sair-em-massa.js - Comando para o dono do bot sair de servidores com menos de X membros
const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createErrorEmbed, createRedEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');
const { massLeaveData } = require('../handlers/buttonHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sair-em-massa')
        .setDescription('[DONO] Faz o bot sair de servidores com menos de X membros')
        .addIntegerOption(option =>
            option.setName('minimo_membros')
                .setDescription('Número mínimo de membros para permanecer no servidor')
                .setRequired(true)
                .setMinValue(1)),
    
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        
        // Verifica se é o dono do bot
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Apenas o dono do bot pode usar este comando.`, interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        const minimoMembros = interaction.options.getInteger('minimo_membros');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const guilds = interaction.client.guilds.cache;
            
            // Filtra servidores com menos de X membros
            const serversToLeave = guilds.filter(guild => guild.memberCount < minimoMembros);
            
            if (serversToLeave.size === 0) {
                return interaction.editReply({
                    embeds: [createRedEmbed({
                        title: `${emojis.positive} Sucesso`,
                        description: `${emojis.positive} Não há servidores com menos de ${minimoMembros} membros para sair.`
                    })]
                });
            }

            // Armazena dados para o handler
            massLeaveData.set(interaction.user.id, {
                serversToLeave: serversToLeave,
                minimoMembros: minimoMembros
            });

            // Cria embed de confirmação
            const serverList = serversToLeave.map(guild => 
                `• ${guild.name} (${guild.memberCount} membros) - ID: \`${guild.id}\``
            ).join('\n');

            const confirmEmbed = createRedEmbed({
                title: `${emojis.trofeupixel} Confirmar Saída em Massa`,
                description: `Encontrados **${serversToLeave.size}** servidores com menos de ${minimoMembros} membros:\n\n${serverList}\n\n**Deseja continuar?**`,
                timestamp: true
            });

            // Cria botões de confirmação
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_leave')
                        .setLabel('Confirmar Saída')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_leave')
                        .setLabel('Cancelar')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({
                embeds: [confirmEmbed],
                components: [row]
            });

            // Limpa dados após 5 minutos (timeout)
            setTimeout(() => {
                massLeaveData.delete(interaction.user.id);
            }, 300000);

        } catch (error) {
            console.error('Erro no comando sair-em-massa:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} Erro ao processar o comando.`, interaction.client)]
            });
        }
    }
};
