import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { calendarHandlers } from '../../mocks/calendar/handlers.js';
import { CalendarClient } from '../../../src/services/calendar/client.js';

describe('CalendarClient', () => {
  const msw = setupServer(...calendarHandlers);
  let client: CalendarClient;

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => msw.resetHandlers());

  beforeAll(() => {
    client = new CalendarClient(async () => 'mock-calendar-token');
  });

  // ── List Calendars ───────────────────────────────────────────

  it('listCalendars returns calendar summaries', async () => {
    const calendars = await client.listCalendars();
    expect(calendars).toHaveLength(2);
    expect(calendars[0].summary).toBe('user@example.com');
    expect(calendars[0].primary).toBe(true);
    expect(calendars[1].summary).toBe('Work');
    expect(calendars[1].primary).toBe(false);
  });

  // ── List Events ──────────────────────────────────────────────

  it('listEvents returns paginated event list', async () => {
    const result = await client.listEvents('primary', {
      from: '2026-03-28T00:00:00Z',
      to: '2026-03-29T00:00:00Z',
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0].summary).toBe('Team Standup');
    expect(result.events[0].location).toBe('Conference Room A');
    expect(result.nextPageToken).toBe('next-page-abc');
  });

  it('listEvents defaults to primary calendar', async () => {
    const result = await client.listEvents();
    expect(result.events).toHaveLength(2);
  });

  // ── Get Event ────────────────────────────────────────────────

  it('getEvent returns full event details', async () => {
    const event = await client.getEvent('primary', 'event-1');
    expect(event.id).toBe('event-1');
    expect(event.summary).toBe('Team Standup');
    expect(event.description).toBe('Daily standup meeting');
    expect(event.attendees).toHaveLength(2);
    expect(event.attendees[0].email).toBe('alice@example.com');
    expect(event.creator.email).toBe('user@example.com');
  });

  // ── Create Event ─────────────────────────────────────────────

  it('createEvent returns created event', async () => {
    const event = await client.createEvent('primary', {
      summary: 'New Meeting',
      start: { dateTime: '2026-03-29T10:00:00-04:00' },
      end: { dateTime: '2026-03-29T11:00:00-04:00' },
      location: 'Room B',
      attendees: ['alice@example.com', 'bob@example.com'],
    });
    expect(event.id).toBe('event-new');
  });

  // ── Update Event ─────────────────────────────────────────────

  it('updateEvent returns updated event', async () => {
    const event = await client.updateEvent('primary', 'event-1', {
      summary: 'Updated Standup',
    });
    expect(event.summary).toBe('Updated Standup');
  });

  // ── Delete Event ─────────────────────────────────────────────

  it('deleteEvent completes without error', async () => {
    await expect(client.deleteEvent('primary', 'event-1')).resolves.toBeUndefined();
  });

  // ── Quick Add ────────────────────────────────────────────────

  it('quickAdd returns created event', async () => {
    const event = await client.quickAdd('primary', 'Dinner tomorrow at 7pm');
    expect(event.id).toBe('event-quick');
  });

  // ── Token getter ─────────────────────────────────────────────

  it('calls token getter before each operation', async () => {
    const tokenFn = vi.fn(async () => 'fresh-token');
    const freshClient = new CalendarClient(tokenFn);
    await freshClient.listCalendars();
    expect(tokenFn).toHaveBeenCalledOnce();

    await freshClient.listCalendars();
    expect(tokenFn).toHaveBeenCalledTimes(2);
  });
});
