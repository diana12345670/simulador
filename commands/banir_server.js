// banir_server.js - Comando para o dono banir um servidor
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { banServer, isGuildBanned, isOwnerOrAuthorized } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banir_server')
        .setDescription('[DONO] Bane um servidor de usar o bot')
        .addStringOption(option =>
            option.setName('server_id')
                .setDescription('ID do servidor')
                .setRequired(true)),

    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        const authorized = await isOwnerOrAuthorized(interaction.user.id);
        if (!authorized) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Apenas o dono do bot pode usar este comando.`, interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        const guildId = interaction.options.getString('server_id');

        try {
            // Verifica se o servidor já está banido
            const alreadyBanned = await isGuildBanned(guildId);
            if (alreadyBanned) {
                return interaction.reply({
                    embeds: [createErrorEmbed(`${emojis.negative} Este servidor já está banido.`, interaction.client)],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Adiciona à lista de servidores banidos
            await banServer(guildId, 'Banido manualmente pelo dono');
            console.log(`🚫 [banir_server] Servidor ${guildId} foi banido por ${interaction.user.tag}`);

        } catch (error) {
            console.error('Erro ao banir servidor:', error);
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Erro ao salvar o banimento no banco de dados.`, interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        // Tenta sair do servidor se o bot estiver nele
        const guild = interaction.client.guilds.cache.get(guildId);
        let leftServer = false;
        
        if (guild) {
            try {
                await guild.leave();
                leftServer = true;
                console.log(`✅ Bot saiu do servidor banido: ${guild.name} (ID: ${guildId})`);
            } catch (error) {
                console.error('Erro ao sair do servidor banido:', error);
            }
        }

        // Mensagem de sucesso
        const message = leftServer 
            ? `${emojis.positive} Servidor \`${guildId}\` foi banido com sucesso e o bot saiu dele.`
            : `${emojis.positive} Servidor \`${guildId}\` foi banido com sucesso. O bot não estava no servidor.`;

        await interaction.reply({
            embeds: [createSuccessEmbed(message, interaction.client)]
        });
    }
};