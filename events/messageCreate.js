const { Events } = require('discord.js');
const { getTournamentById, getAllTournaments } = require('../utils/database');
const kaoriAssistant = require('../systems/kaori/assistant');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        if (message.mentions.everyone) return;
        if (message.mentions.roles.size > 0) return;
        
        const botMention = `<@${message.client.user.id}>`;
        const botMentionNick = `<@!${message.client.user.id}>`;
        const mentionsBot = message.content.includes(botMention) || message.content.includes(botMentionNick);
        const lowerContent = message.content.toLowerCase();
        const mentionsKaori = lowerContent.includes('kaori');

        if ((mentionsBot || mentionsKaori) && !kaoriAssistant.isMatchChannel(message.channel)) {
            await kaoriAssistant.handleGeneralChat(message);
            return;
        }

        if (!kaoriAssistant.isMatchChannel(message.channel)) return;

        try {
            const tournaments = await getAllTournaments();
            let matchingTournament = null;
            let matchingMatch = null;

            for (const tournament of tournaments) {
                if (!tournament.bracketData || !tournament.bracketData.matches) continue;

                for (const match of tournament.bracketData.matches) {
                    if (match.channelId === message.channel.id) {
                        matchingTournament = tournament;
                        matchingMatch = match;
                        break;
                    }
                }
                if (matchingTournament) break;
            }

            if (!matchingTournament || !matchingMatch) return;

            const creatorId = matchingTournament.creatorId;
            if (!creatorId) return;
            
            if (kaoriAssistant.detectMatchInProgress(lowerContent)) {
                kaoriAssistant.pauseKaoriForChannel(message.channel.id, 5 * 60 * 1000);
                await message.reply('ok, ainda jogando. avisa quando acabar');
                return;
            }
            
            const pending = kaoriAssistant.pendingConfirmations.get(message.channel.id);
            if (pending) {
                const autoConfirmation = kaoriAssistant.checkMessageForAutoConfirmation(message, message.channel.id);
                if (autoConfirmation === 'confirmed') {
                    await kaoriAssistant.giveVictoryByKaori(message.channel, pending);
                    return;
                } else if (autoConfirmation === 'denied') {
                    await message.reply('Resultado contestado. O criador do torneio precisará decidir o vencedor.');
                    kaoriAssistant.pendingConfirmations.delete(message.channel.id);
                    return;
                }
            }
            
            const isCreator = message.author.id === creatorId;
            const mentionsCreator = creatorId ? message.mentions.users.has(creatorId) : false;
            const mentionsKaoriInMatch = lowerContent.includes('kaori') || lowerContent.includes('@kaori') || mentionsBot;

            const victoryPhrases = [
                'da a vitoria', 'dá a vitória', 'da a vitória', 'dá a vitoria',
                'da vitoria', 'dá vitória', 'da vitória', 'dá vitoria',
                'ganhou', 'ganhei', 'ganhamos', 'venceu', 'venci', 'vencemos',
                'vitoria pro', 'vitória pro', 'vitoria pra', 'vitória pra',
                'registra a vitoria', 'registra a vitória', 'confirma a vitoria', 'confirma a vitória'
            ];
            const hasVictoryPhrase = victoryPhrases.some(phrase => lowerContent.includes(phrase));

            if (isCreator) {
                kaoriAssistant.resetInactivityTimer(message.channel.id, message.channel, matchingMatch, creatorId);
            }

            if (mentionsCreator || mentionsKaoriInMatch || hasVictoryPhrase) {
                await kaoriAssistant.handleKaoriMention(message, matchingTournament, matchingMatch);
            }

            if (!isCreator) {
                kaoriAssistant.startInactivityTimer(message.channel.id, message.channel, matchingMatch, creatorId);
            }

        } catch (error) {
            console.error('Erro no messageCreate (Kaori):', error);
        }
    }
};