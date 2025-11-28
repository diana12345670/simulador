const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

let openai = null;

if (process.env.OPENAI_API_KEY) {
    try {
        const OpenAI = require('openai');
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        console.log('✅ Kaori: OpenAI configurada com sucesso');
    } catch (error) {
        console.log('⚠️ Kaori: OpenAI não disponível, usando modo offline');
    }
} else {
    console.log('⚠️ Kaori: OPENAI_API_KEY não encontrada, usando modo offline');
}

const channelTimers = new Map();
const pendingConfirmations = new Map();
const INACTIVITY_TIMEOUT = 2 * 60 * 1000;
const WO_CONFIRMATION_TIMEOUT = 2 * 60 * 1000;

const KAORI_PERSONALITY = `Você é a Kaori, uma assistente amigável que media partidas de torneios no Discord.
Analise a mensagem do usuário e responda em JSON com este formato:
{
  "tipo": "vitoria" | "wo" | "pergunta" | "conversa",
  "vencedor": "time1" | "time2" | null,
  "resposta": "sua resposta amigável aqui"
}

- "vitoria": quando alguém declara que ganhou/venceu a partida
- "wo": quando alguém diz que o adversário sumiu/não apareceu/W.O.
- "pergunta": quando perguntam algo sobre a partida
- "conversa": para outras mensagens

Seja breve e amigável. Responda em português brasileiro.`;

const OFFLINE_RESPONSES = [
    'Oi! Sou a Kaori. Como posso ajudar com a partida?',
    'Olá! A partida já terminou? Qual foi o resultado?',
    'Oi pessoal! Precisam de ajuda com algo?',
    'Estou aqui para ajudar! O que aconteceu na partida?'
];

async function analyzeMessage(context, userMessage) {
    if (!openai) {
        return { tipo: 'conversa', vencedor: null, resposta: OFFLINE_RESPONSES[Math.floor(Math.random() * OFFLINE_RESPONSES.length)] };
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: KAORI_PERSONALITY },
                { role: 'user', content: `Contexto: ${context}\n\nMensagem: "${userMessage}"` }
            ],
            max_tokens: 200,
            temperature: 0.3
        });

        const content = response.choices[0].message.content;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.log('Kaori: resposta não é JSON, usando padrão');
        }

        return { tipo: 'conversa', vencedor: null, resposta: content };
    } catch (error) {
        console.error('Erro ao analisar mensagem:', error.message);
        return { tipo: 'conversa', vencedor: null, resposta: OFFLINE_RESPONSES[Math.floor(Math.random() * OFFLINE_RESPONSES.length)] };
    }
}

async function analyzeConfirmation(context, userMessage) {
    if (!openai) {
        return null;
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { 
                    role: 'system', 
                    content: `Você é a Kaori, assistente de torneios. Analise se o usuário está CONFIRMANDO ou NEGANDO um resultado de partida.
Responda APENAS com uma das opções:
- "confirmed" se o usuário confirmar (ex: sim, ok, verdade, confirmado, ganharam, perdemos, etc)
- "denied" se o usuário negar (ex: não, mentira, falso, errado, eu ganhei, etc)
- "unclear" se não for possível determinar

Seja inteligente ao interpretar gírias, erros de digitação e linguagem informal.` 
                },
                { role: 'user', content: `Contexto: ${context}\n\nMensagem do usuário: "${userMessage}"` }
            ],
            max_tokens: 20,
            temperature: 0.1
        });

        const content = response.choices[0].message.content.toLowerCase().trim();
        
        if (content.includes('confirmed')) return 'confirmed';
        if (content.includes('denied')) return 'denied';
        return null;
    } catch (error) {
        console.error('Erro ao analisar confirmação:', error.message);
        return null;
    }
}

function detectVictoryClaim(message, match) {
    const content = message.content.toLowerCase();
    const authorId = message.author.id;

    // Palavras-chave expandidas com gírias, abreviações e variações
    const victoryWords = [
        'ganhei', 'venci', 'ganhamos', 'vencemos', 'vitoria', 'vitória', 'win', 'gg',
        'já é', 'ja é', 'já era', 'ja era', 'passamos', 'passei', 'fechamos', 'fechei',
        'amassamos', 'amassei', 'destrui', 'destruimos', 'matei', 'matamos',
        'é nosso', 'e nosso', 'é nois', 'e nois', 'suave', 'tranquilo', 'easy',
        'next', 'proximo', 'próximo', 'bora pro próximo', 'acabou',
        'fch', 'fechou', 'fecho', 'ganhemo', 'vencemo', 'ganhou', 'venceu',
        'izi', 'ez', 'ezz', 'ezzz', 'facil', 'fácil', 'moleza', 'mamata',
        'demos conta', 'deu bom', 'deu certo', 'conseguimos', 'consegui',
        'passemo', 'passaram', 'eliminamos', 'eliminei', 'derrotamos', 'derrotei',
        'humilhamos', 'humilhei', 'atropelamos', 'atropelei', 'massacramos',
        'goleada', 'lavada', 'passeio', 'barbada', 'foi facil', 'foi fácil'
    ];
    
    const woWords = [
        'wo', 'w.o', 'w.o.', 'walko', 'walkover', 'wou', 'woou',
        'sumiu', 'sumiram', 'não apareceu', 'nao apareceu', 'n apareceu',
        'fugiu', 'fugiram', 'desistiu', 'desistiram', 'abandonou', 'abandonaram',
        'não veio', 'nao veio', 'n veio', 'não vem', 'nao vem', 'n vem',
        'cadê', 'cade', 'onde ta', 'onde tá', 'sumido', 'sumidos', 'cade ele',
        'deu pt', 'deu ruim', 'vazou', 'vazaram', 'pipocou', 'pipocaram',
        'amarelou', 'amarelaram', 'correu', 'correram', 'saiu fora',
        'nao vai jogar', 'não vai jogar', 'n vai jogar', 'desistência', 'desistencia',
        'deu no pe', 'deu no pé', 'se mandou', 'meteu o pe', 'meteu o pé',
        'ta off', 'tá off', 'ficou off', 'offline', 'saiu do server', 'saiu do discord',
        'deu ghost', 'ghostou', 'ignorando', 'nem responde', 'n responde'
    ];

    const isTeam1 = match.team1.includes(authorId);
    const isTeam2 = match.team2.includes(authorId);

    if (!isTeam1 && !isTeam2) return null;

    const claimsVictory = victoryWords.some(word => content.includes(word));
    const claimsWO = woWords.some(word => content.includes(word));

    if (claimsVictory || claimsWO) {
        return {
            claimerId: authorId,
            claimerTeam: isTeam1 ? 1 : 2,
            winnerTeam: isTeam1 ? match.team1 : match.team2,
            loserTeam: isTeam1 ? match.team2 : match.team1,
            isWO: claimsWO
        };
    }

    return null;
}

function mightBeRelevantMessage(content) {
    const lowerContent = content.toLowerCase();
    const relevantIndicators = [
        'olha', 'olha aí', 'olha ai', 'ó', 'ow', 'ei', 'eai', 'e aí',
        'pronto', 'feito', 'acabou', 'terminou', 'resultado',
        'oxi', 'mano', 'cara', 'véi', 'vei', 'pow', 'pô',
        'partida', 'jogo', 'match', 'round'
    ];
    return relevantIndicators.some(word => lowerContent.includes(word));
}

function detectConfirmation(message, pendingData) {
    const content = message.content.toLowerCase();
    const authorId = message.author.id;

    if (!pendingData.loserTeam.includes(authorId)) return null;

    // Palavras de confirmação expandidas com gírias e abreviações
    const confirmWords = [
        'sim', 'yes', 'confirmo', 'confirmado', 'ok', 'isso', 'verdade', 
        'ganharam', 'perdemos', 'perdi', 'perdemo', 'foi mal', 'gg',
        'isso mesmo', 'exato', 'certeza', 'pode crer', 'é isso', 'e isso',
        'foi isso', 'aconteceu', 'real', 'vdd', 'ss', 'sss', 'simm', 'simmm',
        'blz', 'beleza', 'suave', 'tranquilo', 'de boa', 'dboa', 'd boa',
        'vlw', 'valeu', 'tmj', 'fechou', 'certo', 'positivo', 'uhum', 'aham',
        'pdp', 'pdc', 'fch', 'fx', 'flw', 'fmz', 'firmeza', 'firm', 'joia',
        'jóia', 'show', 'top', 'bom', 'boa', 'dahora', 'massa', 'irado',
        'de rocha', 'dboa', 'dboas', 'ta certo', 'tá certo', 'ta bem', 'tá bem',
        'bele', 'bls', 'blzinha', 'deboa', 'deboassa', 'yes sir', 'yep', 'yeah',
        'aff', 'fazer oq', 'fazer o que', 'fz oq', 'infelizmente', 'pse', 'pois é'
    ];
    
    // Palavras de negação expandidas com gírias
    const denyWords = [
        'não', 'nao', 'n', 'mentira', 'errado', 'fake', 'falso',
        'nada a ver', 'nada haver', 'que isso', 'que issu', 'oxi', 'oxe',
        'ta doido', 'tá doido', 'ta loco', 'tá loco', 'doido', 'loco',
        'eu ganhei', 'eu venci', 'ganhei', 'venci', 'ganhamos', 'vencemos',
        'nunca', 'jamais', 'de jeito nenhum', 'nem', 'nananinanão',
        'para', 'pera', 'espera', 'calma', 'opa', 'eita', 'xiii',
        'errou', 'se enganou', 'engano', 'confundiu', 'viajou', 'viajando'
    ];

    const confirms = confirmWords.some(word => content.includes(word));
    const denies = denyWords.some(word => content.includes(word));

    if (confirms && !denies) return 'confirmed';
    if (denies) return 'denied';
    return null;
}

async function askForConfirmation(channel, claim, match, simulator) {
    const loserMentions = claim.loserTeam.map(id => `<@${id}>`).join(', ');
    const winnerMentions = claim.winnerTeam.map(id => `<@${id}>`).join(', ');

    const embed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('Confirmação de Resultado')
        .setDescription(claim.isWO 
            ? `${loserMentions}, o time adversário disse que vocês não apareceram (W.O.).\n\n**Isso é verdade?**\nRespondam com "sim" para confirmar ou "não" para contestar.\n\n⏰ Se não responderem em 2 minutos, a vitória será dada para ${winnerMentions}.`
            : `${loserMentions}, o time ${winnerMentions} disse que ganhou a partida.\n\n**Vocês confirmam?**\nRespondam com "sim" para confirmar ou "não" para contestar.`)
        .setFooter({ text: 'Kaori - Assistente de Torneios' })
        .setTimestamp();

    const msg = await channel.send({ embeds: [embed] });

    const confirmationData = {
        claimerId: claim.claimerId,
        winnerTeam: claim.winnerTeam,
        loserTeam: claim.loserTeam,
        winnerTeamNum: claim.claimerTeam,
        isWO: claim.isWO,
        simulatorId: simulator.id,
        matchId: match.id,
        messageId: msg.id,
        channelId: channel.id
    };

    pendingConfirmations.set(channel.id, confirmationData);

    if (claim.isWO) {
        setTimeout(async () => {
            const pending = pendingConfirmations.get(channel.id);
            if (pending && pending.messageId === msg.id) {
                await giveVictoryByKaori(channel, pending);
            }
        }, WO_CONFIRMATION_TIMEOUT);
    }
}

async function giveVictoryByKaori(channel, confirmationData) {
    try {
        const { getTournamentById, updateTournament } = require('../../utils/database');
        const { advanceWinner } = require('../tournament/bracket');
        const { createRedEmbed } = require('../../utils/embeds');

        const simulator = await getTournamentById(confirmationData.simulatorId);
        if (!simulator || !simulator.bracketData) return;

        const match = simulator.bracketData.matches.find(m => m.id === confirmationData.matchId);
        if (!match || match.state === 'finished') return;

        const result = advanceWinner(simulator.bracketData, confirmationData.matchId, confirmationData.winnerTeam);

        await updateTournament(confirmationData.simulatorId, { bracketData: result.bracketData });

        const winnerMentions = confirmationData.winnerTeam.map(id => `<@${id}>`).join(', ');

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Vitória Confirmada pela Kaori')
            .setDescription(`**Vencedor:** ${winnerMentions}\n\n${confirmationData.isWO ? 'O adversário não contestou a tempo.' : 'O resultado foi confirmado pelos jogadores.'}`)
            .setFooter({ text: 'Kaori - Assistente de Torneios' })
            .setTimestamp();

        await channel.send({ embeds: [embed] });

        pendingConfirmations.delete(channel.id);

        const { checkRoundComplete } = require('../../handlers/buttonHandler');
        if (typeof checkRoundComplete === 'function') {
            await checkRoundComplete({ guild: channel.guild, channel }, simulator, result);
        }

    } catch (error) {
        console.error('Erro ao dar vitória pela Kaori:', error);
    }
}

async function handleKaoriMention(message, simulator, match) {
    const pending = pendingConfirmations.get(message.channel.id);
    const mentionsKaori = message.content.toLowerCase().includes('kaori');
    
    // Processa confirmações pendentes
    if (pending) {
        // Primeiro tenta detectar por palavras-chave (econômico)
        const keywordConfirmation = detectConfirmation(message, pending);
        
        if (keywordConfirmation === 'confirmed') {
            await giveVictoryByKaori(message.channel, pending);
            return;
        } else if (keywordConfirmation === 'denied') {
            const embed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setDescription('O resultado foi contestado. O criador do torneio precisa decidir o vencedor.')
                .setFooter({ text: 'Kaori - Assistente de Torneios' });

            await message.reply({ embeds: [embed] });
            pendingConfirmations.delete(message.channel.id);
            return;
        }
        
        // Se não detectou por palavras-chave mas mencionou Kaori, usa IA
        if (mentionsKaori && openai) {
            const confirmContext = `O usuário está respondendo a uma confirmação de resultado.
Time vencedor alegado: ${pending.winnerTeam.map(id => `<@${id}>`).join(', ')}
Time perdedor: ${pending.loserTeam.map(id => `<@${id}>`).join(', ')}`;
            
            const confirmAnalysis = await analyzeConfirmation(confirmContext, message.content);
            
            if (confirmAnalysis === 'confirmed') {
                await giveVictoryByKaori(message.channel, pending);
                return;
            } else if (confirmAnalysis === 'denied') {
                const embed = new EmbedBuilder()
                    .setColor('#FF69B4')
                    .setDescription('O resultado foi contestado. O criador do torneio precisa decidir o vencedor.')
                    .setFooter({ text: 'Kaori - Assistente de Torneios' });

                await message.reply({ embeds: [embed] });
                pendingConfirmations.delete(message.channel.id);
                return;
            }
        }
    }

    // Primeiro tenta detectar vitória/WO por palavras-chave (econômico)
    const claim = detectVictoryClaim(message, match);
    if (claim) {
        await askForConfirmation(message.channel, claim, match, simulator);
        return;
    }

    // Usa IA se: mencionou "Kaori" OU a mensagem parece relevante mas não foi detectada
    const shouldUseAI = mentionsKaori || mightBeRelevantMessage(message.content);
    
    if (shouldUseAI && openai) {
        const context = `Torneio: ${simulator.name || 'Simulador'}
Time 1: ${match.team1.map(id => `<@${id}>`).join(', ')}
Time 2: ${match.team2.map(id => `<@${id}>`).join(', ')}
Rodada: ${match.round}
Usuário: ${message.author.username} (${match.team1.includes(message.author.id) ? 'Time 1' : match.team2.includes(message.author.id) ? 'Time 2' : 'Espectador'})`;

        const analysis = await analyzeMessage(context, message.content);

        if (analysis.tipo === 'vitoria' || analysis.tipo === 'wo') {
            const isTeam1 = match.team1.includes(message.author.id);
            const isTeam2 = match.team2.includes(message.author.id);

            if (isTeam1 || isTeam2) {
                const aiClaim = {
                    claimerId: message.author.id,
                    claimerTeam: isTeam1 ? 1 : 2,
                    winnerTeam: isTeam1 ? match.team1 : match.team2,
                    loserTeam: isTeam1 ? match.team2 : match.team1,
                    isWO: analysis.tipo === 'wo'
                };
                await askForConfirmation(message.channel, aiClaim, match, simulator);
                return;
            }
        }

        if (analysis.resposta) {
            const embed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setDescription(analysis.resposta)
                .setFooter({ text: 'Kaori - Assistente de Torneios' });

            await message.reply({ embeds: [embed] });
        }
    }
}

async function askForScore(channel, match) {
    const team1Mentions = match.team1.map(id => `<@${id}>`).join(', ');
    const team2Mentions = match.team2.map(id => `<@${id}>`).join(', ');

    const embed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('Oi, sou a Kaori!')
        .setDescription(`Notei que o criador do torneio está ausente. Posso ajudar!\n\n**Time 1:** ${team1Mentions}\n**Time 2:** ${team2Mentions}\n\nA partida já terminou? Digam "ganhei" ou "venci" e eu confirmo com o outro time!`)
        .setFooter({ text: 'Kaori - Assistente de Torneios' })
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

function startInactivityTimer(channelId, channel, match, creatorId) {
    if (channelTimers.has(channelId)) {
        clearTimeout(channelTimers.get(channelId));
    }

    const timer = setTimeout(async () => {
        try {
            await askForScore(channel, match);
        } catch (error) {
            console.error('Erro ao enviar mensagem de inatividade:', error);
        }
        channelTimers.delete(channelId);
    }, INACTIVITY_TIMEOUT);

    channelTimers.set(channelId, timer);
}

function resetInactivityTimer(channelId, channel, match, creatorId) {
    startInactivityTimer(channelId, channel, match, creatorId);
}

function clearInactivityTimer(channelId) {
    if (channelTimers.has(channelId)) {
        clearTimeout(channelTimers.get(channelId));
        channelTimers.delete(channelId);
    }
}

function isMatchChannel(channel) {
    if (!channel || !channel.name) return false;
    const name = channel.name.toLowerCase();
    return name.includes('rodada') || 
           name.includes('quartas') || 
           name.includes('semifinal') || 
           name.includes('final');
}

module.exports = {
    analyzeMessage,
    askForScore,
    handleKaoriMention,
    startInactivityTimer,
    resetInactivityTimer,
    clearInactivityTimer,
    isMatchChannel,
    detectVictoryClaim,
    detectConfirmation,
    pendingConfirmations
};