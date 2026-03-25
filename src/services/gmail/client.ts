import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { log } from '../../utils/logger.js';
import type {
  EmailSummary,
  EmailFull,
  EmailHeader,
  AttachmentMeta,
  SearchResult,
  DraftSummary,
  LabelInfo,
} from './types.js';

type TokenGetter = () => Promise<string>;

export class GmailClient {
  private readonly getToken: TokenGetter;
  private readonly oauth2: OAuth2Client;

  constructor(getToken: TokenGetter) {
    this.getToken = getToken;
    this.oauth2 = new OAuth2Client();
  }

  private async gmail() {
    const token = await this.getToken();
    this.oauth2.setCredentials({ access_token: token });
    return google.gmail({ version: 'v1', auth: this.oauth2 });
  }

  // ── Search / List ─────────────────────────────────────────────

  async search(query: string, maxResults = 20, pageToken?: string): Promise<SearchResult> {
    const api = await this.gmail();
    const listRes = await api.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
      pageToken,
    });

    const messageRefs = listRes.data.messages ?? [];
    if (messageRefs.length === 0) {
      return { messages: [], resultSizeEstimate: listRes.data.resultSizeEstimate ?? 0 };
    }

    // Fetch snippets + headers for each message
    const messages = await Promise.all(
      messageRefs.map(async (ref) => {
        const msg = await api.users.messages.get({
          userId: 'me',
          id: ref.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        return parseEmailSummary(msg.data);
      })
    );

    return {
      messages,
      nextPageToken: listRes.data.nextPageToken ?? undefined,
      resultSizeEstimate: listRes.data.resultSizeEstimate ?? 0,
    };
  }

  // ── Read ──────────────────────────────────────────────────────

  async read(messageId: string): Promise<EmailFull> {
    const api = await this.gmail();
    const res = await api.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    return parseEmailFull(res.data);
  }

  // ── Send ──────────────────────────────────────────────────────

  async send(to: string, subject: string, body: string): Promise<{ id: string; threadId: string }> {
    const api = await this.gmail();
    const raw = buildRawMessage({ to, subject, body });
    const res = await api.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    return { id: res.data.id!, threadId: res.data.threadId! };
  }

  // ── Reply ─────────────────────────────────────────────────────

  async reply(messageId: string, body: string): Promise<{ id: string; threadId: string }> {
    const api = await this.gmail();
    const original = await this.read(messageId);

    const raw = buildRawMessage({
      to: original.headers.from,
      subject: original.headers.subject.startsWith('Re:')
        ? original.headers.subject
        : `Re: ${original.headers.subject}`,
      body,
      inReplyTo: original.headers.messageId,
      references: original.headers.references
        ? `${original.headers.references} ${original.headers.messageId}`
        : original.headers.messageId,
    });

    const res = await api.users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId: original.threadId },
    });
    return { id: res.data.id!, threadId: res.data.threadId! };
  }

  // ── Forward ───────────────────────────────────────────────────

  async forward(
    messageId: string,
    to: string
  ): Promise<{ id: string; threadId: string }> {
    const original = await this.read(messageId);

    const fwdBody = [
      '',
      '---------- Forwarded message ----------',
      `From: ${original.headers.from}`,
      `Date: ${original.headers.date}`,
      `Subject: ${original.headers.subject}`,
      `To: ${original.headers.to}`,
      '',
      original.body,
    ].join('\n');

    const subject = original.headers.subject.startsWith('Fwd:')
      ? original.headers.subject
      : `Fwd: ${original.headers.subject}`;

    const api = await this.gmail();
    const raw = buildRawMessage({ to, subject, body: fwdBody });
    const res = await api.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    return { id: res.data.id!, threadId: res.data.threadId! };
  }

  // ── Drafts ────────────────────────────────────────────────────

  async createDraft(
    to: string,
    subject: string,
    body: string
  ): Promise<{ id: string; messageId: string }> {
    const api = await this.gmail();
    const raw = buildRawMessage({ to, subject, body });
    const res = await api.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw } },
    });
    return { id: res.data.id!, messageId: res.data.message?.id ?? '' };
  }

  async listDrafts(maxResults = 20): Promise<DraftSummary[]> {
    const api = await this.gmail();
    const res = await api.users.drafts.list({ userId: 'me', maxResults });
    const drafts = res.data.drafts ?? [];

    return Promise.all(
      drafts.map(async (d) => {
        const full = await api.users.drafts.get({ userId: 'me', id: d.id! });
        const msg = full.data.message;
        const headers = extractHeaders(msg?.payload?.headers ?? []);
        return {
          id: d.id!,
          messageId: msg?.id ?? '',
          subject: headers.subject,
          to: headers.to,
          snippet: msg?.snippet ?? '',
        };
      })
    );
  }

  async sendDraft(draftId: string): Promise<{ id: string; threadId: string }> {
    const api = await this.gmail();
    const res = await api.users.drafts.send({
      userId: 'me',
      requestBody: { id: draftId },
    });
    return { id: res.data.id!, threadId: res.data.threadId! };
  }

  async deleteDraft(draftId: string): Promise<void> {
    const api = await this.gmail();
    await api.users.drafts.delete({ userId: 'me', id: draftId });
  }

  // ── Labels ────────────────────────────────────────────────────

  async listLabels(): Promise<LabelInfo[]> {
    const api = await this.gmail();
    const res = await api.users.labels.list({ userId: 'me' });
    return (res.data.labels ?? []).map((l) => ({
      id: l.id!,
      name: l.name!,
      type: l.type ?? 'user',
      messagesTotal: l.messagesTotal ?? undefined,
      messagesUnread: l.messagesUnread ?? undefined,
    }));
  }

  async modifyLabels(
    messageId: string,
    addLabelIds: string[],
    removeLabelIds: string[]
  ): Promise<void> {
    const api = await this.gmail();
    await api.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds, removeLabelIds },
    });
  }

  // ── Archive / Delete ──────────────────────────────────────────

  async archive(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, [], ['INBOX']);
  }

  async deleteMessage(messageId: string): Promise<void> {
    const api = await this.gmail();
    await api.users.messages.trash({ userId: 'me', id: messageId });
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function extractHeaders(
  headers: Array<{ name?: string | null; value?: string | null }>
): EmailHeader {
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

  return {
    from: get('From'),
    to: get('To'),
    subject: get('Subject'),
    date: get('Date'),
    messageId: get('Message-ID') || undefined,
    inReplyTo: get('In-Reply-To') || undefined,
    references: get('References') || undefined,
  };
}

function parseEmailSummary(data: any): EmailSummary {
  const headers = extractHeaders(data.payload?.headers ?? []);
  return {
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet ?? '',
    from: headers.from,
    subject: headers.subject,
    date: headers.date,
    labelIds: data.labelIds ?? [],
  };
}

function parseEmailFull(data: any): EmailFull {
  const headers = extractHeaders(data.payload?.headers ?? []);

  let body = '';
  const attachments: AttachmentMeta[] = [];

  function walk(part: any) {
    if (!part) return;

    if (part.mimeType === 'text/plain' && part.body?.data && !body) {
      body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    }

    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      });
    }

    if (part.parts) {
      for (const sub of part.parts) {
        walk(sub);
      }
    }
  }

  walk(data.payload);

  // Fallback: single-part message
  if (!body && data.payload?.body?.data) {
    body = Buffer.from(data.payload.body.data, 'base64url').toString('utf-8');
  }

  return {
    id: data.id,
    threadId: data.threadId,
    headers,
    body,
    labelIds: data.labelIds ?? [],
    attachments,
  };
}

interface RawMessageOpts {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

function buildRawMessage(opts: RawMessageOpts): string {
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
  ];

  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  }
  if (opts.references) {
    lines.push(`References: ${opts.references}`);
  }

  lines.push('', opts.body);

  return Buffer.from(lines.join('\r\n')).toString('base64url');
}
