// messageDelete.js - Evento para detectar mensagens deletadas
const { Events } = require('discord.js');
const { getLiveRankPanelsByGuild, removeLiveRankPanel } = require('../utils/database');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild) return;
        if (message.author?.id !== message.client.user?.id) return;

        try {
            const panels = await getLiveRankPanelsByGuild(message.guild.id);
            const panel = panels.find(p => p.messageId === message.id);
            
            if (panel) {
                await removeLiveRankPanel(message.guild.id, message.id);
                console.log(`🗑️ Painel de rank ao vivo removido (mensagem deletada): ${message.id}`);
            }
        } catch (error) {
            console.error('Erro ao verificar painel deletado:', error.message);
        }
    }
};
