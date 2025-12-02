const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { getPlayer, removeCoins, addItemToInventory, equipItem, getShopCatalog } = require('../utils/database');
const { createRedEmbed, createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getEmojis } = require('../utils/emojis');

const RARITY_COLORS = {
    comum: 0x9E9E9E,
    raro: 0x2196F3,
    epico: 0x9C27B0,
    lendario: 0xFF9800
};

const RARITY_EMOJIS = {
    comum: '⚪',
    raro: '🔵',
    epico: '🟣',
    lendario: '🟠'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loja')
        .setDescription('Acesse a loja do simulador')
        .addSubcommand(subcommand =>
            subcommand
                .setName('ver')
                .setDescription('Ver itens disponíveis na loja')
                .addStringOption(option =>
                    option.setName('categoria')
                        .setDescription('Categoria de itens')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Banners', value: 'banners' },
                            { name: 'Títulos', value: 'titles' },
                            { name: 'Cargos', value: 'roles' }
                        ))
                .addStringOption(option =>
                    option.setName('raridade')
                        .setDescription('Filtrar por raridade')
                        .setRequired(false)
                        .addChoices(
                            { name: '⚪ Comum', value: 'comum' },
                            { name: '🔵 Raro', value: 'raro' },
                            { name: '🟣 Épico', value: 'epico' },
                            { name: '🟠 Lendário', value: 'lendario' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('comprar')
                .setDescription('Comprar um item da loja')
                .addStringOption(option =>
                    option.setName('item_id')
                        .setDescription('ID do item para comprar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('equipar')
                .setDescription('Equipar um item que você possui')
                .addStringOption(option =>
                    option.setName('tipo')
                        .setDescription('Tipo do item')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Banner', value: 'banner' },
                            { name: 'Título', value: 'title' }
                        ))
                .addStringOption(option =>
                    option.setName('item_id')
                        .setDescription('ID do item para equipar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('inventario')
                .setDescription('Ver seus itens comprados')),
    
    async execute(interaction) {
        const emojis = getEmojis(interaction.client);
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'ver') {
            await handleShopView(interaction, emojis);
        } else if (subcommand === 'comprar') {
            await handlePurchase(interaction, emojis);
        } else if (subcommand === 'equipar') {
            await handleEquip(interaction, emojis);
        } else if (subcommand === 'inventario') {
            await handleInventory(interaction, emojis);
        }
    }
};

async function handleShopView(interaction, emojis) {
    const categoria = interaction.options.getString('categoria');
    const raridade = interaction.options.getString('raridade');
    const catalog = getShopCatalog();
    const player = await getPlayer(interaction.user.id);
    
    let items = [];
    let categoryName = 'Todos os Itens';
    
    if (categoria === 'banners' || !categoria) {
        items = items.concat(catalog.banners.map(b => ({ ...b, type: 'banner', typeLabel: '🖼️ Banner' })));
        if (categoria === 'banners') categoryName = '🖼️ Banners';
    }
    if (categoria === 'titles' || !categoria) {
        items = items.concat(catalog.titles.map(t => ({ ...t, type: 'title', typeLabel: '🏷️ Título' })));
        if (categoria === 'titles') categoryName = '🏷️ Títulos';
    }
    if (categoria === 'roles' || !categoria) {
        items = items.concat(catalog.roles.map(r => ({ ...r, type: 'role', typeLabel: '👑 Cargo' })));
        if (categoria === 'roles') categoryName = '👑 Cargos';
    }
    
    if (raridade) {
        items = items.filter(item => item.rarity === raridade);
        categoryName += ` (${RARITY_EMOJIS[raridade]} ${raridade.charAt(0).toUpperCase() + raridade.slice(1)})`;
    }
    
    items.sort((a, b) => a.price - b.price);
    
    const itemsPerPage = 5;
    const pages = [];
    
    for (let i = 0; i < items.length; i += itemsPerPage) {
        const pageItems = items.slice(i, i + itemsPerPage);
        let description = `**Suas moedas:** 🪙 ${player.coins || 0}\n\n`;
        
        for (const item of pageItems) {
            const owned = checkOwnership(player, item);
            const ownershipBadge = owned ? '✅ Possuído' : '';
            description += `${RARITY_EMOJIS[item.rarity]} **${item.name}** ${ownershipBadge}\n`;
            description += `${item.typeLabel} | 🪙 ${item.price}\n`;
            description += `*${item.description}*\n`;
            description += `\`ID: ${item.id}\`\n\n`;
        }
        
        pages.push(description);
    }
    
    if (pages.length === 0) {
        return interaction.reply({
            embeds: [createRedEmbed({
                title: `${emojis.fogo} Loja`,
                description: 'Nenhum item encontrado com esses filtros.',
                timestamp: true
            })],
            flags: MessageFlags.Ephemeral
        });
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`${emojis.fogo} Loja - ${categoryName}`)
        .setDescription(pages[0])
        .setColor(0xDC143C)
        .setFooter({ text: `Página 1/${pages.length} | Use /loja comprar <id> para comprar` })
        .setTimestamp();
    
    const components = [];
    if (pages.length > 1) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('shop_prev')
                    .setLabel('◀️ Anterior')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('shop_next')
                    .setLabel('Próximo ▶️')
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(row);
    }
    
    const reply = await interaction.reply({
        embeds: [embed],
        components,
        flags: MessageFlags.Ephemeral,
        fetchReply: true
    });
    
    if (pages.length > 1) {
        let currentPage = 0;
        const collector = reply.createMessageComponentCollector({ time: 120000 });
        
        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Este menu não é para você.', flags: MessageFlags.Ephemeral });
            }
            
            if (i.customId === 'shop_next') {
                currentPage = Math.min(currentPage + 1, pages.length - 1);
            } else if (i.customId === 'shop_prev') {
                currentPage = Math.max(currentPage - 1, 0);
            }
            
            embed.setDescription(pages[currentPage]);
            embed.setFooter({ text: `Página ${currentPage + 1}/${pages.length} | Use /loja comprar <id> para comprar` });
            
            const newRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('shop_prev')
                        .setLabel('◀️ Anterior')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('shop_next')
                        .setLabel('Próximo ▶️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === pages.length - 1)
                );
            
            await i.update({ embeds: [embed], components: [newRow] });
        });
        
        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => {});
        });
    }
}

async function handlePurchase(interaction, emojis) {
    const itemId = interaction.options.getString('item_id');
    const catalog = getShopCatalog();
    const player = await getPlayer(interaction.user.id);
    
    let item = null;
    let itemType = null;
    
    item = catalog.banners.find(b => b.id === itemId);
    if (item) itemType = 'banner';
    
    if (!item) {
        item = catalog.titles.find(t => t.id === itemId);
        if (item) itemType = 'title';
    }
    
    if (!item) {
        item = catalog.roles.find(r => r.id === itemId);
        if (item) itemType = 'role';
    }
    
    if (!item) {
        return interaction.reply({
            embeds: [createErrorEmbed(`${emojis.negative} Item não encontrado! Verifique o ID do item.`, interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (checkOwnership(player, { ...item, type: itemType })) {
        return interaction.reply({
            embeds: [createErrorEmbed(`${emojis.negative} Você já possui este item!`, interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }
    
    if ((player.coins || 0) < item.price) {
        return interaction.reply({
            embeds: [createErrorEmbed(`${emojis.negative} Moedas insuficientes! Você tem 🪙 ${player.coins || 0} mas precisa de 🪙 ${item.price}.`, interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }
    
    const success = await removeCoins(interaction.user.id, item.price);
    if (!success) {
        return interaction.reply({
            embeds: [createErrorEmbed(`${emojis.negative} Erro ao processar compra. Tente novamente.`, interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }
    
    await addItemToInventory(interaction.user.id, itemType, itemId);
    
    const typeLabel = itemType === 'banner' ? '🖼️ Banner' : itemType === 'title' ? '🏷️ Título' : '👑 Cargo';
    
    await interaction.reply({
        embeds: [createRedEmbed({
            title: `${emojis.positive} Compra Realizada!`,
            description: `Você comprou **${item.name}**!\n\n` +
                `**Tipo:** ${typeLabel}\n` +
                `**Raridade:** ${RARITY_EMOJIS[item.rarity]} ${item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}\n` +
                `**Preço pago:** 🪙 ${item.price}\n\n` +
                `Use \`/loja equipar\` para equipar seu novo item!`,
            color: RARITY_COLORS[item.rarity],
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });
}

async function handleEquip(interaction, emojis) {
    const tipo = interaction.options.getString('tipo');
    const itemId = interaction.options.getString('item_id');
    const catalog = getShopCatalog();
    
    let item = null;
    if (tipo === 'banner') {
        item = catalog.banners.find(b => b.id === itemId);
    } else if (tipo === 'title') {
        item = catalog.titles.find(t => t.id === itemId);
    }
    
    if (!item) {
        return interaction.reply({
            embeds: [createErrorEmbed(`${emojis.negative} Item não encontrado!`, interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }
    
    const success = await equipItem(interaction.user.id, tipo, itemId);
    
    if (!success) {
        return interaction.reply({
            embeds: [createErrorEmbed(`${emojis.negative} Você não possui este item! Compre-o primeiro na loja.`, interaction.client)],
            flags: MessageFlags.Ephemeral
        });
    }
    
    const typeLabel = tipo === 'banner' ? '🖼️ Banner' : '🏷️ Título';
    
    await interaction.reply({
        embeds: [createRedEmbed({
            title: `${emojis.positive} Item Equipado!`,
            description: `Você equipou **${item.name}**!\n\n` +
                `**Tipo:** ${typeLabel}\n` +
                `**Raridade:** ${RARITY_EMOJIS[item.rarity]} ${item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}\n\n` +
                `Use \`/perfil\` para ver seu perfil atualizado!`,
            color: RARITY_COLORS[item.rarity],
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });
}

async function handleInventory(interaction, emojis) {
    const player = await getPlayer(interaction.user.id);
    const catalog = getShopCatalog();
    
    let description = `**Suas moedas:** 🪙 ${player.coins || 0}\n\n`;
    
    description += '**🖼️ Banners:**\n';
    if ((player.bannersOwned || []).length > 0) {
        for (const bannerId of player.bannersOwned) {
            const banner = catalog.banners.find(b => b.id === bannerId);
            if (banner) {
                const equipped = player.equippedBanner === bannerId ? ' ✅ Equipado' : '';
                description += `${RARITY_EMOJIS[banner.rarity]} ${banner.name}${equipped}\n`;
            }
        }
    } else {
        description += '*Nenhum banner*\n';
    }
    
    description += '\n**🏷️ Títulos:**\n';
    if ((player.titlesOwned || []).length > 0) {
        for (const titleId of player.titlesOwned) {
            const title = catalog.titles.find(t => t.id === titleId);
            if (title) {
                const equipped = player.equippedTitle === titleId ? ' ✅ Equipado' : '';
                description += `${RARITY_EMOJIS[title.rarity]} ${title.name}${equipped}\n`;
            }
        }
    } else {
        description += '*Nenhum título*\n';
    }
    
    description += '\n**👑 Cargos:**\n';
    if ((player.rolesOwned || []).length > 0) {
        for (const roleId of player.rolesOwned) {
            const role = catalog.roles.find(r => r.id === roleId);
            if (role) {
                description += `${RARITY_EMOJIS[role.rarity]} ${role.name}\n`;
            }
        }
    } else {
        description += '*Nenhum cargo*\n';
    }
    
    await interaction.reply({
        embeds: [createRedEmbed({
            title: `${emojis.fogo} Seu Inventário`,
            description,
            timestamp: true
        })],
        flags: MessageFlags.Ephemeral
    });
}

function checkOwnership(player, item) {
    if (item.type === 'banner') {
        return (player.bannersOwned || []).includes(item.id);
    } else if (item.type === 'title') {
        return (player.titlesOwned || []).includes(item.id);
    } else if (item.type === 'role') {
        return (player.rolesOwned || []).includes(item.id);
    }
    return false;
}
