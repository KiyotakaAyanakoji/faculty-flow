import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { sanitizeErrorMessage, sanitizeHeader } from './sanitizer.js';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isTransient?: boolean;
}

export interface EmailTransport {
  send(options: SendMailOptions): Promise<SendMailResult>;
  verify?(): Promise<boolean>;
}

/**
 * Production SMTP transport using Nodemailer
 */
export class SmtpEmailTransport implements EmailTransport {
  private transporter: Transporter;
  private defaultFrom: string;

  constructor(options?: { host?: string; port?: number; secure?: boolean; fromEmail?: string; fromName?: string }) {
    const host = options?.host || env.SMTP_HOST;
    if (!host) {
      throw new Error('Invalid SMTP configuration: SMTP_HOST must be provided when EMAIL_ENABLED is true.');
    }

    const transportConfig: any = {
      host,
      port: options?.port ?? env.SMTP_PORT,
      secure: options?.secure ?? env.SMTP_SECURE,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    };

    if (env.SMTP_USER || env.SMTP_PASS) {
      transportConfig.auth = {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      };
    }

    this.transporter = nodemailer.createTransport(transportConfig);
    this.defaultFrom = options?.fromEmail || env.SMTP_FROM || 'Faculty Flow <noreply@facultyflow.local>';
  }

  async send(options: SendMailOptions): Promise<SendMailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: options.from || this.defaultFrom,
        to: sanitizeHeader(options.to),
        subject: sanitizeHeader(options.subject),
        html: options.html,
        text: options.text,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err);
      // Determine if error is transient (e.g. connection timeout, rate limit 421/450/451)
      const isTransient =
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ESOCKET' ||
        (err?.responseCode && err.responseCode >= 400 && err.responseCode < 500);

      return {
        success: false,
        error: sanitized,
        isTransient: Boolean(isTransient),
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      return await this.transporter.verify();
    } catch {
      return false;
    }
  }
}

/**
 * Development & Disabled email transport
 * Safely logs sanitized notification previews without sending actual emails or leaking credentials.
 */
export class DevEmailTransport implements EmailTransport {
  async send(options: SendMailOptions): Promise<SendMailResult> {
    const sanitizedTo = options.to.replace(/(?<=.{2}).(?=.*@)/g, '*');
    console.log(
      `[Email DevMode] Notification logged | To: ${sanitizedTo} | Subject: "${options.subject}"`
    );

    return {
      success: true,
      messageId: `dev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
  }

  async verify(): Promise<boolean> {
    return true;
  }
}

/**
 * Mock email transport for automated test isolation
 */
export class MockEmailTransport implements EmailTransport {
  public sentMessages: SendMailOptions[] = [];
  public failNextWithTransient: boolean = false;
  public failPermanently: boolean = false;
  public failureMessage: string = 'Simulated SMTP connection timeout';

  async send(options: SendMailOptions): Promise<SendMailResult> {
    if (this.failPermanently) {
      return {
        success: false,
        error: sanitizeErrorMessage(this.failureMessage),
        isTransient: false,
      };
    }

    if (this.failNextWithTransient) {
      this.failNextWithTransient = false;
      return {
        success: false,
        error: sanitizeErrorMessage(this.failureMessage),
        isTransient: true,
      };
    }

    this.sentMessages.push({ ...options });
    return {
      success: true,
      messageId: `mock-${Date.now()}-${this.sentMessages.length}`,
    };
  }

  async verify(): Promise<boolean> {
    return true;
  }

  clear(): void {
    this.sentMessages = [];
    this.failNextWithTransient = false;
    this.failPermanently = false;
  }
}

// Global active transport instance
let activeTransport: EmailTransport | null = null;

export function getEmailTransport(): EmailTransport {
  if (activeTransport) {
    return activeTransport;
  }

  if (env.EMAIL_ENABLED) {
    activeTransport = new SmtpEmailTransport();
  } else {
    activeTransport = new DevEmailTransport();
  }

  return activeTransport;
}

/**
 * Allows test suites or custom runners to inject a mock or custom transport
 */
export function setEmailTransport(transport: EmailTransport | null): void {
  activeTransport = transport;
}
