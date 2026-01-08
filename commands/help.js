// help.js - Comando de ajuda multilíngue
const { SlashCommandBuilder } = require('discord.js');
const { createRedEmbed } = require('../utils/embeds');
const { getGuildLanguage } = require('../utils/lang');
const { t, getHelpCommands } = require('../utils/i18n');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra os comandos principais do bot'),

    async execute(interaction) {
        const lang = await getGuildLanguage(interaction.guildId);
        const emojis = getEmojis(interaction.client);
        const commands = getHelpCommands(lang);

        const fields = Object.entries(commands).map(([cmd, desc]) => ({
            name: `/${cmd}`,
            value: desc,
            inline: false
        }));

        await interaction.reply({
            embeds: [createRedEmbed({
                title: `${emojis.ajudapixel} ${t(lang, 'help_title')}`,
                description: t(lang, 'help_description'),
                fields: fields,
                footer: { text: t(lang, 'help_footer') },
                timestamp: true
            })]
        });
    }
};
