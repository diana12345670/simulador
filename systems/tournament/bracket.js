// bracket.js - Funções para gerar e gerenciar brackets de torneios

/**
 * Calcula a próxima potência de 2
 */
function nextPowerOf2(n) {
    if (n <= 0) return 2;
    let power = 1;
    while (power < n) {
        power *= 2;
    }
    return power;
}

/**
 * Gera a estrutura de bracket inicial
 * @param {Array} players - Lista de IDs dos jogadores
 * @param {string} mode - Modo do torneio (1v1, 2v2, 3v3, 4v4)
 * @param {Object} options - Opções adicionais (teamSelection, teamsData)
 * @returns {Object} Estrutura do bracket
 */
function generateBracket(players, mode, options = {}) {
    const playersPerTeam = parseInt(mode.charAt(0)) || 1;
    let teams = [];

    if (options.teamSelection === 'manual' && options.teamsData) {
        const teamsData = options.teamsData;
        const totalTeams = Object.keys(teamsData).length;
        
        for (let i = 1; i <= totalTeams; i++) {
            const teamPlayers = teamsData[`time${i}`] || [];
            if (teamPlayers.length > 0) {
                teams.push(teamPlayers);
            }
        }

        teams = shuffleArray(teams);
    } else {
        const shuffledPlayers = shuffleArray([...players]);
        
        for (let i = 0; i < shuffledPlayers.length; i += playersPerTeam) {
            const teamSlice = shuffledPlayers.slice(i, i + playersPerTeam);
            if (teamSlice.length === playersPerTeam) {
                teams.push(teamSlice);
            }
        }
    }

    if (teams.length === 0) {
        return {
            currentRound: 1,
            totalRounds: 1,
            matches: [],
            mode: mode,
            error: 'Nenhum time válido encontrado'
        };
    }

    if (teams.length === 1) {
        return {
            currentRound: 1,
            totalRounds: 1,
            matches: [],
            mode: mode,
            champion: teams[0],
            isFinal: true
        };
    }

    const bracketSize = nextPowerOf2(teams.length);
    const byesNeeded = bracketSize - teams.length;
    
    for (let i = 0; i < byesNeeded; i++) {
        teams.push(null);
    }

    const matches = [];
    let matchCount = 0;
    
    for (let i = 0; i < teams.length; i += 2) {
        matchCount++;
        const team1 = teams[i];
        const team2 = teams[i + 1];
        
        if (team2 === null && team1 !== null) {
            matches.push({
                id: `round1-match${matchCount}`,
                round: 1,
                team1: team1,
                team2: null,
                winner: team1,
                status: 'completed',
                isBye: true
            });
        } else if (team1 === null && team2 !== null) {
            matches.push({
                id: `round1-match${matchCount}`,
                round: 1,
                team1: null,
                team2: team2,
                winner: team2,
                status: 'completed',
                isBye: true
            });
        } else if (team1 !== null && team2 !== null) {
            matches.push({
                id: `round1-match${matchCount}`,
                round: 1,
                team1: team1,
                team2: team2,
                winner: null,
                status: 'pending'
            });
        }
    }

    const totalRounds = Math.max(1, Math.ceil(Math.log2(bracketSize)));

    const bracketData = {
        currentRound: 1,
        totalRounds: totalRounds,
        matches: matches,
        mode: mode
    };

    const result = processCompletedRound(bracketData, 1);
    
    if (result.champion) {
        bracketData.champion = result.champion;
        bracketData.isFinal = true;
    }

    return bracketData;
}

function processCompletedRound(bracketData, round) {
    const matches = bracketData.matches;
    const totalRounds = bracketData.totalRounds;
    const roundMatches = matches.filter(m => m.round === round);
    
    if (roundMatches.length === 0) {
        return { champion: null };
    }
    
    const allCompleted = roundMatches.every(m => m.status === 'completed');
    
    if (!allCompleted) {
        return { champion: null };
    }
    
    bracketData.currentRound = Math.max(bracketData.currentRound, round);
    
    const winners = roundMatches.map(m => m.winner).filter(w => w !== null);
    
    if (winners.length === 0) {
        return { champion: null };
    }
    
    if (winners.length === 1) {
        bracketData.currentRound = round;
        bracketData.champion = winners[0];
        bracketData.isFinal = true;
        return { champion: winners[0] };
    }
    
    if (round >= totalRounds) {
        if (winners.length > 0) {
            bracketData.champion = winners[0];
            bracketData.isFinal = true;
            return { champion: winners[0] };
        }
        return { champion: null };
    }
    
    const existingNextRound = matches.filter(m => m.round === round + 1);
    if (existingNextRound.length > 0) {
        bracketData.currentRound = round + 1;
        return processCompletedRound(bracketData, round + 1);
    }
    
    let matchCount = 0;
    for (let i = 0; i < winners.length; i += 2) {
        matchCount++;
        const team1 = winners[i];
        const team2 = winners[i + 1] || null;
        
        if (team2 === null) {
            matches.push({
                id: `round${round + 1}-match${matchCount}`,
                round: round + 1,
                team1: team1,
                team2: null,
                winner: team1,
                status: 'completed',
                isBye: true
            });
        } else {
            matches.push({
                id: `round${round + 1}-match${matchCount}`,
                round: round + 1,
                team1: team1,
                team2: team2,
                winner: null,
                status: 'pending'
            });
        }
    }
    
    bracketData.currentRound = round + 1;
    
    return processCompletedRound(bracketData, round + 1);
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

    match.winner = winnerTeam;
    match.status = 'completed';

    const currentRoundMatches = bracketData.matches.filter(m => m.round === match.round && m.status === 'pending');
    
    if (currentRoundMatches.length === 0) {
        const currentRoundAllMatches = bracketData.matches.filter(m => m.round === match.round);
        const allCompleted = currentRoundAllMatches.every(m => m.status === 'completed');

        if (allCompleted && match.round < bracketData.totalRounds) {
            const winners = currentRoundAllMatches.map(m => m.winner).filter(w => w !== null);
            
            if (winners.length === 1) {
                return {
                    bracketData,
                    nextMatch: null,
                    champion: winners[0],
                    isFinal: true
                };
            }
            
            const existingNextRound = bracketData.matches.filter(m => m.round === match.round + 1);
            if (existingNextRound.length > 0) {
                const nextPending = bracketData.matches.find(m => m.status === 'pending' && !m.isBye);
                return {
                    bracketData,
                    nextMatch: nextPending,
                    isNewRound: true
                };
            }
            
            const nextRoundMatches = [];
            let matchCount = 0;

            for (let i = 0; i < winners.length; i += 2) {
                matchCount++;
                const team1 = winners[i];
                const team2 = winners[i + 1] || null;
                
                if (team2 === null) {
                    nextRoundMatches.push({
                        id: `round${match.round + 1}-match${matchCount}`,
                        round: match.round + 1,
                        team1: team1,
                        team2: null,
                        winner: team1,
                        status: 'completed',
                        isBye: true
                    });
                } else {
                    nextRoundMatches.push({
                        id: `round${match.round + 1}-match${matchCount}`,
                        round: match.round + 1,
                        team1: team1,
                        team2: team2,
                        winner: null,
                        status: 'pending'
                    });
                }
            }

            bracketData.matches.push(...nextRoundMatches);
            bracketData.currentRound = match.round + 1;
            
            const processResult = processCompletedRound(bracketData, match.round + 1);
            
            if (processResult.champion) {
                return {
                    bracketData,
                    nextMatch: null,
                    champion: processResult.champion,
                    isFinal: true
                };
            }
            
            const nextPending = bracketData.matches.find(m => m.status === 'pending' && !m.isBye);

            return {
                bracketData,
                nextMatch: nextPending,
                isNewRound: nextPending !== undefined
            };
        } else if (match.round >= bracketData.totalRounds) {
            return {
                bracketData,
                nextMatch: null,
                champion: winnerTeam,
                isFinal: true
            };
        }
    }

    const nextPending = bracketData.matches.find(m => m.status === 'pending' && !m.isBye);
    
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
