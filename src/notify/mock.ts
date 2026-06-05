import type { ChannelConfig, FormattedAlert, Notifier, SendResult } from "../types.js";

/**
 * Collects "sent" messages in memory instead of calling a provider. Used by
 * tests to assert the pipeline delivered the right content, and usable as a
 * generic dry-run channel.
 */
export class MockNotifier implements Notifier {
  readonly live = false;
  readonly sent: Array<{ to: string[]; text: string; alert: FormattedAlert }> = [];

  constructor(readonly channel = "mock") {}

  async send(alert: FormattedAlert, cfg: ChannelConfig): Promise<SendResult> {
    this.sent.push({ to: cfg.to, text: alert.text, alert });
    return { status: "sent", detail: `mock#${this.sent.length}` };
  }
}
