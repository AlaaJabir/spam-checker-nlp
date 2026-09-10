export interface TestSendResult {
  provider: string;
  status: 'sent' | 'failed' | 'not_configured' | 'disabled';
  messageId?: string;
  details?: string;
  recipient?: string;
  timestamp: string;
}

export interface MailboxResult {
  provider: string;
  status: 'inbox' | 'spam' | 'missing' | 'pending' | 'not_configured' | 'disabled';
  placementRate?: number;
  spfPassed?: boolean;
  dkimPassed?: boolean;
  dmarcPassed?: boolean;
  details?: string;
}

export interface SeedMailboxProvider {
  name: string;
  displayName: string;
  sendTest(message: { subject: string; html: string; fromEmail?: string; recipient?: string }): Promise<TestSendResult>;
  getResult?(messageId: string): Promise<MailboxResult>;
  isConfigured(): boolean;
  isEnabled?(): boolean;
}
