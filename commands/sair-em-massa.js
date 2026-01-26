// sair-em-massa.js - Comando para o dono do bot sair de servidores com menos de X membros
const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createErrorEmbed, createRedEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

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

            // Cria collector para a interação dos botões
            const filter = i => i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({
                filter,
                time: 30000 // 30 segundos
            });

            collector.on('collect', async i => {
                if (i.customId === 'confirm_leave') {
                    await i.update({
                        embeds: [createRedEmbed({
                            title: `${emojis.trofeupixel} Saindo dos servidores...`,
                            description: `Aguarde enquanto o bot sai dos ${serversToLeave.size} servidores...`,
                            timestamp: true
                        })],
                        components: []
                    });

                    let successCount = 0;
                    let failCount = 0;
                    const failedServers = [];

                    // Sai de cada servidor
                    for (const [guildId, guild] of serversToLeave) {
                        try {
                            await guild.leave();
                            successCount++;
                            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay de 1 segundo entre saídas
                        } catch (error) {
                            failCount++;
                            failedServers.push(`${guild.name} (${guild.id})`);
                            console.error(`Erro ao sair do servidor ${guild.name}:`, error);
                        }
                    }

                    // Envia resultado final
                    const resultEmbed = createRedEmbed({
                        title: `${emojis.trofeupixel} Operação Concluída`,
                        description: `${emojis.positive} **${successCount}** servidores removidos com sucesso\n${failCount > 0 ? `${emojis.negative} **${failCount}** falhas` : ''}`,
                        fields: failedServers.length > 0 ? [{
                            name: 'Servidores com falha:',
                            value: failedServers.join('\n'),
                            inline: false
                        }] : [],
                        timestamp: true
                    });

                    await i.followUp({
                        embeds: [resultEmbed],
                        flags: MessageFlags.Ephemeral
                    });

                } else if (i.customId === 'cancel_leave') {
                    await i.update({
                        embeds: [createErrorEmbed(`${emojis.negative} Operação cancelada.`, interaction.client)],
                        components: []
                    });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({
                        embeds: [createErrorEmbed(`${emojis.negative} Tempo esgotado. Operação cancelada.`, interaction.client)],
                        components: []
                    });
                }
            });

        } catch (error) {
            console.error('Erro no comando sair-em-massa:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} Erro ao processar o comando.`, interaction.client)]
            });
        }
    }
};
