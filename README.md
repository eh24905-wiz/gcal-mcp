# gcal-mcp

A Model Context Protocol (MCP) server for read-only Google Calendar integration. Provides calendar access to AI assistants through the MCP standard.

## Features

- **get_events_today** - Get all calendar events for today
- **get_events_week** - Get all calendar events for the current week (Monday to Sunday)
- **get_pending_invites** - Get calendar invitations requiring a response
- **find_available_slot** - Find available time slots for scheduling meetings

## Prerequisites

- Node.js 18+
- A Google Cloud project with Calendar API enabled
- OAuth 2.0 credentials (Desktop app type)

## Setup

### 1. Create Google Cloud OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Calendar API**
4. Go to **APIs & Services** > **Credentials**
5. Click **Create Credentials** > **OAuth client ID**
6. Select **Desktop app** as the application type
7. Download the JSON file and save it as `client_secret*.json` in the project root

### 2. Install Dependencies

```bash
npm install
```

### 3. Authenticate

Run the auth script to authorize access to your calendar:

```bash
npm run auth
```

This will open a browser window for Google OAuth consent. After authorization, a `token.json` file will be created.

### 4. Build

```bash
npm run build
```

## Usage

### With Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gcal": {
      "command": "node",
      "args": ["/path/to/gcal-mcp/dist/index.js"]
    }
  }
}
```

### Standalone

```bash
npm start
```

## Development

```bash
npm run dev
```

## Tools Reference

### get_events_today
Returns all events scheduled for the current day.

### get_events_week
Returns all events for the current week (Monday through Sunday), grouped by day.

### get_pending_invites
Returns calendar invitations where you haven't responded yet (needsAction status). Looks 30 days ahead.

### find_available_slot
Finds available meeting slots based on your calendar.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| duration_minutes | number | Yes | Meeting duration (15-480 minutes) |
| search_days | number | No | Days to search ahead (default: 7, max: 14) |
| working_hours_start | number | No | Start hour (default: 9) |
| working_hours_end | number | No | End hour (default: 17) |

## Security Notes

⚠️ **Never commit sensitive files:**
- `client_secret*.json` - Your OAuth client credentials
- `token.json` - Your access/refresh tokens

These are already in `.gitignore`.

## License

ISC

