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

const KAORI_PERSONALITY = `Você é a Kaori, uma assistente ANIMADA e BRINCALHONA que media partidas de torneios no Discord.
Você AMA animar e brincar com os jogadores, usa linguagem SUPER INFORMAL e é muito divertida.

Analise a mensagem do usuário e responda em JSON com este formato:
{
  "tipo": "vitoria" | "wo" | "pergunta" | "conversa",
  "vencedor": "time1" | "time2" | null,
  "resposta": "sua resposta animada e divertida aqui"
}

TIPOS:
- "vitoria": quando alguém CLARAMENTE declara que ganhou/venceu a partida
- "wo": quando alguém diz que o adversário sumiu/não apareceu/W.O.
- "pergunta": quando perguntam algo sobre a partida ou sobre você
- "conversa": para outras mensagens, dúvidas, ou quando não tem certeza do resultado

SUA PERSONALIDADE:
1. Você é ANIMADA e adora fazer piadas e brincar com os jogadores de forma leve e carinhosa
2. Use linguagem MUITO INFORMAL feminina: "kkkk", "gente", "amg", "ai", "nossa", "mds", "aaaah", "eita"
3. NUNCA use palavrões ou xingamentos - seja engraçada e doce
4. Faça brincadeiras tipo: "ai gente arrasaram demais!", "nossa levou um passeio hein kkk", "destruíram tudo!"
5. Se alguém perdeu, seja empática mas divertida: "ai que pena, mas bora treinar mais!", "ops, foi difícil né? kkk"
6. Se alguém ganhou, comemore junto: "aaaaah que lindo!! arrasaram!!", "mitaram demais gente!", "destruíram tudo aaaah"
7. Se não entendeu quem ganhou, pergunte de forma fofa: "gente mas quem ganhou afinal? tô confusa aqui kkk"
8. NUNCA marque jogadores com <@id>, apenas converse normalmente
9. Responda SEMPRE em português brasileiro super informal e feminino

Exemplos de respostas:
- "e aí gente, quem arrasou nessa partida? kkkk"
- "aaaah que legal! ganharam é? deixa eu confirmar com o outro time kkk"
- "nossa gente não entendi nada, quem levou essa?"
- "ai que pena, mas já já vocês ganham! ♡"
- "mds que jogo incrível, parabéns pessoal!"
- "gente cadê o outro time? deu ghostzinho foi? kkk"`;


const OFFLINE_RESPONSES = [
    'oi gente! sou a Kaori kkk como posso ajudar?',
    'aaaah! a partida já aconteceu? quem ganhou? kkkk',
    'oi pessoal! bora, me conta o que rolou aí!',
    'eita, to aqui! digam "ganhei" ou "venci" que eu registro tudo ♡'
];

const QUESTION_RESPONSES = [
    'oi amg! quer saber das outras partidas? usa /rank_simu pra ver o andamento do torneio kkkk',
    'ai gente, pra ver as outras partidas olha no painel do torneio ou usa /rank_simu',
    'nossa to focada aqui nessa partida kkk pras outras usa /rank_simu ou olha no painel',
    'aaaah, cada partida tem seu canal, mas você pode ver tudo no /rank_simu ou no painel do torneio'
];

const VICTORY_OFFLINE_RESPONSES = [
    'aaaah! então vocês ganharam é? deixa eu confirmar com o outro time kkk',
    'nossa arrasaram demais! deixa eu pedir pro outro time confirmar ♡',
    'eita! vitória detectada! aguardando o outro time confirmar kkkk'
];

const WO_OFFLINE_RESPONSES = [
    'ai gente! o outro time sumiu? vou dar 2 min pra eles contestarem',
    'eita deu ghost? kkk vou esperar 2 min, se não aparecerem é WO mesmo',
    'nossa pipocaram? deixa eu ver se eles respondem em 2 min'
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

function normalizeTeamArray(team) {
    if (!team) return [];
    if (!Array.isArray(team)) {
        if (typeof team === 'string') return [team];
        if (typeof team === 'object' && team.id) return [String(team.id)];
        return [];
    }
    return team.map(member => {
        if (typeof member === 'string') return member;
        if (typeof member === 'number') return String(member);
        if (typeof member === 'object' && member.id) return String(member.id);
        if (typeof member === 'object' && member.userId) return String(member.userId);
        return String(member);
    }).filter(id => id && id !== 'undefined' && id !== 'null');
}

function isUserInTeam(userId, team) {
    const normalizedTeam = normalizeTeamArray(team);
    return normalizedTeam.includes(String(userId));
}

function detectVictoryClaim(message, match) {
    const content = message.content.toLowerCase();
    const authorId = String(message.author.id);

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

    const team1 = normalizeTeamArray(match.team1);
    const team2 = normalizeTeamArray(match.team2);

    const isTeam1 = team1.includes(authorId);
    const isTeam2 = team2.includes(authorId);

    if (!isTeam1 && !isTeam2) {
        return null;
    }

    const claimsVictory = victoryWords.some(word => content.includes(word));
    const claimsWO = woWords.some(word => content.includes(word));

    if (claimsVictory || claimsWO) {
        return {
            claimerId: authorId,
            claimerTeam: isTeam1 ? 1 : 2,
            winnerTeam: isTeam1 ? team1 : team2,
            loserTeam: isTeam1 ? team2 : team1,
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

function detectQuestionAboutMatches(content) {
    const lowerContent = content.toLowerCase();
    const questionIndicators = [
        'como esta', 'como está', 'como',
        'outras partidas', 'outros jogos', 'outras lutas',
        'quem ganhou', 'quem venceu', 'quem ta ganhando', 'quem tá ganhando',
        'andamento', 'situação', 'situacao', 'status',
        'quem passou', 'quem avançou', 'quem avancou',
        'como vai', 'como que ta', 'como que tá',
        'qual o placar', 'qual placar', 'quantas partidas',
        'falta quantas', 'faltam quantas', 'quantas faltam'
    ];
    return questionIndicators.some(phrase => lowerContent.includes(phrase));
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

    const messageText = claim.isWO 
        ? `ai gente ${loserMentions}, o outro time disse que vocês sumiram (W.O.) kkkk\n\nisso é verdade? respondam "sim" pra confirmar ou "não" pra contestar ♡\n\n⏰ se não responderem em 2 min, a vitória vai pro ${winnerMentions}`
        : `oi ${loserMentions}! o time ${winnerMentions} disse que ganhou essa partida\n\nvocês confirmam? respondam "sim" ou "não" ♡`;

    const msg = await channel.send(messageText);

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

        const simulator = await getTournamentById(confirmationData.simulatorId);
        if (!simulator || !simulator.bracketData) return;

        const match = simulator.bracketData.matches.find(m => m.id === confirmationData.matchId);
        if (!match || match.status === 'completed') return;

        const result = advanceWinner(simulator.bracketData, confirmationData.matchId, confirmationData.winnerTeam);

        await updateTournament(confirmationData.simulatorId, { bracketData: result.bracketData });

        const winnerMentions = confirmationData.winnerTeam.map(id => `<@${id}>`).join(', ');

        const victoryMessage = confirmationData.isWO 
            ? `aaaah vitória confirmada pro ${winnerMentions}! ♡ o adversário não contestou a tempo`
            : `que lindo! vitória confirmada pro ${winnerMentions}! partida registrada ♡`;

        await channel.send(victoryMessage);

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
    const lowerContent = message.content.toLowerCase();
    const mentionsKaori = lowerContent.includes('kaori');

    if (pending) {
        const keywordConfirmation = detectConfirmation(message, pending);

        if (keywordConfirmation === 'confirmed') {
            await giveVictoryByKaori(message.channel, pending);
            return;
        } else if (keywordConfirmation === 'denied') {
            await message.reply('Resultado contestado. O criador do torneio precisará decidir o vencedor.');
            pendingConfirmations.delete(message.channel.id);
            return;
        }

        if (mentionsKaori && openai) {
            const confirmContext = `O usuário está respondendo a uma confirmação de resultado.
Time vencedor alegado: ${pending.winnerTeam.map(id => `<@${id}>`).join(', ')}
Time perdedor: ${pending.loserTeam.map(id => `<@${id}>`).join(', ')}`;

            const confirmAnalysis = await analyzeConfirmation(confirmContext, message.content);

            if (confirmAnalysis === 'confirmed') {
                await giveVictoryByKaori(message.channel, pending);
                return;
            } else if (confirmAnalysis === 'denied') {
                await message.reply('Resultado contestado. O criador do torneio precisará decidir o vencedor.');
                pendingConfirmations.delete(message.channel.id);
                return;
            }
        }
    }

    const claim = detectVictoryClaim(message, match);
    if (claim) {
        await askForConfirmation(message.channel, claim, match, simulator);
        return;
    }

    if (mentionsKaori && detectQuestionAboutMatches(lowerContent)) {
        await message.reply(QUESTION_RESPONSES[Math.floor(Math.random() * QUESTION_RESPONSES.length)]);
        return;
    }

    if (openai) {
        const shouldUseAI = mentionsKaori || mightBeRelevantMessage(lowerContent);

        if (shouldUseAI) {
            const team1 = normalizeTeamArray(match.team1);
            const team2 = normalizeTeamArray(match.team2);
            const authorId = String(message.author.id);

            const context = `Torneio: ${simulator.name || 'Simulador'}
Time 1: ${team1.map(id => `<@${id}>`).join(', ')}
Time 2: ${team2.map(id => `<@${id}>`).join(', ')}
Rodada: ${match.round}
Usuário: ${message.author.username} (${team1.includes(authorId) ? 'Time 1' : team2.includes(authorId) ? 'Time 2' : 'Espectador'})`;

            const analysis = await analyzeMessage(context, message.content);

            if (analysis.tipo === 'vitoria' || analysis.tipo === 'wo') {
                const isTeam1 = team1.includes(authorId);
                const isTeam2 = team2.includes(authorId);

                if (isTeam1 || isTeam2) {
                    const aiClaim = {
                        claimerId: authorId,
                        claimerTeam: isTeam1 ? 1 : 2,
                        winnerTeam: isTeam1 ? team1 : team2,
                        loserTeam: isTeam1 ? team2 : team1,
                        isWO: analysis.tipo === 'wo'
                    };
                    await askForConfirmation(message.channel, aiClaim, match, simulator);
                    return;
                }
            }

            if (analysis.resposta) {
                await message.reply(analysis.resposta);
            }
        }
    } else if (mentionsKaori) {
        await message.reply(OFFLINE_RESPONSES[Math.floor(Math.random() * OFFLINE_RESPONSES.length)]);
    }
}

async function askForScore(channel, match) {
    await channel.send(`oi gente! sou a kaori ♡ notei que o mediador tá sumido faz um tempinho\n\na partida já terminou? digam "ganhei" ou "venci" que eu confirmo com o outro time!`);
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

const GENERAL_CHAT_PERSONALITY = `Você é a Kaori, uma assistente de torneios do Discord. Você é profissional, direta e objetiva.

Características:
- Use linguagem clara e profissional
- Seja objetiva e direta
- Responda em português brasileiro
- NUNCA use palavrões ou gírias excessivas
- Mantenha respostas curtas e diretas (máximo 2-3 frases)
- Você pode responder sobre qualquer assunto, não apenas torneios

Se perguntarem sobre você:
- Seu nome é Kaori
- Você é a assistente do bot de simuladores/torneios
- Você ajuda a mediar partidas e responder dúvidas`;

const GENERAL_OFFLINE_RESPONSES = [
    'Kaori aqui. Como posso ajudar?',
    'Assistente de torneios. Em que posso ser útil?',
    'Disponível para ajudar. Qual sua dúvida?'
];

async function handleGeneralChat(message) {
    const userMessage = message.content.replace(/<@!?\d+>/g, '').trim();

    if (!userMessage) {
        await message.reply('oi gente! me chamou? manda sua pergunta aí que eu respondo kkk ♡');
        return;
    }

    if (!openai) {
        await message.reply(GENERAL_OFFLINE_RESPONSES[Math.floor(Math.random() * GENERAL_OFFLINE_RESPONSES.length)]);
        return;
    }

    try {
        await message.channel.sendTyping();

        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: GENERAL_CHAT_PERSONALITY },
                { role: 'user', content: userMessage }
            ],
            max_tokens: 150,
            temperature: 0.7
        });

        const reply = response.choices[0].message.content;
        await message.reply(reply);

    } catch (error) {
        console.error('[Kaori Chat] Erro ao processar mensagem:', error.message);
        await message.reply('ai gente, deu um bug aqui kkk tenta de novo? ♡');
    }
}

module.exports = {
    analyzeMessage,
    askForScore,
    handleKaoriMention,
    handleGeneralChat,
    startInactivityTimer,
    resetInactivityTimer,
    clearInactivityTimer,
    isMatchChannel,
    detectVictoryClaim,
    detectConfirmation,
    detectQuestionAboutMatches,
    normalizeTeamArray,
    pendingConfirmations
};