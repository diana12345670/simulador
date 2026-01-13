// interactionCreate.js - Gerencia todas as interações (comandos e botões)
const { handleButton } = require('../handlers/buttonHandler');
const { MessageFlags } = require('discord.js');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        
        // Comandos slash
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`Comando ${interaction.commandName} não encontrado`);
                // Responde para evitar timeout no cliente
                return interaction.reply({
                    content: `${emojis.negative} Comando não registrado. Tente novamente mais tarde.`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            try {
                await command.execute(interaction);
                // Se o comando não respondeu nem deferiu, envia fallback para evitar timeout silencioso
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `${emojis.negative} O comando não respondeu a tempo. Tente novamente.`,
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
            } catch (error) {
                console.error(`Erro ao executar comando ${interaction.commandName}:`, error);
                
                // Só tenta responder se a interação ainda é válida
                try {
                    const errorMessage = { 
                        content: `${emojis.negative} Ocorreu um erro ao executar este comando.`, 
                        flags: MessageFlags.Ephemeral 
                    };

                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                } catch (replyError) {
                    // Interação expirou ou já foi respondida, apenas loga
                    console.error('Não foi possível responder ao erro:', replyError.message);
                }
            }
        }
        // Botões e Select Menus
        else if (interaction.isButton() || interaction.isStringSelectMenu()) {
            const type = interaction.isButton() ? 'botão' : 'select menu';
            console.log(`🔘 Interação de ${type} detectada: ${interaction.customId}`);
            
            if (!interaction.customId) {
                console.error('❌ Interação sem customId!');
                return;
            }
            
            try {
                await handleButton(interaction);
                // Se não houve resposta/defer, envia fallback para evitar timeout
                if (!interaction.replied && !interaction.deferred) {
                    console.log(`⚠️ ${type} não respondeu, enviando fallback`);
                    await interaction.reply({
                        content: `${emojis.negative} A ação não respondeu a tempo. Tente novamente.`,
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
            } catch (error) {
                console.error(`❌ Erro ao processar ${type}:`, error);
                
                // Só tenta responder se a interação ainda é válida
                try {
                    const errorMessage = { 
                        content: `${emojis.negative} Ocorreu um erro ao processar esta ação.`, 
                        flags: MessageFlags.Ephemeral 
                    };

                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                } catch (replyError) {
                    // Interação expirou ou já foi respondida, apenas loga
                    console.error('Não foi possível responder ao erro:', replyError.message);
                }
            }
        }
    }
};
