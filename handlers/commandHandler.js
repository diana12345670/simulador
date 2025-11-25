// commandHandler.js - Carrega e gerencia comandos slash
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

/**
 * Carrega todos os comandos da pasta commands/
 * @param {Client} client - Cliente do Discord
 */
function loadCommands(client) {
    client.commands = new Collection();

    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`✅ Comando carregado: ${command.data.name}`);
        } else {
            console.log(`⚠️ Comando em ${file} está faltando "data" ou "execute"`);
        }
    }

    console.log(`📦 Total de comandos carregados: ${client.commands.size}`);
}

module.exports = { loadCommands };
