const { Events } = require('discord.js');
const { getTournamentById, getAllTournaments } = require('../utils/database');
const { 
    handleKaoriMention, 
    startInactivityTimer, 
    resetInactivityTimer, 
    clearInactivityTimer,
    isMatchChannel 
} = require('../systems/kaori/assistant');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild) return;

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
            const mentionsKaori = message.content.toLowerCase().includes('kaori') || 
                                  message.content.toLowerCase().includes('@kaori');

            if (isCreator) {
                resetInactivityTimer(message.channel.id, message.channel, matchingMatch, creatorId);
            }

            // Kaori responde quando: alguém menciona o criador, menciona Kaori, ou o próprio criador fala com a Kaori
            if (mentionsCreator || mentionsKaori || (isCreator && mentionsKaori)) {
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
