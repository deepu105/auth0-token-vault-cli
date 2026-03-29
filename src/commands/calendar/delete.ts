import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withCalendarAction, requireConfirmation } from './helpers.js';

export function registerDeleteCommand(calendar: Command) {
  calendar
    .command('delete <eventId>')
    .description('Delete an event')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .action(
      withCalendarAction(async (client, [eventId], opts, cmd) => {
        await requireConfirmation(`Delete event ${eventId}`, cmd);
        await client.deleteEvent(opts.calendar, eventId);
        output({ status: 'deleted', eventId }, chalk.green(`Event ${eventId} deleted.`), cmd);
      })
    );
}
