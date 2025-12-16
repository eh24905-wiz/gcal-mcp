#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { authorize } from './auth.js';
import { CalendarService } from './calendar.js';

const server = new McpServer({
  name: 'gcal-mcp',
  version: '1.0.0',
});

let calendarService: CalendarService | null = null;

async function getCalendarService(): Promise<CalendarService> {
  if (!calendarService) {
    const auth = await authorize();
    calendarService = new CalendarService(auth);
  }
  return calendarService;
}

// Tool: get_events_today
server.tool(
  'get_events_today',
  'Get all calendar events for today',
  {},
  async () => {
    try {
      const service = await getCalendarService();
      const events = await service.getEventsForDay();
      
      if (events.length === 0) {
        return {
          content: [{ type: 'text', text: 'No events scheduled for today.' }],
        };
      }

      const formatted = events.map(e => {
        const start = new Date(e.start).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        const end = new Date(e.end).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        return `• ${start} - ${end}: ${e.summary}${e.location ? ` (${e.location})` : ''}`;
      }).join('\n');

      return {
        content: [{ 
          type: 'text', 
          text: `Today's Events (${new Date().toLocaleDateString()}):\n\n${formatted}` 
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error fetching events: ${error}` }],
        isError: true,
      };
    }
  }
);

// Tool: get_events_week
server.tool(
  'get_events_week',
  'Get all calendar events for the current week (Monday to Sunday)',
  {},
  async () => {
    try {
      const service = await getCalendarService();
      const events = await service.getEventsForWeek();
      
      if (events.length === 0) {
        return {
          content: [{ type: 'text', text: 'No events scheduled for this week.' }],
        };
      }

      // Group events by day
      const byDay: Record<string, typeof events> = {};
      for (const event of events) {
        const day = new Date(event.start).toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'short', 
          day: 'numeric' 
        });
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(event);
      }

      let formatted = "This Week's Events:\n";
      for (const [day, dayEvents] of Object.entries(byDay)) {
        formatted += `\n${day}:\n`;
        for (const e of dayEvents) {
          const start = new Date(e.start).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          formatted += `  • ${start}: ${e.summary}${e.location ? ` (${e.location})` : ''}\n`;
        }
      }

      return {
        content: [{ type: 'text', text: formatted }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error fetching events: ${error}` }],
        isError: true,
      };
    }
  }
);

// Tool: get_pending_invites
server.tool(
  'get_pending_invites',
  'Get calendar invitations that require a response (needsAction status)',
  {},
  async () => {
    try {
      const service = await getCalendarService();
      const invites = await service.getPendingInvites();
      
      if (invites.length === 0) {
        return {
          content: [{ type: 'text', text: 'No pending invitations requiring a response.' }],
        };
      }

      const formatted = invites.map(e => {
        const date = new Date(e.start).toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        });
        const time = new Date(e.start).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        return `• ${e.summary}\n  Date: ${date} at ${time}\n  Organizer: ${e.organizer || 'Unknown'}`;
      }).join('\n\n');

      return {
        content: [{ 
          type: 'text', 
          text: `Pending Invitations (${invites.length}):\n\n${formatted}` 
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error fetching invites: ${error}` }],
        isError: true,
      };
    }
  }
);

// Tool: find_available_slot
server.tool(
  'find_available_slot',
  'Find available time slots for scheduling a meeting of a given duration',
  {
    duration_minutes: z.number()
      .min(15)
      .max(480)
      .describe('Duration of the meeting in minutes (e.g., 30, 60)'),
    search_days: z.number()
      .min(1)
      .max(14)
      .optional()
      .describe('Number of days to search ahead (default: 7)'),
    working_hours_start: z.number()
      .min(0)
      .max(23)
      .optional()
      .describe('Start of working hours (default: 9)'),
    working_hours_end: z.number()
      .min(1)
      .max(24)
      .optional()
      .describe('End of working hours (default: 17)'),
  },
  async ({ duration_minutes, search_days, working_hours_start, working_hours_end }) => {
    try {
      const service = await getCalendarService();
      const slots = await service.findAvailableSlots(
        duration_minutes,
        search_days ?? 7,
        working_hours_start ?? 9,
        working_hours_end ?? 17
      );

      if (slots.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No available ${duration_minutes}-minute slots found in the next ${search_days ?? 7} days.`
          }],
        };
      }

      const formatted = slots.map((slot, i) => {
        const start = new Date(slot.start);
        const date = start.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
        const time = start.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        return `${i + 1}. ${date} at ${time}`;
      }).join('\n');

      return {
        content: [{
          type: 'text',
          text: `Available ${duration_minutes}-minute slots:\n\n${formatted}`
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error finding slots: ${error}` }],
        isError: true,
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('gcal-mcp server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

