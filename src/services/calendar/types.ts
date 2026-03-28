export interface CalendarSummary {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  primary: boolean;
}

export interface EventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface EventAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
  optional?: boolean;
}

export interface EventSummary {
  id: string;
  summary: string;
  start: EventDateTime;
  end: EventDateTime;
  status: string;
  location?: string;
  htmlLink: string;
}

export interface EventFull extends EventSummary {
  description?: string;
  attendees: EventAttendee[];
  creator: { email: string; displayName?: string };
  organizer: { email: string; displayName?: string };
  created: string;
  updated: string;
}

export interface EventInput {
  summary: string;
  start: EventDateTime;
  end: EventDateTime;
  location?: string;
  description?: string;
  attendees?: string[];
}

export interface EventListResult {
  events: EventSummary[];
  nextPageToken?: string;
}
