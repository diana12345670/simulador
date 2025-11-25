# 🚀 Guia de Deploy no Render

Este guia mostra como fazer o deploy do seu bot Discord no Render.com gratuitamente.

## 📋 Pré-requisitos

1. Conta no [GitHub](https://github.com)
2. Conta no [Render](https://render.com) (pode usar login do GitHub)
3. Bot do Discord criado no [Discord Developer Portal](https://discord.com/developers/applications)

## 🔧 Passos para Deploy

### 1. Preparar o Repositório

1. Crie um repositório no GitHub
2. Faça push do código do bot:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

### 2. Configurar no Render

1. Acesse [render.com](https://render.com) e faça login
2. Clique em **"New +"** > **"Web Service"**
3. Conecte seu repositório do GitHub
4. Configure o serviço:
   - **Name**: `discord-tournament-bot` (ou qualquer nome)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

### 3. Adicionar Variáveis de Ambiente

Na seção **Environment**, adicione as seguintes variáveis:

- `BOT_TOKEN` - Token do seu bot Discord
- `APPLICATION_ID` - ID da aplicação Discord
- `OWNER_ID` - Seu ID de usuário Discord
- `NODE_ENV` - `production`

**Importante:** Nunca compartilhe ou commite esses valores!

### 4. Deploy

1. Clique em **"Create Web Service"**
2. Aguarde o build e deploy (pode levar alguns minutos)
3. O bot estará online quando o deploy terminar

## 🏓 Configurar Uptime Robot

Após o deploy, você pode usar o Uptime Robot para manter o bot sempre online:

1. Acesse [uptimerobot.com](https://uptimerobot.com)
2. Crie uma conta gratuita
3. Adicione um novo monitor:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: Discord Bot
   - **URL**: `https://SEU_APP.onrender.com/ping`
   - **Monitoring Interval**: 5 minutos
4. Salve o monitor

O Uptime Robot vai fazer ping no seu bot a cada 5 minutos, mantendo ele ativo!

## 📊 Acessar o Dashboard

Após o deploy, você pode acessar o dashboard em:
```
https://SEU_APP.onrender.com
```

## 🔍 Endpoints Disponíveis

- `/` - Dashboard com estatísticas do bot
- `/ping` - Endpoint para Uptime Robot (retorna "pong")
- `/health` - Health check com detalhes do bot
- `/api/stats` - API JSON com estatísticas

## ⚠️ Limitações do Plano Free

O plano gratuito do Render tem algumas limitações:

- **Inatividade**: O serviço "dorme" após 15 minutos sem requisições
- **Solução**: Use o Uptime Robot para fazer ping a cada 5 minutos
- **Build minutes**: 500 minutos/mês compartilhados
- **Bandwidth**: 100 GB/mês

## 🆙 Atualizar o Bot

Para atualizar o bot após fazer mudanças:

1. Faça commit das mudanças:
```bash
git add .
git commit -m "Descrição das mudanças"
git push
```

2. O Render vai fazer o deploy automaticamente!

## 🐛 Troubleshooting

### Bot não conecta
- Verifique se o `BOT_TOKEN` está correto
- Confirme que os intents estão habilitados no Discord Developer Portal

### Health check falha
- Certifique-se que a porta está configurada como `5000`
- Verifique os logs no painel do Render

### Bot "dorme"
- Configure o Uptime Robot conforme descrito acima

## 📞 Suporte

Se tiver problemas:
1. Verifique os logs no painel do Render
2. Confirme que todas as variáveis de ambiente estão configuradas
3. Teste localmente primeiro com `npm start`

---

**Pronto!** Seu bot está rodando 24/7 no Render! 🎉
