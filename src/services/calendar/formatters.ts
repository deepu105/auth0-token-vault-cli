import chalk from 'chalk';
import type { CalendarSummary, EventListResult, EventFull, EventDateTime } from './types.js';
import { truncate } from '../../utils/format-helpers.js';

export function formatCalendarList(calendars: CalendarSummary[]): string {
  if (calendars.length === 0) {
    return chalk.yellow('No calendars found.');
  }

  return calendars
    .map((c) => {
      const primary = c.primary ? chalk.green(' (primary)') : '';
      const tz = c.timeZone ? chalk.dim(` [${c.timeZone}]`) : '';
      const desc = c.description ? `\n   ${chalk.dim(c.description)}` : '';
      return `  ${chalk.cyan(c.summary)}${primary}${tz}${desc}`;
    })
    .join('\n');
}

export function formatEventList(result: EventListResult): string {
  if (result.events.length === 0) {
    return chalk.yellow('No events found.');
  }

  const lines = result.events.map((e, i) => {
    const idx = chalk.dim(`${i + 1}.`);
    const title = chalk.bold(truncate(e.summary, 50));
    const time = chalk.cyan(formatDateTimeRange(e.start, e.end));
    const loc = e.location ? chalk.dim(` @ ${truncate(e.location, 30)}`) : '';
    return `${idx} ${title}\n   ${time}${loc}`;
  });

  const footer = result.nextPageToken ? chalk.dim('\nMore events available.') : '';
  return `${lines.join('\n\n')}${footer}`;
}

export function formatEventFull(event: EventFull): string {
  const lines = [
    `${chalk.bold('Title:')}     ${event.summary}`,
    `${chalk.bold('When:')}      ${formatDateTimeRange(event.start, event.end)}`,
    `${chalk.bold('Status:')}    ${event.status}`,
  ];

  if (event.location) {
    lines.push(`${chalk.bold('Location:')}  ${event.location}`);
  }

  if (event.organizer.email) {
    const name = event.organizer.displayName
      ? `${event.organizer.displayName} <${event.organizer.email}>`
      : event.organizer.email;
    lines.push(`${chalk.bold('Organizer:')} ${name}`);
  }

  if (event.attendees.length > 0) {
    const list = event.attendees
      .map((a) => {
        const name = a.displayName ? `${a.displayName} <${a.email}>` : a.email;
        const status = a.responseStatus ? chalk.dim(` (${a.responseStatus})`) : '';
        return `  ${name}${status}`;
      })
      .join('\n');
    lines.push(`${chalk.bold('Attendees:')}\n${list}`);
  }

  if (event.description) {
    lines.push('', chalk.dim('─'.repeat(60)), '', event.description);
  }

  if (event.htmlLink) {
    lines.push('', chalk.dim(`Link: ${event.htmlLink}`));
  }

  return lines.join('\n');
}

function formatDateTimeRange(start: EventDateTime, end: EventDateTime): string {
  const startStr = start.dateTime ?? start.date ?? '?';
  const endStr = end.dateTime ?? end.date ?? '?';

  // For all-day events (date only), show dates
  if (start.date && end.date) {
    return start.date === end.date ? start.date : `${start.date} → ${end.date}`;
  }

  // For timed events, format nicely
  return `${startStr} → ${endStr}`;
}
