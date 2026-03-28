import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { createCalendarClient, handleCalendarError, requireConfirmation } from './helpers.js';

export function registerDeleteCommand(calendar: Command) {
  calendar
    .command('delete <eventId>')
    .description('Delete an event')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .action(async (eventId: string, opts, cmd: Command) => {
      try {
        await requireConfirmation(`Delete event ${eventId}`, cmd);

        const client = await createCalendarClient(cmd);
        await client.deleteEvent(opts.calendar, eventId);

        output(
          { status: 'deleted', eventId },
          chalk.green(`Event ${eventId} deleted.`),
          cmd
        );
      } catch (err) {
        handleCalendarError(err, cmd);
      }
    });
}
