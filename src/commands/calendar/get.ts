import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatEventFull } from '../../services/calendar/formatters.js';
import { withCalendarAction } from './helpers.js';

export function registerGetCommand(calendar: Command) {
  calendar
    .command('get <eventId>')
    .description('Get event details')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .action(
      withCalendarAction(async (client, [eventId], opts, cmd) => {
        const event = await client.getEvent(opts.calendar, eventId);
        output({ data: event }, formatEventFull(event), cmd);
      })
    );
}
