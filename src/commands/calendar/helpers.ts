import type { Command } from 'commander';
import { CalendarClient } from '../../services/calendar/client.js';
import { classifyGoogleError } from '../../utils/classify-google-error.js';
import { createServiceClient, handleServiceError } from '../service-helpers.js';

export { requireConfirmation } from '../service-helpers.js';

export async function createCalendarClient(cmd: Command): Promise<CalendarClient> {
  return createServiceClient(CalendarClient, 'calendar', cmd);
}

export function handleCalendarError(err: unknown, cmd: Command): never {
  return handleServiceError(err, cmd, 'calendar', classifyGoogleError);
}
