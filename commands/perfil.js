const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPlayer, getRankGlobal, getShopCatalog } = require('../utils/database');
const { createErrorEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Ver o perfil de um jogador')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário para ver o perfil (deixe vazio para ver o seu)')
                .setRequired(false)),
    
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        const targetUser = interaction.options.getUser('usuario') || interaction.user;
        
        await interaction.deferReply();
        
        try {
            const player = await getPlayer(targetUser.id);
            const catalog = getShopCatalog();
            const top10 = await getRankGlobal(10);
            
            const rankPosition = top10.findIndex(p => p.user_id === targetUser.id) + 1;
            
            let equippedBannerData = null;
            if (player.equippedBanner) {
                equippedBannerData = catalog.banners.find(b => b.id === player.equippedBanner);
            }
            
            let equippedTitleData = null;
            if (player.equippedTitle) {
                equippedTitleData = catalog.titles.find(t => t.id === player.equippedTitle);
            }
            
            const embedColor = equippedBannerData ? parseInt(equippedBannerData.color.replace('#', ''), 16) : 0xFF0000;
            
            const displayName = targetUser.displayName || targetUser.username;
            const titleDisplay = equippedTitleData ? equippedTitleData.display : (player.totalWins >= 1 ? '◇ Novato ◇' : '');
            
            const winRate = calculateWinRate(player.totalWins, player.totalLosses);
            const totalGames = (player.totalWins || 0) + (player.totalLosses || 0);
            
            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setAuthor({ 
                    name: displayName, 
                    iconURL: targetUser.displayAvatarURL({ dynamic: true })
                })
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }));
            
            if (titleDisplay) {
                embed.setDescription(`**${titleDisplay}**`);
            }
            
            const statsValue = [
                `\`${(player.coins || 0).toLocaleString('pt-BR')}\` moedas`,
                `\`${player.totalWins || 0}\` vitórias · \`${player.totalLosses || 0}\` derrotas`,
                `\`${winRate}%\` taxa de vitória`
            ].join('\n');
            
            embed.addFields({ 
                name: 'Estatísticas', 
                value: statsValue, 
                inline: true 
            });
            
            const progressValue = [
                `Sequência: \`${player.currentStreak || 0}\``,
                `Recorde: \`${player.bestStreak || 0}\``,
                `vs Top 10: \`${player.winsVsTop10 || 0}\``
            ].join('\n');
            
            embed.addFields({ 
                name: 'Progresso', 
                value: progressValue, 
                inline: true 
            });
            
            if (rankPosition > 0) {
                embed.addFields({ 
                    name: 'Ranking', 
                    value: `#${rankPosition} Global`, 
                    inline: true 
                });
            }
            
            const bannersCount = (player.bannersOwned || []).length;
            const titlesCount = (player.titlesOwned || []).length;
            
            const footerParts = [];
            if (bannersCount > 0 || titlesCount > 0) {
                footerParts.push(`${bannersCount} banners · ${titlesCount} títulos`);
            }
            if (equippedBannerData) {
                footerParts.push(`Banner: ${equippedBannerData.name}`);
            }
            
            if (footerParts.length > 0) {
                embed.setFooter({ text: footerParts.join(' | ') });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Erro ao buscar perfil:', error);
            await interaction.editReply({
                embeds: [createErrorEmbed(`${emojis.negative} Erro ao carregar perfil.`, interaction.client)]
            });
        }
    }
};

function calculateWinRate(wins, losses) {
    const total = (wins || 0) + (losses || 0);
    if (total === 0) return 0;
    return Math.round(((wins || 0) / total) * 100);
}
