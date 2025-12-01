// embeds.js - Utilitário para criar embeds padronizados
const { getEmojis } = require('./emojis');
const { EmbedBuilder } = require('discord.js');

function createEmbed(title, description, color = 0xFF0000, client = null) {
    const embed = {
        color: color,
        title: title,
        description: description,
        timestamp: new Date().toISOString()
    };

    // Armazena o client no embed para uso posterior
    if (client) {
        embed._client = client;
    }

    return embed;
}

function getEmbedEmojis(embed) {
    return getEmojis(embed._client);
}

// Helper para obter emojis de uma interação
function getInteractionEmojis(interaction) {
    return getEmojis(interaction.client);
}

// Cor vermelha padrão para todos os embeds
const RED_COLOR = 0xFF0000;

/**
 * Cria um embed vermelho padrão
 * @param {Object} options - Opções do embed
 * @returns {EmbedBuilder}
 */
function createRedEmbed(options = {}) {
    const embed = new EmbedBuilder()
        .setColor(RED_COLOR);

    if (options.title) embed.setTitle(options.title);
    if (options.description) embed.setDescription(options.description);
    if (options.footer) embed.setFooter(options.footer);
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);
    if (options.timestamp) embed.setTimestamp();
    if (options.fields) {
        options.fields.forEach(field => {
            embed.addFields(field);
        });
    }

    return embed;
}

/**
 * Cria um embed de erro
 * @param {string} message - Mensagem de erro
 * @param {Object} client - Cliente do Discord (opcional, para emojis dinâmicos)
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(message, client = null) {
    const emojis = client ? getEmojis(client) : { negative: '❌' };
    return createRedEmbed({
        title: `${emojis.negative} Erro`,
        description: message
    });
}

/**
 * Cria um embed de sucesso
 * @param {string} message - Mensagem de sucesso
 * @param {Object} client - Cliente do Discord (opcional, para emojis dinâmicos)
 * @returns {EmbedBuilder}
 */
function createSuccessEmbed(message, client = null) {
    const emojis = client ? getEmojis(client) : { positive: '✅' };
    return createRedEmbed({
        title: `${emojis.positive} Sucesso`,
        description: message
    });
}

module.exports = {
    createRedEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    RED_COLOR,
    createEmbed,
    getEmbedEmojis,
    getInteractionEmojis
};