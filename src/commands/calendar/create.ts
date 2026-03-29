import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { splitCommaList } from '../../utils/format-helpers.js';
import { createCalendarClient, handleCalendarError, requireConfirmation } from './helpers.js';

export function registerCreateCommand(calendar: Command) {
  calendar
    .command('create')
    .description('Create a new event')
    .requiredOption('--summary <text>', 'Event title')
    .requiredOption('--start <datetime>', 'Start date/time (ISO 8601)')
    .requiredOption('--end <datetime>', 'End date/time (ISO 8601)')
    .option('--location <place>', 'Event location')
    .option('--description <text>', 'Event description')
    .option('--attendees <emails>', 'Comma-separated attendee email addresses')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .action(async (opts, cmd: Command) => {
      try {
        await requireConfirmation(`Create event "${opts.summary}"`, cmd);

        const client = await createCalendarClient(cmd);
        const parts = splitCommaList(opts.attendees);
        const attendees = parts.length > 0 ? parts : undefined;

        const event = await client.createEvent(opts.calendar, {
          summary: opts.summary,
          start: { dateTime: opts.start },
          end: { dateTime: opts.end },
          location: opts.location,
          description: opts.description,
          attendees,
        });

        output({ data: event }, chalk.green(`Event created (id: ${event.id})`), cmd);
      } catch (err) {
        handleCalendarError(err, cmd);
      }
    });
}
