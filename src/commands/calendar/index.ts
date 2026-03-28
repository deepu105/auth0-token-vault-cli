import { Command } from 'commander';
import { registerListCommand } from './list.js';
import { registerEventsCommand } from './events.js';
import { registerGetCommand } from './get.js';
import { registerCreateCommand } from './create.js';
import { registerUpdateCommand } from './update.js';
import { registerDeleteCommand } from './delete.js';
import { registerQuickAddCommand } from './quick-add.js';

export function createCalendarCommand(): Command {
  const calendar = new Command('calendar').description(
    'Google Calendar commands (list calendars, events, create, update, delete, quick-add)'
  );

  registerListCommand(calendar);
  registerEventsCommand(calendar);
  registerGetCommand(calendar);
  registerCreateCommand(calendar);
  registerUpdateCommand(calendar);
  registerDeleteCommand(calendar);
  registerQuickAddCommand(calendar);

  return calendar;
}
