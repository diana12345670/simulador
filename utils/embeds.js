// embeds.js - Helper para criar embeds padronizados vermelhos
const { EmbedBuilder } = require('discord.js');

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
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(message) {
    return createRedEmbed({
        title: '<:negative:1442668040465682643> Erro',
        description: message
    });
}

/**
 * Cria um embed de sucesso
 * @param {string} message - Mensagem de sucesso
 * @returns {EmbedBuilder}
 */
function createSuccessEmbed(message) {
    return createRedEmbed({
        title: '<:positive:1442668038691491943> Sucesso',
        description: message
    });
}

module.exports = {
    createRedEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    RED_COLOR
};
