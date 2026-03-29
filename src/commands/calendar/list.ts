import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatCalendarList } from '../../services/calendar/formatters.js';
import { withCalendarAction } from './helpers.js';

export function registerListCommand(calendar: Command) {
  calendar
    .command('list')
    .description('List calendars')
    .option('-n, --max-results <n>', 'Maximum calendars to return')
    .action(
      withCalendarAction(async (client, _args, opts, cmd) => {
        const maxResults = opts.maxResults ? parseInt(opts.maxResults, 10) : undefined;
        const calendars = await client.listCalendars(maxResults);
        output({ data: calendars }, formatCalendarList(calendars), cmd);
      })
    );
}
