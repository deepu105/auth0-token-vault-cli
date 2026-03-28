/** Minimal Slack API response fixtures */

export const mockChannelList = {
  ok: true,
  channels: [
    {
      id: 'C001',
      name: 'general',
      is_private: false,
      is_archived: false,
      is_member: true,
      topic: { value: 'Company-wide announcements' },
      purpose: { value: 'General discussion' },
      num_members: 42,
    },
    {
      id: 'C002',
      name: 'engineering',
      is_private: false,
      is_archived: false,
      is_member: true,
      topic: { value: 'Engineering team' },
      purpose: { value: 'Engineering discussion' },
      num_members: 15,
    },
    {
      id: 'C003',
      name: 'secret-project',
      is_private: true,
      is_archived: false,
      is_member: true,
      topic: { value: '' },
      purpose: { value: 'Top secret' },
      num_members: 3,
    },
  ],
  response_metadata: { next_cursor: '' },
};

export const mockConversationHistory = {
  ok: true,
  messages: [
    {
      ts: '1711360000.000001',
      user: 'U001',
      text: 'Hello everyone!',
      thread_ts: undefined,
      reply_count: 2,
      reactions: [{ name: 'wave', count: 3, users: ['U002', 'U003', 'U004'] }],
    },
    {
      ts: '1711360100.000002',
      user: 'U002',
      text: 'Good morning!',
    },
  ],
  has_more: false,
};

export const mockSearchMessages = {
  ok: true,
  messages: {
    matches: [
      {
        ts: '1711360000.000001',
        channel: { id: 'C001', name: 'general' },
        user: 'U001',
        text: 'Important announcement about the release',
        permalink: 'https://workspace.slack.com/archives/C001/p1711360000000001',
      },
      {
        ts: '1711360200.000003',
        channel: { id: 'C002', name: 'engineering' },
        user: 'U002',
        text: 'Release notes for v2.0',
        permalink: 'https://workspace.slack.com/archives/C002/p1711360200000003',
      },
    ],
    total: 2,
    paging: { page: 1, pages: 1 },
  },
};

export const mockPostMessage = {
  ok: true,
  ts: '1711360300.000004',
  channel: 'C001',
};

export const mockReactionOk = {
  ok: true,
};

export const mockUserList = {
  ok: true,
  members: [
    {
      id: 'U001',
      name: 'alice',
      real_name: 'Alice Johnson',
      is_bot: false,
      is_admin: true,
      tz: 'America/New_York',
      profile: {
        display_name: 'alice.j',
        email: 'alice@example.com',
        real_name: 'Alice Johnson',
        status_text: 'Working remotely',
        status_emoji: ':house_with_garden:',
      },
    },
    {
      id: 'U002',
      name: 'bob',
      real_name: 'Bob Smith',
      is_bot: false,
      is_admin: false,
      tz: 'Europe/London',
      profile: {
        display_name: 'bob.s',
        email: 'bob@example.com',
        real_name: 'Bob Smith',
        status_text: '',
        status_emoji: '',
      },
    },
    {
      id: 'U003',
      name: 'slackbot',
      real_name: 'Slackbot',
      is_bot: true,
      is_admin: false,
      profile: {
        display_name: 'Slackbot',
        real_name: 'Slackbot',
        status_text: '',
        status_emoji: '',
      },
    },
  ],
  response_metadata: { next_cursor: '' },
};

export const mockUserInfo = {
  ok: true,
  user: {
    id: 'U001',
    name: 'alice',
    real_name: 'Alice Johnson',
    is_bot: false,
    is_admin: true,
    tz: 'America/New_York',
    profile: {
      display_name: 'alice.j',
      email: 'alice@example.com',
      real_name: 'Alice Johnson',
      status_text: 'Working remotely',
      status_emoji: ':house_with_garden:',
    },
  },
};

export const mockProfileSet = {
  ok: true,
  profile: {
    status_text: 'In a meeting',
    status_emoji: ':calendar:',
  },
};
