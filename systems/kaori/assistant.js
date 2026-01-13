const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { readConfig } = require('../../utils/database');

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
const channelPausedUntil = new Map();
const messageWatchers = new Map();
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;
const WO_CONFIRMATION_TIMEOUT = 2 * 60 * 1000;
const MESSAGE_WATCH_COUNT = 8;

const KAORI_PERSONALITY = `Você é a Kaori, uma assistente IRÔNICA, SARCÁSTICA e SEM FILTRO que media partidas de torneios no Discord.
Você NÃO é amigável, não é fofa, não é carinhosa. Você é debochada, provocadora e vai direto ao ponto.
Você pode ser grosseira, usar gírias pesadas e xingar de forma leve (merd*, p0rr*, caralh0, vtnc, vsf, etc - use censura parcial nos palavrões).

Analise a mensagem do usuário e responda em JSON com este formato:
{
  "tipo": "vitoria" | "wo" | "pergunta" | "conversa",
  "vencedor": "time1" | "time2" | null,
  "resposta": "sua resposta irônica, debochada e provocadora aqui"
}

TIPOS:
- "vitoria": quando alguém CLARAMENTE declara que ganhou/venceu a partida
- "wo": quando alguém diz que o adversário sumiu/não apareceu/W.O.
- "pergunta": quando perguntam algo sobre a partida ou sobre você
- "conversa": para outras mensagens, dúvidas, ou quando não tem certeza do resultado

SUA PERSONALIDADE:
1. Você é IRÔNICA, SARCÁSTICA e DEBOCHADA
2. Seja DIRETA, IMPACIENTE e sem paciência para enrolação
3. Use linguagem curta, seca e provocadora: "ok", "mano, quem ganhou?", "anda logo", "anotado, vaza"
4. NUNCA use "amg", "gente", "ai", "nossa", palavras fofas ou emojis de coração
5. Se alguém perdeu, seja debochada: "perdeu? kkkk treina mais", "F", "se lascou hein", "amador demais"
6. Se alguém ganhou, seja seca: "ok, vitória registrada", "anotado, agora vaza", "beleza, próximo"
7. Se não entendeu quem ganhou, seja impaciente: "mano, quem ganhou afinal?", "resultado? fala logo"
8. NUNCA marque jogadores com <@id>, apenas converse normalmente
9. Responda SEMPRE em português brasileiro de forma direta e irônica
10. Não demonstre interesse ou entusiasmo, apenas faça seu trabalho de má vontade
11. Quando alguém demorar ou enrolar: "anda logo", "para de enrolar", "vsf anda"
12. Pode usar xingamentos leves e censurados quando irritada: "p0rr4", "vtnc", "vsf", "merd4"

Exemplos de respostas:
- "ok, então ganharam. registrando e vazando, tchau"
- "beleza, vitória anotada. próximo"
- "entendi. W.O. então. registrado, bando de covarde"
- "mano, quem ganhou isso? fala logo"
- "perdeu? kkkkk acontece, treina mais noob"
- "cadê o outro time? sumiram? covardes vsf"`;


const OFFLINE_RESPONSES = [
    'fala. resultado?',
    'quem ganhou mano?',
    'e aí, acabou? quem levou?',
    'digam "ganhei" ou "venci" que eu registro'
];

const QUESTION_RESPONSES = [
    'usa /rank_simu pra ver o andamento',
    'olha no painel do torneio ou usa /rank_simu, não sou sua babá',
    'cada partida tem seu canal. usa /rank_simu e para de encher',
    '/rank_simu mostra tudo, agora me deixa em paz'
];

const VICTORY_OFFLINE_RESPONSES = [
    'ok, ganharam. aguardando o outro time confirmar',
    'beleza. esperando confirmação do adversário',
    'anotado. outro time precisa confirmar, se não forem covardes'
];

const WO_OFFLINE_RESPONSES = [
    'sumiram? covardes. vou dar 2 min pra contestarem',
    'W.O.? 2 min pra responderem, se não, vitória pro adversário',
    'típico de covarde. 2 min pra aparecerem ou é W.O.'
];

async function isAIEnabled(guildId) {
    const aiConfig = await readConfig('ai_enabled_guilds', {});
    return aiConfig[guildId] === true; // padrão: DESATIVADO; só liga se estiver true
}

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

function detectMatchInProgress(content) {
    const lowerContent = content.toLowerCase();
    const inProgressPhrases = [
        'ta em partida', 'tá em partida', 'em partida', 'na partida',
        'nao acabou', 'não acabou', 'n acabou', 'ainda nao acabou', 'ainda não acabou',
        'ainda jogando', 'to jogando', 'tô jogando', 'estamos jogando',
        'ainda ta rolando', 'ainda tá rolando', 'ta rolando', 'tá rolando',
        'calma ai', 'calma aí', 'perai', 'pera aí', 'espera', 'aguarda',
        'ainda nao terminou', 'ainda não terminou', 'n terminou', 'nao terminou', 'não terminou',
        'ainda em jogo', 'em andamento', 'jogando ainda',
        'jogo ta rolando', 'jogo tá rolando', 'match ta rolando', 'match tá rolando',
        'ta no meio', 'tá no meio', 'no meio do jogo', 'no meio da partida',
        'falta acabar', 'n acabou ainda', 'nao acabou ainda', 'não acabou ainda',
        'round ainda', 'jogo ainda', 'partida ainda',
        'a gente ta jogando', 'a gente tá jogando', 'tamo jogando',
        'nao acabamo', 'não acabamo', 'n acabamo', 'nao terminamo', 'não terminamo'
    ];
    return inProgressPhrases.some(phrase => lowerContent.includes(phrase));
}

function pauseKaoriForChannel(channelId, durationMs = 5 * 60 * 1000) {
    channelPausedUntil.set(channelId, Date.now() + durationMs);
    clearInactivityTimer(channelId);
}

function isKaoriPausedForChannel(channelId) {
    const pausedUntil = channelPausedUntil.get(channelId);
    if (!pausedUntil) return false;
    if (Date.now() > pausedUntil) {
        channelPausedUntil.delete(channelId);
        return false;
    }
    return true;
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
        ? `${loserMentions}, o outro time disse que vocês sumiram. W.O.?\n\n"sim" pra confirmar, "não" pra contestar. 2 min pra responder ou vitória pro ${winnerMentions}`
        : `${loserMentions}, o time ${winnerMentions} disse que ganhou.\n\nconfirmam? vou ver as próximas mensagens`;

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
        channelId: channel.id,
        messagesWatched: 0,
        startTime: Date.now()
    };

    pendingConfirmations.set(channel.id, confirmationData);
    
    messageWatchers.set(channel.id, {
        remaining: MESSAGE_WATCH_COUNT,
        confirmationData: confirmationData
    });

    if (claim.isWO) {
        setTimeout(async () => {
            const pending = pendingConfirmations.get(channel.id);
            if (pending && pending.messageId === msg.id) {
                await giveVictoryByKaori(channel, pending);
            }
        }, WO_CONFIRMATION_TIMEOUT);
    }
}

function checkMessageForAutoConfirmation(message, channelId) {
    const watcher = messageWatchers.get(channelId);
    if (!watcher) return null;
    
    const pending = pendingConfirmations.get(channelId);
    if (!pending) {
        messageWatchers.delete(channelId);
        return null;
    }
    
    if (!pending.loserTeam.includes(message.author.id)) {
        return null;
    }
    
    watcher.remaining--;
    
    const confirmation = detectConfirmation(message, pending);
    
    if (confirmation) {
        messageWatchers.delete(channelId);
        return confirmation;
    }
    
    if (watcher.remaining <= 0) {
        messageWatchers.delete(channelId);
    }
    
    return null;
}

async function giveVictoryByKaori(channel, confirmationData) {
    if (!(await isAIEnabled(channel.guildId))) return;
    try {
        const { getTournamentById, updateTournament } = require('../../utils/database');
        const { advanceWinner } = require('../tournament/bracket');
        const { EmbedBuilder } = require('discord.js');

        const simulator = await getTournamentById(confirmationData.simulatorId);
        if (!simulator || !simulator.bracket_data) return;

        const match = simulator.bracket_data.matches.find(m => m.id === confirmationData.matchId);
        if (!match || match.status === 'completed') return;

        const result = advanceWinner(simulator.bracket_data, confirmationData.matchId, confirmationData.winnerTeam);

        await updateTournament(confirmationData.simulatorId, { bracket_data: result.bracketData });

        const winnerMentions = confirmationData.winnerTeam.map(id => `<@${id}>`).join(', ');
        const loserMentions = confirmationData.loserTeam.map(id => `<@${id}>`).join(', ');

        const victoryMessage = confirmationData.isWO 
            ? `ok, vitória pro ${winnerMentions}. adversário não contestou. registrado`
            : `beleza, ${winnerMentions} ganhou. registrado, bye`;

        await channel.send(victoryMessage);
        
        try {
            const victoryEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`${emojis.trofeupixel} Partida Finalizada!`)
                .setDescription(`**Vencedor:** ${winnerMentions}\n\n**Perdedor:** ${loserMentions}`)
                .addFields(
                    { name: `${emojis.raiopixel} Status`, value: confirmationData.isWO ? `${emojis.alerta} W.O. - Adversário não compareceu` : `${emojis.positive} Vitória confirmada pelo adversário`, inline: false }
                )
                .setFooter({ text: `${emojis.friendship} Resultado registrado pela Kaori ♡` })
                .setTimestamp();
            
            await channel.send({ embeds: [victoryEmbed] });
        } catch (embedError) {
            console.error('Erro ao enviar embed de vitória:', embedError);
        }

        pendingConfirmations.delete(channel.id);
        messageWatchers.delete(channel.id);
        clearInactivityTimer(channel.id);

        const { checkRoundComplete } = require('../../handlers/buttonHandler');
        if (typeof checkRoundComplete === 'function') {
            await checkRoundComplete({ guild: channel.guild, channel }, simulator, result);
        }

    } catch (error) {
        console.error('Erro ao dar vitória pela Kaori:', error);
    }
}

async function handleKaoriMention(message, simulator, match) {
    if (!(await isAIEnabled(message.guildId))) return;
    const pending = pendingConfirmations.get(message.channel.id);
    const lowerContent = message.content.toLowerCase();
    const mentionsKaori = lowerContent.includes('kaori');
    
    if (detectMatchInProgress(lowerContent)) {
        pauseKaoriForChannel(message.channel.id, 5 * 60 * 1000);
        await message.reply('ok, ainda jogando. avisa quando acabar');
        return;
    }

    if (pending) {
        const autoConfirmation = checkMessageForAutoConfirmation(message, message.channel.id);
        if (autoConfirmation === 'confirmed') {
            await giveVictoryByKaori(message.channel, pending);
            return;
        } else if (autoConfirmation === 'denied') {
            await message.reply('Resultado contestado. O criador do torneio precisará decidir o vencedor.');
            pendingConfirmations.delete(message.channel.id);
            messageWatchers.delete(message.channel.id);
            return;
        }
        
        const keywordConfirmation = detectConfirmation(message, pending);

        if (keywordConfirmation === 'confirmed') {
            await giveVictoryByKaori(message.channel, pending);
            return;
        } else if (keywordConfirmation === 'denied') {
            await message.reply('Resultado contestado. O criador do torneio precisará decidir o vencedor.');
            pendingConfirmations.delete(message.channel.id);
            messageWatchers.delete(message.channel.id);
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
                messageWatchers.delete(message.channel.id);
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
    try {
        if (!channel || !channel.id) return;
        if (!(await isAIEnabled(channel.guildId))) return;
        
        if (isKaoriPausedForChannel(channel.id)) return;
        
        const fetchedChannel = await channel.client.channels.fetch(channel.id).catch(() => null);
        if (!fetchedChannel) {
            console.log(`[Kaori] Canal ${channel.id} não existe mais, ignorando`);
            clearInactivityTimer(channel.id);
            return;
        }
        
        await fetchedChannel.send(`mediador sumiu faz tempo. acabou a partida?\n\ndigam "ganhei" ou "venci" que eu registro`);
    } catch (error) {
        if (error.code === 10003) {
            console.log(`[Kaori] Canal não encontrado (10003), limpando timer`);
            clearInactivityTimer(channel.id);
        } else {
            console.error('Erro ao enviar mensagem de inatividade:', error);
        }
    }
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
           name.includes('final') ||
           name.includes('oitavas') ||
           name.includes('match') ||
           name.includes('partida');
}

const GENERAL_CHAT_PERSONALITY = `Você é a Kaori, uma assistente de torneios do Discord. Você é IRÔNICA, SARCÁSTICA e DIRETA.

Características:
- Seja irônica e sarcástica
- Respostas curtas e secas
- NUNCA seja amigável ou fofa
- Não use "amg", "gente", emojis de coração ou palavras carinhosas
- Máximo 1-2 frases
- Você pode responder sobre qualquer assunto, mas com desinteresse

Se perguntarem sobre você:
- Seu nome é Kaori
- Você medeia partidas de torneios
- Não gosta de papo furado`;

const GENERAL_OFFLINE_RESPONSES = [
    'fala.',
    'o que foi?',
    'diz aí'
];

async function handleGeneralChat(message) {
    const userMessage = message.content.replace(/<@!?\d+>/g, '').trim();

    if (!userMessage) {
        await message.reply('fala.');
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
        await message.reply('deu erro. tenta de novo');
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
    detectMatchInProgress,
    checkMessageForAutoConfirmation,
    pauseKaoriForChannel,
    isKaoriPausedForChannel,
    giveVictoryByKaori,
    normalizeTeamArray,
    pendingConfirmations,
    messageWatchers
};