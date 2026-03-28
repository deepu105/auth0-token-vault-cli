import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { createCalendarClient, handleCalendarError, requireConfirmation } from './helpers.js';
import type { EventInput } from '../../services/calendar/types.js';

export function registerUpdateCommand(calendar: Command) {
  calendar
    .command('update <eventId>')
    .description('Update an existing event')
    .option('--summary <text>', 'Event title')
    .option('--start <datetime>', 'Start date/time (ISO 8601)')
    .option('--end <datetime>', 'End date/time (ISO 8601)')
    .option('--location <place>', 'Event location')
    .option('--description <text>', 'Event description')
    .option('--attendees <emails>', 'Comma-separated attendee email addresses')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .action(async (eventId: string, opts, cmd: Command) => {
      try {
        await requireConfirmation(`Update event ${eventId}`, cmd);

        const client = await createCalendarClient(cmd);
        const patch: Partial<EventInput> = {};

        if (opts.summary) patch.summary = opts.summary;
        if (opts.start) patch.start = { dateTime: opts.start };
        if (opts.end) patch.end = { dateTime: opts.end };
        if (opts.location) patch.location = opts.location;
        if (opts.description) patch.description = opts.description;
        if (opts.attendees) {
          patch.attendees = opts.attendees.split(',').map((e: string) => e.trim());
        }

        const event = await client.updateEvent(opts.calendar, eventId, patch);

        output({ data: event }, chalk.green(`Event updated (id: ${event.id})`), cmd);
      } catch (err) {
        handleCalendarError(err, cmd);
      }
    });
}
