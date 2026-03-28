/** Minimal Google Calendar API response fixtures */

export const mockCalendarList = {
  kind: 'calendar#calendarList',
  items: [
    {
      id: 'primary',
      summary: 'user@example.com',
      description: 'Main calendar',
      timeZone: 'America/New_York',
      primary: true,
    },
    {
      id: 'work-cal-id',
      summary: 'Work',
      timeZone: 'America/New_York',
      primary: false,
    },
  ],
};

export const mockEventList = {
  kind: 'calendar#events',
  items: [
    {
      id: 'event-1',
      summary: 'Team Standup',
      start: { dateTime: '2026-03-28T09:00:00-04:00' },
      end: { dateTime: '2026-03-28T09:30:00-04:00' },
      status: 'confirmed',
      location: 'Conference Room A',
      htmlLink: 'https://calendar.google.com/event?eid=event-1',
    },
    {
      id: 'event-2',
      summary: 'Lunch',
      start: { date: '2026-03-28' },
      end: { date: '2026-03-28' },
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event?eid=event-2',
    },
  ],
  nextPageToken: 'next-page-abc',
};

export const mockEventFull = {
  id: 'event-1',
  summary: 'Team Standup',
  start: { dateTime: '2026-03-28T09:00:00-04:00' },
  end: { dateTime: '2026-03-28T09:30:00-04:00' },
  status: 'confirmed',
  location: 'Conference Room A',
  htmlLink: 'https://calendar.google.com/event?eid=event-1',
  description: 'Daily standup meeting',
  attendees: [
    { email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted' },
    { email: 'bob@example.com', responseStatus: 'needsAction' },
  ],
  creator: { email: 'user@example.com', displayName: 'User' },
  organizer: { email: 'user@example.com', displayName: 'User' },
  created: '2026-03-25T10:00:00.000Z',
  updated: '2026-03-27T15:00:00.000Z',
};

export const mockCreatedEvent = {
  ...mockEventFull,
  id: 'event-new',
};

export const mockUpdatedEvent = {
  ...mockEventFull,
  summary: 'Updated Standup',
};

export const mockQuickAddEvent = {
  ...mockEventFull,
  id: 'event-quick',
  summary: 'Dinner tomorrow at 7pm',
};
