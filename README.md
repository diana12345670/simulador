# 🏆 Discord Tournament Bot

Bot completo de torneios para Discord com sistema de brackets, rankings e gerenciamento automático de partidas.

## 📋 Recursos

### 🎮 Sistema de Torneios
- **4 modos de jogo**: 1v1, 2v2, 3v3, 4v4
- **Validação automática** de quantidade de jogadores
- **Brackets automáticos** com eliminação simples
- **Timeout de 6 minutos** para cancelamento automático
- **Sistema de W.O.** (walkover) para partidas

### 🎯 Gerenciamento
- Configuração de **cargo** para criadores de torneios
- **Banimento** de usuários por servidor
- Sistema de **debugging** para limpar torneios travados
- Canais exclusivos criados automaticamente

### 🏅 Rankings
- **Ranking Local** por servidor
- **Ranking Global** (apenas servidores com 200+ membros)
- Sistema de pontos: +10 por vitória, +100 por torneio vencido

### 👑 Comandos do Dono
- Sair de servidores
- Banir servidores
- Listar todos servidores com detalhes

## 🚀 Configuração no Replit

### 1. Configure as Variáveis de Ambiente

Clique no ícone de "Secrets" (cadeado) no painel esquerdo e adicione:

```
BOT_TOKEN=seu_token_do_bot_aqui
OWNER_ID=seu_user_id_do_discord
APPLICATION_ID=application_id_do_bot
```

**Como obter esses valores:**

1. Acesse [Discord Developer Portal](https://discord.com/developers/applications)
2. Crie uma nova aplicação ou selecione uma existente
3. Vá em "Bot" e copie o **TOKEN** (BOT_TOKEN)
4. Vá em "General Information" e copie o **APPLICATION ID**
5. Seu **OWNER_ID** é seu ID de usuário do Discord (ative o modo desenvolvedor e clique com botão direito em seu perfil)

### 2. Convide o Bot para seu Servidor

Use este link (substitua APPLICATION_ID):
```
https://discord.com/api/oauth2/authorize?client_id=APPLICATION_ID&permissions=8&scope=bot%20applications.commands
```

### 3. Registre os Comandos Slash

Execute uma vez:
```bash
npm run deploy
```

### 4. Inicie o Bot

O bot já está configurado para iniciar automaticamente no Replit. Ou execute:
```bash
npm start
```

## 📝 Comandos Disponíveis

### Comandos Gerais

| Comando | Descrição | Permissões |
|---------|-----------|------------|
| `/setup` | Configura cargo de criador de torneios | Administrador |
| `/simulador1v1` | Cria torneio 1v1 | Cargo configurado |
| `/simulador2v2` | Cria torneio 2v2 | Cargo configurado |
| `/simulador3v3` | Cria torneio 3v3 | Cargo configurado |
| `/simulador4v4` | Cria torneio 4v4 | Cargo configurado |
| `/desbugar` | Remove torneio travado | Criador/Dono |
| `/banir_simu` | Bane usuário de torneios | Administrador |
| `/rank_simu` | Mostra ranking local ou global | Todos |

### Comandos do Dono

| Comando | Descrição |
|---------|-----------|
| `/sair_server` | Bot sai de um servidor |
| `/banir_server` | Bane servidor de usar o bot |
| `/servidores` | Lista todos servidores |

## 🎨 Características Visuais

- ✅ Todos os embeds em **vermelho** (#FF0000)
- ✅ Emojis padronizados: `:trofeu:` `:coroa:` `:fogo:` `:espadas:` etc
- ✅ Ícone/banner do servidor em todos os embeds
- ✅ Botões estilizados (primários e secundários)

## 🔧 Estrutura do Projeto

```
discord-tournament-bot/
├── commands/          # Comandos slash
├── events/            # Eventos do Discord
├── handlers/          # Gerenciadores de comando e botão
├── systems/
│   └── tournament/    # Sistema de brackets e torneios
├── utils/             # Utilitários (JSON DB, embeds)
├── data/              # Armazenamento JSON
│   └── rank_local/    # Rankings locais por servidor
├── index.js           # Arquivo principal
├── deploy-commands.js # Registro de comandos
└── package.json       # Dependências
```

## Sistema de Pontuação

- **+10 pontos** <:moedapixel:1442668030932029461> por vitória em partida
- **+1 ponto** <:trofeupixel:1442668024891969588> por vencer um torneio
- **Ranking Global**: apenas servidores com 200+ membros contribuem
- **Ranking Local**: todos os servidores têm ranking próprio

## ⚙️ Validações de Quantidade

### 1v1
- Aceita: 4, 8, 16, 32, 64 jogadores

### 2v2
- Aceita: 4, 8, 16, 32, 64 jogadores (divisível por 2)

### 3v3
- Aceita: 6, 12, 24, 48, 96 jogadores (divisível por 3)

### 4v4
- Aceita: 8, 16, 32, 64 jogadores (divisível por 4)

## 🎮 Fluxo de Torneio

1. **Criação**: Criador usa `/simuladorXvX` com parâmetros
2. **Inscrição**: Jogadores clicam em "Entrar" (6 minutos para lotar)
3. **Início**: Ao lotar, categoria e canais de partida são criados
4. **Partidas**: Criador declara vencedores ou W.O.
5. **Avanço**: Vencedores avançam automaticamente
6. **Final**: Campeão declarado, ranking atualizado, canais apagados

## 🛠️ Tecnologias

- **Node.js** v20
- **discord.js** v14
- **dotenv** para variáveis de ambiente
- **Sistema de persistência JSON**

## 📄 Licença

MIT

## 🆘 Suporte

Em caso de dúvidas ou problemas:
1. Verifique se as variáveis de ambiente estão corretas
2. Execute `npm run deploy` para registrar os comandos
3. Verifique os logs do console para erros
4. Use `/desbugar` para limpar torneios travados

---

**Desenvolvido com ❤️ para comunidades de gaming no Discord**
