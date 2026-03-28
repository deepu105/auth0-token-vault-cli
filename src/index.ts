#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { logError } from './utils/logger.js';
import { EXIT_GENERAL, EXIT_INVALID_INPUT } from './utils/exit-codes.js';
import { registerLoginCommand } from './commands/login.js';
import { registerLogoutCommand } from './commands/logout.js';
import { registerConnectCommand } from './commands/connect.js';
import { registerDisconnectCommand } from './commands/disconnect.js';
import { registerConnectionsCommand } from './commands/connections.js';
import { registerStatusCommand } from './commands/status.js';
import { createGmailCommand } from './commands/gmail/index.js';
import { createCalendarCommand } from './commands/calendar/index.js';
import { createSlackCommand } from './commands/slack/index.js';
import { createGitHubCommand } from './commands/github/index.js';

// Global error handlers
['uncaughtException', 'unhandledRejection'].forEach((event) => {
  process.on(event, (error) => {
    logError(`${event}:`, error);
    process.exit(EXIT_GENERAL);
  });
});

const program = new Command()
  .name('auth0-tv')
  .description('Auth0 Token Vault CLI — access third-party services via Auth0 Token Vault')
  .version('0.1.0')
  .option('--json', 'Output results as JSON (for agent consumption)')
  .option('--confirm', 'Skip destructive-action confirmation prompts (alias: --yes)')
  .option('--yes', 'Skip destructive-action confirmation prompts (alias: --confirm)')
  .option('--browser <app>', 'Browser to open for auth flows (e.g. firefox, google-chrome)')
  .option(
    '--port <number>',
    'Port for the local OAuth callback server (default: auto-select from 18484-18489)'
  )
  .addHelpText(
    'before',
    `
${chalk.bold('Auth0 Token Vault CLI')}

Authenticate via Auth0, connect third-party services, and interact
with them from the terminal. Designed for both humans and AI agents.
`
  );

// ── Register commands ──────────────────────────────────────────
registerLoginCommand(program);
registerLogoutCommand(program);
registerStatusCommand(program);
registerConnectCommand(program);
registerConnectionsCommand(program);
registerDisconnectCommand(program);

// ── Gmail subcommand group ─────────────────────────────────────
program.addCommand(createGmailCommand());

// ── Calendar subcommand group ─────────────────────────────────
program.addCommand(createCalendarCommand());

// ── Slack subcommand group ────────────────────────────────────
program.addCommand(createSlackCommand());

// ── GitHub subcommand group ───────────────────────────────────
program.addCommand(createGitHubCommand());

// ── Unknown command handling ───────────────────────────────────
program.on('command:*', () => {
  // eslint-disable-next-line no-console
  console.error(`Unknown command: ${program.args.join(' ')}`);
  program.outputHelp();
  process.exit(EXIT_INVALID_INPUT);
});

program.parse(process.argv);
