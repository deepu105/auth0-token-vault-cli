import { Command } from 'commander';
import { registerSearchCommand } from './search.js';
import { registerReadCommand } from './read.js';
import { registerSendCommand } from './send.js';
import { registerReplyCommand } from './reply.js';
import { registerForwardCommand } from './forward.js';
import { registerDraftCommands } from './draft.js';
import { registerLabelCommands } from './label.js';
import { registerArchiveCommand } from './archive.js';
import { registerDeleteCommand } from './delete.js';

export function createGmailCommand(): Command {
  const gmail = new Command('gmail').description(
    'Gmail commands (search, read, send, reply, forward, drafts, labels, archive)'
  );

  registerSearchCommand(gmail);
  registerReadCommand(gmail);
  registerSendCommand(gmail);
  registerReplyCommand(gmail);
  registerForwardCommand(gmail);
  registerDraftCommands(gmail);
  registerLabelCommands(gmail);
  registerArchiveCommand(gmail);
  registerDeleteCommand(gmail);

  return gmail;
}
