// jsonDB.js - Funções helper para ler/gravar arquivos JSON de forma segura
const fs = require('fs');
const path = require('path');

/**
 * Lê um arquivo JSON de forma segura
 * @param {string} filePath - Caminho do arquivo
 * @param {*} defaultValue - Valor padrão se arquivo não existir
 * @returns {*} Dados do JSON ou defaultValue
 */
function readJSON(filePath, defaultValue = {}) {
    try {
        // Garante que o diretório existe
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Se o arquivo não existe, retorna valor padrão
        if (!fs.existsSync(filePath)) {
            writeJSON(filePath, defaultValue);
            return defaultValue;
        }

        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Erro ao ler ${filePath}:`, error);
        return defaultValue;
    }
}

/**
 * Escreve dados em arquivo JSON de forma segura
 * @param {string} filePath - Caminho do arquivo
 * @param {*} data - Dados para escrever
 */
function writeJSON(filePath, data) {
    try {
        // Garante que o diretório existe
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Erro ao escrever ${filePath}:`, error);
    }
}

module.exports = { readJSON, writeJSON };
