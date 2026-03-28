import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatEventFull } from '../../services/calendar/formatters.js';
import { createCalendarClient, handleCalendarError } from './helpers.js';

export function registerGetCommand(calendar: Command) {
  calendar
    .command('get <eventId>')
    .description('Get event details')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .action(async (eventId: string, opts, cmd: Command) => {
      try {
        const client = await createCalendarClient(cmd);
        const event = await client.getEvent(opts.calendar, eventId);
        output({ data: event }, formatEventFull(event), cmd);
      } catch (err) {
        handleCalendarError(err, cmd);
      }
    });
}
