import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type {
  CalendarSummary,
  EventSummary,
  EventFull,
  EventListResult,
  EventInput,
  EventAttendee,
} from './types.js';

type TokenGetter = () => Promise<string>;

export class CalendarClient {
  private readonly getToken: TokenGetter;
  private readonly oauth2: OAuth2Client;

  constructor(getToken: TokenGetter) {
    this.getToken = getToken;
    this.oauth2 = new OAuth2Client();
  }

  private async calendar() {
    const token = await this.getToken();
    this.oauth2.setCredentials({ access_token: token });
    return google.calendar({ version: 'v3', auth: this.oauth2 });
  }

  // ── List Calendars ───────────────────────────────────────────

  async listCalendars(maxResults?: number): Promise<CalendarSummary[]> {
    const api = await this.calendar();
    const res = await api.calendarList.list({
      maxResults: maxResults ?? 100,
    });

    return (res.data.items ?? []).map((c) => ({
      id: c.id!,
      summary: c.summary ?? '',
      description: c.description ?? undefined,
      timeZone: c.timeZone ?? undefined,
      primary: c.primary === true,
    }));
  }

  // ── List Events ──────────────────────────────────────────────

  async listEvents(
    calendarId = 'primary',
    opts: {
      from?: string;
      to?: string;
      query?: string;
      maxResults?: number;
      pageToken?: string;
    } = {}
  ): Promise<EventListResult> {
    const api = await this.calendar();
    const res = await api.events.list({
      calendarId,
      timeMin: opts.from,
      timeMax: opts.to,
      q: opts.query,
      maxResults: opts.maxResults ?? 25,
      pageToken: opts.pageToken,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events: EventSummary[] = (res.data.items ?? []).map(parseEventSummary);
    return {
      events,
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  }

  // ── Get Event ────────────────────────────────────────────────

  async getEvent(calendarId: string, eventId: string): Promise<EventFull> {
    const api = await this.calendar();
    const res = await api.events.get({ calendarId, eventId });
    return parseEventFull(res.data);
  }

  // ── Create Event ─────────────────────────────────────────────

  async createEvent(calendarId: string, event: EventInput): Promise<EventFull> {
    const api = await this.calendar();
    const res = await api.events.insert({
      calendarId,
      requestBody: {
        summary: event.summary,
        start: event.start,
        end: event.end,
        location: event.location,
        description: event.description,
        attendees: event.attendees?.map((email) => ({ email })),
      },
    });
    return parseEventFull(res.data);
  }

  // ── Update Event ─────────────────────────────────────────────

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: Partial<EventInput>
  ): Promise<EventFull> {
    const api = await this.calendar();
    const res = await api.events.patch({
      calendarId,
      eventId,
      requestBody: {
        summary: event.summary,
        start: event.start,
        end: event.end,
        location: event.location,
        description: event.description,
        attendees: event.attendees?.map((email) => ({ email })),
      },
    });
    return parseEventFull(res.data);
  }

  // ── Delete Event ─────────────────────────────────────────────

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const api = await this.calendar();
    await api.events.delete({ calendarId, eventId });
  }

  // ── Quick Add ────────────────────────────────────────────────

  async quickAdd(calendarId: string, text: string): Promise<EventFull> {
    const api = await this.calendar();
    const res = await api.events.quickAdd({ calendarId, text });
    return parseEventFull(res.data);
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function parseEventSummary(data: any): EventSummary {
  return {
    id: data.id ?? '',
    summary: data.summary ?? '(no title)',
    start: data.start ?? {},
    end: data.end ?? {},
    status: data.status ?? 'confirmed',
    location: data.location ?? undefined,
    htmlLink: data.htmlLink ?? '',
  };
}

function parseEventFull(data: any): EventFull {
  return {
    ...parseEventSummary(data),
    description: data.description ?? undefined,
    attendees: (data.attendees ?? []).map((a: any): EventAttendee => ({
      email: a.email ?? '',
      displayName: a.displayName ?? undefined,
      responseStatus: a.responseStatus ?? undefined,
      optional: a.optional ?? undefined,
    })),
    creator: {
      email: data.creator?.email ?? '',
      displayName: data.creator?.displayName ?? undefined,
    },
    organizer: {
      email: data.organizer?.email ?? '',
      displayName: data.organizer?.displayName ?? undefined,
    },
    created: data.created ?? '',
    updated: data.updated ?? '',
  };
}
