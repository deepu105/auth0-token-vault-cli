export interface EmailHeader {
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
  labelIds: string[];
}

export interface EmailFull {
  id: string;
  threadId: string;
  headers: EmailHeader;
  body: string;
  labelIds: string[];
  attachments: AttachmentMeta[];
}

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface SearchResult {
  messages: EmailSummary[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface DraftSummary {
  id: string;
  messageId: string;
  subject: string;
  to: string;
  snippet: string;
}

export interface LabelInfo {
  id: string;
  name: string;
  type: string;
  messagesTotal?: number;
  messagesUnread?: number;
}
