// guildDelete.js - Evento quando o bot sai de um servidor
module.exports = {
    name: 'guildDelete',
    execute(guild) {
        console.log(`➖ Bot removido do servidor: ${guild.name} (ID: ${guild.id})`);
    }
};
