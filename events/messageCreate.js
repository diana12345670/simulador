const { Events } = require('discord.js');
const { getTournamentById, getAllTournaments } = require('../utils/database');
const { 
    handleKaoriMention, 
    startInactivityTimer, 
    resetInactivityTimer, 
    clearInactivityTimer,
    isMatchChannel,
    detectVictoryClaim,
    handleGeneralChat
} = require('../systems/kaori/assistant');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        const mentionsBot = message.mentions.has(message.client.user);
        const lowerContent = message.content.toLowerCase();
        const mentionsKaori = lowerContent.includes('kaori');

        // Responde em canais não-partida se mencionar o bot ou escrever "kaori"
        if ((mentionsBot || mentionsKaori) && !isMatchChannel(message.channel)) {
            await handleGeneralChat(message);
            return;
        }

        if (!isMatchChannel(message.channel)) return;

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
            const isCreator = message.author.id === creatorId;
            const mentionsCreator = message.mentions.users.has(creatorId);
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
                resetInactivityTimer(message.channel.id, message.channel, matchingMatch, creatorId);
            }

            if (mentionsCreator || mentionsKaoriInMatch || hasVictoryPhrase) {
                await handleKaoriMention(message, matchingTournament, matchingMatch);
            }

            if (!isCreator) {
                startInactivityTimer(message.channel.id, message.channel, matchingMatch, creatorId);
            }

        } catch (error) {
            console.error('Erro no messageCreate (Kaori):', error);
        }
    }
};