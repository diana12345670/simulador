// deploy-commands.js - Registra comandos slash na API do Discord
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

// IDs padrão configurados
const DEFAULT_APPLICATION_ID = '1442258129491329105';
const DEFAULT_OWNER_ID = '1339336477661724674';

// Verifica variáveis de ambiente
if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN não encontrado no arquivo .env');
    process.exit(1);
}

// Usa APPLICATION_ID padrão se não estiver nas variáveis de ambiente
if (!process.env.APPLICATION_ID) {
    process.env.APPLICATION_ID = DEFAULT_APPLICATION_ID;
    console.log('✅ Usando APPLICATION_ID padrão:', DEFAULT_APPLICATION_ID);
}

if (!process.env.OWNER_ID) {
    process.env.OWNER_ID = DEFAULT_OWNER_ID;
}

const commands = [];

// Lê todos os comandos da pasta commands/
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('📦 Carregando comandos...');

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ ${command.data.name}`);
    } else {
        console.log(`⚠️ ${file} está faltando "data" ou "execute"`);
    }
}

console.log(`\n📊 Total de comandos: ${commands.length}\n`);

// Cria instância REST
const rest = new REST().setToken(process.env.BOT_TOKEN);

// Registra comandos
(async () => {
    try {
        console.log('🔄 Registrando comandos slash na API do Discord...');

        const data = await rest.put(
            Routes.applicationCommands(process.env.APPLICATION_ID),
            { body: commands }
        );

        console.log(`✅ ${data.length} comandos registrados com sucesso!`);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Deploy de comandos concluído!');
        console.log('💡 Agora você pode iniciar o bot com: node index.js');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
        process.exit(1);
    }
})();
