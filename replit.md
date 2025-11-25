# Discord Tournament Bot

## Overview

A comprehensive Discord bot for managing competitive gaming tournaments with automated bracket generation, ranking systems, and match management. The bot supports multiple game modes (1v1, 2v2, 3v3, 4v4) with automatic player validation, timeout management, and walkover systems. Built with Node.js and discord.js v14, it uses file-based JSON storage for persistence and provides both local and global ranking systems.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Pattern
- **Modular Command System**: Commands are loaded dynamically from the `/commands` directory using Discord.js's slash command system
- **Event-Driven Architecture**: Bot events (ready, guildCreate, interactionCreate) are separated into individual handlers in `/events`
- **File-Based Persistence**: JSON files in `/data` directory serve as a simple database (no external database required)
- **Tournament State Machine**: Tournaments progress through states: `open` → `started` → `finished` / `cancelled`

### Project Structure
```
/commands        - Slash command definitions (setup, simulador*, rank, admin commands)
/events          - Discord event handlers (ready, interactionCreate, guildCreate/Delete)
/handlers        - Business logic handlers (commandHandler, buttonHandler)
/systems/tournament - Tournament-specific logic (manager, bracket generation)
/utils           - Shared utilities (embeds, jsonDB)
/data            - JSON persistence layer
```

### Authentication & Authorization
- **Role-Based Tournament Creation**: Server administrators configure a role via `/setup` that grants permission to create tournaments
- **Owner-Only Commands**: Certain administrative commands (`/sair_server`, `/banir_server`, `/servidores`) check against `OWNER_ID` environment variable
- **Server Banning**: Bot maintains a banlist (`servers_banidos.json`) and automatically leaves banned servers
- **User Banning**: Per-server user bans stored in `bans.json` prevent participation in tournaments

### Tournament System Architecture

**Player Validation Logic**:
- Each game mode enforces specific player counts:
  - 1v1: 4, 8, 16, 32, 64 players
  - 2v2: 4, 8, 16, 32, 64 players (divisible by 2)
  - 3v3: 6, 12, 24, 48, 96 players (divisible by 3)
  - 4v4: 8, 16, 32, 64 players (divisible by 4)
- Validation occurs at command registration (via choices) and command execution

**Bracket Generation**:
- Single-elimination brackets generated automatically when tournament starts
- Players divided into teams based on mode
- Binary tree structure with `totalRounds = log2(teams)`
- Each match tracks: round number, team compositions, winner, status

**Match Management**:
- Interactive buttons for reporting wins, walkovers
- Match channels created dynamically within tournament category
- 6-minute timeout for automatic cancellation if insufficient players

**State Progression**:
1. **Open**: Tournament created, accepting players via join/leave buttons
2. **Started**: Bracket generated, matches begin
3. **Finished**: Winner determined, rankings updated
4. **Cancelled**: Timeout or manual cancellation

### Ranking System

**Dual Ranking Architecture**:
- **Local Rankings**: Per-server rankings stored in `/data/rank_local/{guildId}.json`
- **Global Rankings**: Cross-server rankings in `/data/rank_global.json` (only servers with 200+ members contribute)

**Point System**:
- Match victory: +10 points
- Tournament victory: +100 points
- Rankings sorted by total points, display top 10

### UI/UX Standards
- **All responses use embeds** with red color (#FF0000)
- **Emoji set restricted** to: `:trofeu:`, `:coroa:`, `:fogo:`, `:espadas:`, `:positive:`, `:negative:`, `:presente:`, `:xp:`, `:carregando:`, `:workshop:`, `:gemas:`
- **Button styling**: Primary actions use primary style, secondary actions use secondary (gray) style
- **Guild branding**: Embeds include server icon/banner when available

### Data Persistence Strategy

**File-Based JSON Storage**:
- `config.json`: Server-specific configuration (tournament creator roles)
- `simuladores.json`: Active tournament state
- `bans.json`: Per-server user bans
- `rank_global.json`: Global player rankings
- `rank_local/{guildId}.json`: Server-specific player rankings
- `servers_banidos.json`: Banned servers list

**Safe Read/Write Operations**:
- `jsonDB.js` utilities ensure directory creation before writes
- Default values returned for missing files
- Error handling prevents data corruption

### Error Handling & Resilience
- Global unhandled rejection handler in `index.js`
- Try-catch blocks in all command executions
- Graceful degradation for missing permissions
- Cleanup mechanisms for stuck tournaments (`/desbugar` command)

## External Dependencies

### Discord Integration
- **discord.js v14**: Core Discord API wrapper
  - Uses slash commands (application commands)
  - Requires `Guilds` gateway intent
  - Optional `GuildMembers` privileged intent for advanced features
  - REST API for command registration

### Environment Configuration
Required environment variables:
- `BOT_TOKEN`: Discord bot authentication token
- `APPLICATION_ID`: Discord application ID for command registration
- `OWNER_ID`: Discord user ID of bot owner (for admin commands)

### NPM Dependencies
- **discord.js**: ^14.25.1 - Discord API library
- **dotenv**: ^16.3.1 - Environment variable management

### Discord Developer Portal Setup
- Application must be created at https://discord.com/developers/applications
- Bot requires these permissions:
  - Administrator (permission flag 8) for full functionality
  - Manage Channels (create tournament channels)
  - Send Messages & Embed Links
  - Create Instant Invites (for `/servidores` command)
- Privileged Gateway Intent "SERVER MEMBERS INTENT" should be enabled for full functionality

### Deployment Environment
- Designed for Replit deployment
- Uses Replit Secrets for environment variables
- `deploy-commands.js` script registers slash commands with Discord API before bot starts
- No external database required (file-based storage)