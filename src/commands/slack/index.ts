import { Command } from 'commander';
import { registerChannelsCommand } from './channels.js';
import { registerMessagesCommand } from './messages.js';
import { registerSearchCommand } from './search.js';
import { registerPostCommand } from './post.js';
import { registerReplyCommand } from './reply.js';
import { registerReactCommand } from './react.js';
import { registerUsersCommand, registerUserCommand } from './users.js';
import { registerStatusCommand } from './status.js';

export function createSlackCommand(): Command {
  const slack = new Command('slack').description(
    'Slack commands (channels, messages, search, post, reply, react, users, status)'
  );

  registerChannelsCommand(slack);
  registerMessagesCommand(slack);
  registerSearchCommand(slack);
  registerPostCommand(slack);
  registerReplyCommand(slack);
  registerReactCommand(slack);
  registerUsersCommand(slack);
  registerUserCommand(slack);
  registerStatusCommand(slack);

  return slack;
}
