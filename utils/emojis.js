
// emojis.js - Sistema de emojis por bot

const bot1Emojis = {
    alerta: '<:alerta:1442668042873081866>',
    negative: '<:negative:1442668040465682643>',
    positive: '<:positive:1442668038691491943>',
    joiapixel: '<:joiapixel:1442668036090888274>',
    pergaminhopixel: '<:pergaminhopixel:1442668033242959963>',
    moedapixel: '<:moedapixel:1442668030932029461>',
    raiopixel: '<:raiopixel:1442668029065564341>',
    coroapixel: '<:coroapixel:1442668026813087836>',
    trofeupixel: '<:trofeupixel:1442668024891969588>',
    presentepixel: '<:presentepixel:1442667950313308332>',
    fogo: '<:fogo:1442667877332422847>',
    trofeu: '<:trofeu:1442667772097200168>'
};

const bot2Emojis = {
    alerta: '<:atencao:1445015352974250075>',
    negative: '<:negative:1445015440303849515>',
    positive: '<:positive:1445015497908162601>',
    joiapixel: '<:gema:1445015562995503206>',
    pergaminhopixel: '<:pergaminho:1445015608302370887>',
    moedapixel: '<:moeda:1445015655874166915>',
    raiopixel: '<:raio:1445015696479355021>',
    coroapixel: '<:coroa:1445015769682284655>',
    trofeupixel: '<:trofeu:1445015814116737185>',
    presentepixel: '<:presente:1445015884471996476>',
    fogo: '<:fogo:1445015887739490344>',
    trofeu: '<:trofeu:1445015814116737185>',
    coroavermelha: '<:coroavermelha:1445015890017124422>'
};

const bot3Emojis = {
    alerta: '<:Perigo:1460706171982970921>',
    negative: '<:Negative:1460706149803495508>',
    positive: '<:Positive:1460706147647356928>',
    joiapixel: '<:gema:1460706174214078567>',
    pergaminhopixel: '<:pergaminho:1460706170024235092>',
    moedapixel: '<:moeda:1460706167977152534>',
    raiopixel: '<:raio:1460706165959823383>',
    coroapixel: '<:coroa:1460706155721527328>',
    trofeupixel: '<:trofeu:1460706155721527328>',
    presentepixel: '<:presente:1460706161593684040>',
    fogo: '<:fogo:1460706164000948446>',
    trofeu: '<:trofeu:1460706155721527328>',
    estrela: '<:estrela:1460706152819195914>',
    friendship: '<:friendship:1460706159970357442>',
    workshop: '<:workshop:1460706157617217676>'
};

function getEmojis(client) {
    if (!client || !client.botConfig) {
        return bot1Emojis;
    }

    switch (client.botConfig.name) {
        case 'Bot 1':
            return bot1Emojis;
        case 'Bot 2':
            return bot2Emojis;
        case 'Bot 3':
            return bot3Emojis;
        default:
            return bot1Emojis;
    }
}

module.exports = {
    bot1Emojis,
    bot2Emojis,
    bot3Emojis,
    getEmojis
};
