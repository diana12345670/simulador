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
                return;
            }

            try {
                await command.execute(interaction);
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
            try {
                await handleButton(interaction);
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
