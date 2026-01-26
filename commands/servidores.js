// servidores.js - Comando para o dono listar servidores
const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createRedEmbed, createErrorEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

// Armazenamento em memória para navegação (em produção, usar Redis ou banco de dados)
const serverNavigation = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servidores')
        .setDescription('[DONO] Lista todos os servidores do bot')
        .addStringOption(option =>
            option.setName('ordem')
                .setDescription('Ordenar servidores por')
                .addChoices(
                    { name: 'Mais membros', value: 'mais_membros' },
                    { name: 'Menos membros', value: 'menos_membros' }
                )),
    
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        
        // Verifica se é o dono do bot
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Apenas o dono do bot pode usar este comando.`, interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        const ordem = interaction.options.getString('ordem');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const guilds = interaction.client.guilds.cache;

            if (guilds.size === 0) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} O bot não está em nenhum servidor.`, interaction.client)]
                });
            }

            // Cria lista de servidores com informações
            const guildsList = [];
            
            for (const [, guild] of guilds) {
                let inviteUrl = 'Sem permissão para criar invite';
                
                try {
                    // Tenta criar um convite
                    const channel = guild.channels.cache.find(ch => 
                        ch.type === 0 && ch.permissionsFor(guild.members.me).has('CreateInstantInvite')
                    );
                    
                    if (channel) {
                        const invite = await channel.createInvite({ maxAge: 0, maxUses: 0 });
                        inviteUrl = invite.url;
                    }
                } catch (error) {
                    // Não conseguiu criar invite
                }

                guildsList.push({
                    name: guild.name,
                    id: guild.id,
                    icon: guild.iconURL() || 'Sem ícone',
                    memberCount: guild.memberCount,
                    invite: inviteUrl
                });
            }

            // Ordena conforme solicitado
            if (ordem === 'mais_membros') {
                guildsList.sort((a, b) => b.memberCount - a.memberCount);
            } else if (ordem === 'menos_membros') {
                guildsList.sort((a, b) => a.memberCount - b.memberCount);
            }

            // Armazena dados para navegação
            const navigationId = `${interaction.user.id}_${Date.now()}`;
            serverNavigation.set(navigationId, {
                guilds: guildsList,
                currentPage: 0,
                totalPages: Math.ceil(guildsList.length / 5),
                userId: interaction.user.id
            });

            // Exibe primeira página
            await displayPage(interaction, navigationId, 0);

        } catch (error) {
            console.error('Erro no comando servidores:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} Erro ao listar servidores.`, interaction.client)]
            });
        }
    }
};

// Função para exibir página específica
async function displayPage(interaction, navigationId, pageNumber) {
    const navigation = serverNavigation.get(navigationId);
    
    if (!navigation || navigation.userId !== interaction.user.id) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Sessão de navegação expirada.', interaction.client)],
            components: []
        });
    }

    const { guilds, totalPages } = navigation;
    const startIndex = pageNumber * 5;
    const endIndex = Math.min(startIndex + 5, guilds.length);
    const pageGuilds = guilds.slice(startIndex, endIndex);

    // Cria campos do embed
    const fields = pageGuilds.map(g => ({
        name: `${g.name} (${g.memberCount} membros)`,
        value: `${emojis.pergaminhopixel} ID: \`${g.id}\`\n${emojis.presentepixel} [Convite](${g.invite})`,
        inline: false
    }));

    // Cria botões de navegação
    const row = new ActionRowBuilder();
    
    if (pageNumber > 0) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`prev_${navigationId}`)
                .setLabel('◀ Anterior')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    
    if (pageNumber < totalPages - 1) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`next_${navigationId}`)
                .setLabel('Próximo ▶')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    const embed = createRedEmbed({
        title: `${emojis.trofeupixel} Servidores do Bot (${guilds.length} total)`,
        description: `Página ${pageNumber + 1} de ${totalPages}`,
        fields: fields,
        timestamp: true
    });

    // Atualiza a mensagem
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            embeds: [embed],
            components: row.components.length > 0 ? [row] : []
        });
    } else {
        await interaction.reply({
            embeds: [embed],
            components: row.components.length > 0 ? [row] : [],
            flags: MessageFlags.Ephemeral
        });
    }

    // Atualiza página atual na navegação
    navigation.currentPage = pageNumber;

    // Configura collector para botões se não existir
    if (!navigation.collector) {
        const filter = i => i.user.id === navigation.userId && (
            i.customId === `prev_${navigationId}` || 
            i.customId === `next_${navigationId}`
        );
        
        navigation.collector = interaction.channel.createMessageComponentCollector({
            filter,
            time: 300000 // 5 minutos
        });

        navigation.collector.on('collect', async i => {
            const [action, id] = i.customId.split('_');
            
            if (action === 'prev') {
                await displayPage(i, navigationId, Math.max(0, pageNumber - 1));
            } else if (action === 'next') {
                await displayPage(i, navigationId, Math.min(totalPages - 1, pageNumber + 1));
            }
        });

        navigation.collector.on('end', () => {
            serverNavigation.delete(navigationId);
        });
    }
}
