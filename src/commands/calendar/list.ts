import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatCalendarList } from '../../services/calendar/formatters.js';
import { createCalendarClient, handleCalendarError } from './helpers.js';

export function registerListCommand(calendar: Command) {
  calendar
    .command('list')
    .description('List calendars')
    .option('-n, --max-results <n>', 'Maximum calendars to return')
    .action(async (opts, cmd: Command) => {
      try {
        const client = await createCalendarClient(cmd);
        const maxResults = opts.maxResults ? parseInt(opts.maxResults, 10) : undefined;
        const calendars = await client.listCalendars(maxResults);
        output({ data: calendars }, formatCalendarList(calendars), cmd);
      } catch (err) {
        handleCalendarError(err, cmd);
      }
    });
}
