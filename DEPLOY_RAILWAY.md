# 🚂 Guia de Deploy no Railway

Este guia mostra como fazer o deploy do seu bot Discord no Railway.

## 📋 Pré-requisitos

1. Conta no [GitHub](https://github.com)
2. Conta no [Railway](https://railway.app) (pode usar login do GitHub)
3. Bot do Discord criado no [Discord Developer Portal](https://discord.com/developers/applications)

## 🔧 Passos para Deploy

### 1. Preparar o Repositório

1. Crie um repositório no GitHub
2. Faça push do código do bot (pasta `simulador`):
```bash
cd simulador
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

### 2. Configurar no Railway

1. Acesse [railway.app](https://railway.app) e faça login
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Escolha seu repositório do GitHub
5. Railway detecta automaticamente o Node.js

### 3. Adicionar Variáveis de Ambiente

Na aba **Variables**, adicione as seguintes variáveis:

| Variável | Descrição |
|----------|-----------|
| `BOT_TOKEN` | Token do seu bot Discord |
| `APPLICATION_ID` | ID da aplicação Discord |
| `OWNER_ID` | Seu ID de usuário Discord |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | URL do PostgreSQL (Railway pode provisionar um) |
| `OPENAI_API_KEY` | Chave da API da OpenAI (opcional, para IA Kaori) |

### 4. Adicionar Banco de Dados (Opcional)

1. No seu projeto Railway, clique em **"+ New"**
2. Selecione **"Database"** > **"Add PostgreSQL"**
3. Railway configura automaticamente a variável `DATABASE_URL`

### 5. Deploy

O Railway faz deploy automaticamente após configurar. Acompanhe na aba **Deployments**.

## 📊 Endpoints Disponíveis

Após o deploy, você terá acesso a:

- `/` - Dashboard com estatísticas do bot
- `/ping` - Health check (retorna "pong")
- `/health` - Health check detalhado
- `/api/stats` - API JSON com estatísticas

## 🔗 Obter URL Pública

1. Vá em **Settings** > **Networking**
2. Clique em **"Generate Domain"**
3. Use esta URL para monitoramento (Uptime Robot, etc.)

## 🏓 Configurar Uptime Robot (Recomendado)

Para manter o bot sempre ativo:

1. Acesse [uptimerobot.com](https://uptimerobot.com)
2. Crie uma conta gratuita
3. Adicione um novo monitor:
   - **Monitor Type**: HTTP(s)
   - **URL**: `https://SEU_APP.up.railway.app/ping`
   - **Interval**: 5 minutos

## 💰 Custos

- Railway oferece $5/mês de crédito gratuito
- Bots pequenos geralmente ficam dentro do limite gratuito
- Após o limite: ~$5-10/mês dependendo do uso

## 🆙 Atualizar o Bot

1. Faça commit das mudanças:
```bash
git add .
git commit -m "Descrição das mudanças"
git push
```

2. Railway faz deploy automaticamente!

## 🐛 Troubleshooting

### Bot não conecta
- Verifique se o `BOT_TOKEN` está correto
- Confirme que os intents estão habilitados no Discord Developer Portal

### Build falha
- Verifique os logs na aba Deployments
- Certifique-se que o `package.json` está correto

### Banco de dados não conecta
- Verifique se `DATABASE_URL` está configurado
- Se criou o PostgreSQL no Railway, a variável é configurada automaticamente

---

**Pronto!** Seu bot está rodando 24/7 no Railway! 🎉
