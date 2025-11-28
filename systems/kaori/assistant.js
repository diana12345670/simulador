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

function detectVictoryClaim(message, match) {
    const content = message.content.toLowerCase();
    const authorId = message.author.id;

    const victoryWords = ['ganhei', 'venci', 'ganhamos', 'vencemos', 'vitoria', 'vitória', 'win', 'gg'];
    const woWords = ['wo', 'w.o', 'w.o.', 'sumiu', 'não apareceu', 'nao apareceu', 'fugiu', 'desistiu'];

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

function detectConfirmation(message, pendingData) {
    const content = message.content.toLowerCase();
    const authorId = message.author.id;

    if (!pendingData.loserTeam.includes(authorId)) return null;

    const confirmWords = ['sim', 'yes', 'confirmo', 'confirmado', 'ok', 'isso', 'verdade', 'ganharam', 'perdemos', 'perdi'];
    const denyWords = ['não', 'nao', 'mentira', 'errado', 'fake', 'falso'];

    const confirms = confirmWords.some(word => content.includes(word));
    const denies = denyWords.some(word => content.includes(word));

    if (confirms) return 'confirmed';
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
    if (pending) {
        const confirmation = detectConfirmation(message, pending);
        if (confirmation === 'confirmed') {
            await giveVictoryByKaori(message.channel, pending);
            return;
        } else if (confirmation === 'denied') {
            const embed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setDescription('O resultado foi contestado. O criador do torneio precisa decidir o vencedor.')
                .setFooter({ text: 'Kaori - Assistente de Torneios' });

            await message.reply({ embeds: [embed] });
            pendingConfirmations.delete(message.channel.id);
            return;
        }
    }

    const claim = detectVictoryClaim(message, match);
    if (claim) {
        await askForConfirmation(message.channel, claim, match, simulator);
        return;
    }

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
            const claim = {
                claimerId: message.author.id,
                claimerTeam: isTeam1 ? 1 : 2,
                winnerTeam: isTeam1 ? match.team1 : match.team2,
                loserTeam: isTeam1 ? match.team2 : match.team1,
                isWO: analysis.tipo === 'wo'
            };
            await askForConfirmation(message.channel, claim, match, simulator);
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