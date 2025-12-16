import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  status: string;
  organizer?: string;
  attendees?: Array<{
    email: string;
    responseStatus: string;
    self?: boolean;
  }>;
  htmlLink?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  durationMinutes: number;
}

function formatEvent(event: calendar_v3.Schema$Event): CalendarEvent {
  const start = event.start?.dateTime || event.start?.date || '';
  const end = event.end?.dateTime || event.end?.date || '';
  
  return {
    id: event.id || '',
    summary: event.summary || '(No title)',
    description: event.description || undefined,
    start,
    end,
    location: event.location || undefined,
    status: event.status || 'confirmed',
    organizer: event.organizer?.email,
    attendees: event.attendees?.map(a => ({
      email: a.email || '',
      responseStatus: a.responseStatus || 'needsAction',
      self: a.self ?? undefined,
    })),
    htmlLink: event.htmlLink || undefined,
  };
}

export class CalendarService {
  private calendar: calendar_v3.Calendar;

  constructor(auth: OAuth2Client) {
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  async getEventsForDay(date: Date = new Date()): Promise<CalendarEvent[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []).map(formatEvent);
  }

  async getEventsForWeek(startDate?: Date): Promise<CalendarEvent[]> {
    const start = startDate || new Date();
    const dayOfWeek = start.getDay();
    const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust for Monday
    
    const startOfWeek = new Date(start);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfWeek.toISOString(),
      timeMax: endOfWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []).map(formatEvent);
  }

  async getPendingInvites(): Promise<CalendarEvent[]> {
    // Get events from now to 30 days in the future
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 30);

    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    // Filter for events where the current user has responseStatus = 'needsAction'
    const pending = (response.data.items || []).filter(event => {
      const selfAttendee = event.attendees?.find(a => a.self);
      return selfAttendee?.responseStatus === 'needsAction';
    });

    return pending.map(formatEvent);
  }

  async findAvailableSlots(
    durationMinutes: number,
    searchDays: number = 7,
    workingHoursStart: number = 9,
    workingHoursEnd: number = 17
  ): Promise<TimeSlot[]> {
    const now = new Date();
    const endSearch = new Date();
    endSearch.setDate(endSearch.getDate() + searchDays);

    // Get all events in the search period
    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endSearch.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    const availableSlots: TimeSlot[] = [];
    const durationMs = durationMinutes * 60 * 1000;

    // Check each day
    for (let day = 0; day < searchDays && availableSlots.length < 5; day++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + day);
      
      // Skip weekends
      if (checkDate.getDay() === 0 || checkDate.getDay() === 6) continue;
      
      const dayStart = new Date(checkDate);
      dayStart.setHours(workingHoursStart, 0, 0, 0);
      
      const dayEnd = new Date(checkDate);
      dayEnd.setHours(workingHoursEnd, 0, 0, 0);

      // Get events for this day
      const dayEvents = events.filter(e => {
        const eventStart = new Date(e.start?.dateTime || e.start?.date || '');
        return eventStart.toDateString() === checkDate.toDateString();
      }).sort((a, b) => {
        const aStart = new Date(a.start?.dateTime || a.start?.date || '');
        const bStart = new Date(b.start?.dateTime || b.start?.date || '');
        return aStart.getTime() - bStart.getTime();
      });

      // Find gaps between events
      let slotStart = day === 0 ? Math.max(now.getTime(), dayStart.getTime()) : dayStart.getTime();

      for (const event of dayEvents) {
        const eventStart = new Date(event.start?.dateTime || event.start?.date || '').getTime();
        const eventEnd = new Date(event.end?.dateTime || event.end?.date || '').getTime();

        // Check if there's a gap before this event
        if (eventStart - slotStart >= durationMs && slotStart < dayEnd.getTime()) {
          const slotEnd = Math.min(eventStart, slotStart + durationMs);
          availableSlots.push({
            start: new Date(slotStart).toISOString(),
            end: new Date(slotEnd).toISOString(),
            durationMinutes,
          });
          if (availableSlots.length >= 5) break;
        }

        slotStart = Math.max(slotStart, eventEnd);
      }

      // Check for time after last event
      if (availableSlots.length < 5 && dayEnd.getTime() - slotStart >= durationMs) {
        availableSlots.push({
          start: new Date(slotStart).toISOString(),
          end: new Date(slotStart + durationMs).toISOString(),
          durationMinutes,
        });
      }
    }

    return availableSlots;
  }
}

