# 🚀 Instruções de Configuração Completa

## ✅ Status Atual
Seu bot Discord de torneios está instalado e pronto para ser configurado!

## 📋 Passos Necessários

### 1. Registrar os Comandos Slash

Antes de usar o bot, você precisa registrar os comandos slash com o Discord. No terminal do Replit, execute:

```bash
npm run deploy
```

Você verá uma mensagem confirmando que os 11 comandos foram registrados com sucesso.

### 2. Convide o Bot para seu Servidor Discord

Use este link (substitua `SEU_APPLICATION_ID` pelo APPLICATION_ID que você configurou):

```
https://discord.com/api/oauth2/authorize?client_id=SEU_APPLICATION_ID&permissions=8&scope=bot%20applications.commands
```

### 3. (OPCIONAL) Habilitar Intent Privilegiado

Para funcionalidades avançadas que requerem acesso aos membros do servidor, habilite o intent no Discord Developer Portal:

1. Acesse: https://discord.com/developers/applications
2. Selecione sua aplicação
3. Vá em **Bot** > **Privileged Gateway Intents**
4. Habilite: **SERVER MEMBERS INTENT**
5. Salve as alterações
6. Reinicie o bot no Replit

**Nota**: O bot funciona sem este intent, mas algumas funcionalidades podem ser limitadas.

## 🎮 Como Usar

### Configuração Inicial no Servidor

1. **Configure o cargo de criadores**:
   ```
   /setup cargo:@NomeDoCargoAqui
   ```
   Apenas membros com este cargo poderão criar torneios.

### Criando Torneios

2. **Crie um torneio** (exemplo 1v1):
   ```
   /simulador1v1 jogo:Fortnite versao:Chapter 5 modo:Zero Build quantidade:8 premio:$100
   ```

3. **Jogadores se inscrevem**:
   - Um canal será criado automaticamente
   - Jogadores clicam em "Entrar" para participar
   - Quando lotar ou após 6 minutos, o torneio inicia ou cancela

### Durante o Torneio

4. **O criador declara vencedores**:
   - Canais de partida são criados automaticamente
   - Clique em "Vencedor Time 1" ou "Vencedor Time 2"
   - Use "W.O." se alguém não aparecer

### Comandos Administrativos

- **Banir usuário**: `/banir_simu usuario:@Username`
- **Desbugar torneio**: `/desbugar` (no canal do torneio)
- **Ver ranking**: `/rank_simu tipo:local` ou `tipo:global`

## 🔧 Comandos do Dono do Bot

Apenas você (OWNER_ID) pode usar:
- `/sair_server server_id:123456789`
- `/banir_server server_id:123456789`
- `/servidores` - Lista todos servidores

## Sistema de Pontos

- **+10 pontos** <:moedapixel:1442668030932029461> por vitória em partida
- **+1 ponto** <:trofeupixel:1442668024891969588> por vencer torneio
- **Ranking Global**: apenas servidores com 200+ membros
- **Ranking Local**: todos os servidores

## 🎨 Características

- ✅ Todos os embeds em vermelho (#FF0000)
- ✅ Emojis personalizados integrados
- ✅ Ícone do servidor em todos os embeds
- ✅ Brackets automáticos
- ✅ Timeout de 6 minutos
- ✅ Sistema de W.O. (walkover)

## ⚠️ Solução de Problemas

### Bot não responde aos comandos
1. Certifique-se de executar `npm run deploy` primeiro
2. Verifique se o bot tem permissões adequadas no servidor
3. Reinicie o bot no Replit

### Simulador travou
Use `/desbugar` no canal do simulador ou com o ID:
```
/desbugar id:sim-123456789
```

### Comandos não aparecem
- Execute `npm run deploy` novamente
- Aguarde alguns minutos (pode demorar até 1 hora em alguns casos)
- Verifique se o APPLICATION_ID está correto

## 🎯 Próximos Passos

1. Execute `npm run deploy` para registrar os comandos
2. Convide o bot para seu servidor
3. Use `/setup` para configurar
4. Crie seu primeiro torneio!

---

**Precisa de ajuda?** Verifique os logs no console do Replit ou revise o README.md
