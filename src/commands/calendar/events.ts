import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatEventList } from '../../services/calendar/formatters.js';
import { createCalendarClient, handleCalendarError } from './helpers.js';

export function registerEventsCommand(calendar: Command) {
  calendar
    .command('events [calendarId]')
    .description('List events')
    .option('--from <date>', 'Start date (ISO 8601)')
    .option('--to <date>', 'End date (ISO 8601)')
    .option('--query <text>', 'Free-text search query')
    .option('-n, --max-results <n>', 'Maximum events to return', '25')
    .option('--page-token <token>', 'Page token for pagination')
    .action(async (calendarId: string | undefined, opts, cmd: Command) => {
      try {
        const client = await createCalendarClient(cmd);
        const result = await client.listEvents(calendarId ?? 'primary', {
          from: opts.from,
          to: opts.to,
          query: opts.query,
          maxResults: parseInt(opts.maxResults, 10),
          pageToken: opts.pageToken,
        });
        output({ data: result }, formatEventList(result), cmd);
      } catch (err) {
        handleCalendarError(err, cmd);
      }
    });
}
