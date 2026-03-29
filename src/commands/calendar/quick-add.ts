import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withCalendarAction, requireConfirmation } from './helpers.js';

export function registerQuickAddCommand(calendar: Command) {
  calendar
    .command('quick-add <text>')
    .description('Quick-add an event using natural language')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .action(
      withCalendarAction(async (client, [text], opts, cmd) => {
        await requireConfirmation(`Create event from "${text}"`, cmd);
        const event = await client.quickAdd(opts.calendar, text);
        output({ data: event }, chalk.green(`Event created (id: ${event.id})`), cmd);
      })
    );
}
