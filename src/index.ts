#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { logError } from './utils/logger.js';
import { EXIT_GENERAL, EXIT_INVALID_INPUT } from './utils/exit-codes.js';
import { registerLoginCommand } from './commands/login.js';
import { registerConnectCommand } from './commands/connect.js';
import { registerDisconnectCommand } from './commands/disconnect.js';
import { registerConnectionsCommand } from './commands/connections.js';
import { registerStatusCommand } from './commands/status.js';
import { createGmailCommand } from './commands/gmail/index.js';

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
registerStatusCommand(program);
registerConnectCommand(program);
registerConnectionsCommand(program);
registerDisconnectCommand(program);

// ── Gmail subcommand group ─────────────────────────────────────
program.addCommand(createGmailCommand());

// ── Unknown command handling ───────────────────────────────────
program.on('command:*', () => {
  console.error(`Unknown command: ${program.args.join(' ')}`);
  program.outputHelp();
  process.exit(EXIT_INVALID_INPUT);
});

program.parse(process.argv);
