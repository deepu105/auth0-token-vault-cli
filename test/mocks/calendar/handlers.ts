import { http, HttpResponse } from 'msw';
import {
  mockCalendarList,
  mockEventList,
  mockEventFull,
  mockCreatedEvent,
  mockUpdatedEvent,
  mockQuickAddEvent,
} from './data.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

export const calendarHandlers = [
  // List calendars
  http.get(`${BASE}/users/me/calendarList`, () => {
    return HttpResponse.json(mockCalendarList);
  }),

  // List events
  http.get(`${BASE}/calendars/:calendarId/events`, ({ request }) => {
    const url = new URL(request.url);
    // If quickAdd is in the query, it's a different endpoint (POST)
    return HttpResponse.json(mockEventList);
  }),

  // Get event
  http.get(`${BASE}/calendars/:calendarId/events/:eventId`, () => {
    return HttpResponse.json(mockEventFull);
  }),

  // Quick add event (must be before generic create to match first)
  http.post(`${BASE}/calendars/:calendarId/events/quickAdd`, () => {
    return HttpResponse.json(mockQuickAddEvent);
  }),

  // Create event
  http.post(`${BASE}/calendars/:calendarId/events`, () => {
    return HttpResponse.json(mockCreatedEvent);
  }),

  // Update event (patch)
  http.patch(`${BASE}/calendars/:calendarId/events/:eventId`, () => {
    return HttpResponse.json(mockUpdatedEvent);
  }),

  // Delete event
  http.delete(`${BASE}/calendars/:calendarId/events/:eventId`, () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
