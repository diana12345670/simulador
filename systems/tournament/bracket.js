// bracket.js - Funções para gerar e gerenciar brackets de torneios

/**
 * Gera a estrutura de bracket inicial
 * @param {Array} players - Lista de IDs dos jogadores
 * @param {string} mode - Modo do torneio (1v1, 2v2, 3v3, 4v4)
 * @param {Object} options - Opções adicionais (teamSelection, teamsData)
 * @returns {Object} Estrutura do bracket
 */
function generateBracket(players, mode, options = {}) {
    const playersPerTeam = parseInt(mode.charAt(0)); // Extrai número do modo (1v1 -> 1, 2v2 -> 2, etc)
    let teams = [];

    if (options.teamSelection === 'manual' && options.teamsData) {
        // Usa os times já formados manualmente
        const teamsData = options.teamsData;
        const totalTeams = Object.keys(teamsData).length;
        
        for (let i = 1; i <= totalTeams; i++) {
            const teamPlayers = teamsData[`time${i}`] || [];
            if (teamPlayers.length > 0) {
                teams.push(teamPlayers);
            }
        }

        // Embaralha os times para confrontos aleatórios
        teams = shuffleArray(teams);
    } else {
        // Modo aleatório: embaralha jogadores e divide em times
        const shuffledPlayers = shuffleArray([...players]);
        
        for (let i = 0; i < shuffledPlayers.length; i += playersPerTeam) {
            teams.push(shuffledPlayers.slice(i, i + playersPerTeam));
        }
    }

    // Gera os confrontos da primeira rodada
    const matches = [];
    for (let i = 0; i < teams.length; i += 2) {
        matches.push({
            id: `round1-match${i / 2 + 1}`,
            round: 1,
            team1: teams[i],
            team2: teams[i + 1],
            winner: null,
            status: 'pending'
        });
    }

    return {
        currentRound: 1,
        totalRounds: Math.log2(teams.length),
        matches: matches,
        mode: mode
    };
}

/**
 * Embaralha um array (Fisher-Yates shuffle)
 */
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Avança o vencedor para a próxima rodada
 * @param {Object} bracketData - Dados atuais do bracket
 * @param {string} matchId - ID da partida
 * @param {Array} winnerTeam - Time vencedor
 * @returns {Object} Bracket atualizado e informações sobre a próxima partida
 */
function advanceWinner(bracketData, matchId, winnerTeam) {
    const match = bracketData.matches.find(m => m.id === matchId);
    if (!match) return { bracketData, nextMatch: null };

    // Marca o vencedor
    match.winner = winnerTeam;
    match.status = 'completed';

    // Verifica se é a final
    const currentRoundMatches = bracketData.matches.filter(m => m.round === match.round && m.status === 'pending');
    
    if (currentRoundMatches.length === 0) {
        // Todas as partidas da rodada atual foram concluídas
        const currentRoundAllMatches = bracketData.matches.filter(m => m.round === match.round);
        const allCompleted = currentRoundAllMatches.every(m => m.status === 'completed');

        if (allCompleted && match.round < bracketData.totalRounds) {
            // Cria próxima rodada
            const winners = currentRoundAllMatches.map(m => m.winner);
            const nextRoundMatches = [];

            for (let i = 0; i < winners.length; i += 2) {
                nextRoundMatches.push({
                    id: `round${match.round + 1}-match${i / 2 + 1}`,
                    round: match.round + 1,
                    team1: winners[i],
                    team2: winners[i + 1],
                    winner: null,
                    status: 'pending'
                });
            }

            bracketData.matches.push(...nextRoundMatches);
            bracketData.currentRound = match.round + 1;

            return {
                bracketData,
                nextMatch: nextRoundMatches[0],
                isNewRound: true
            };
        } else if (match.round === bracketData.totalRounds) {
            // É a final, temos um campeão
            return {
                bracketData,
                nextMatch: null,
                champion: winnerTeam,
                isFinal: true
            };
        }
    }

    // Encontra próxima partida pendente
    const nextPending = bracketData.matches.find(m => m.status === 'pending');
    
    return {
        bracketData,
        nextMatch: nextPending,
        isNewRound: false
    };
}

/**
 * Obtém o nome da rodada baseado no número
 * @param {number} round - Número da rodada
 * @param {number} totalRounds - Total de rodadas
 * @returns {string} Nome da rodada
 */
function getRoundName(round, totalRounds) {
    if (round === totalRounds) return 'final';
    if (round === totalRounds - 1) return 'semifinal';
    if (round === totalRounds - 2) return 'quartas';
    if (round === totalRounds - 3) return 'oitavas';
    return `rodada${round}`;
}

module.exports = {
    generateBracket,
    advanceWinner,
    getRoundName
};
