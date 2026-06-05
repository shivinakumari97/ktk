import type { ChannelConfig, FormattedAlert, Notifier, SendResult } from "../types.js";
import { env } from "../config/env.js";
import { clampSms, getTwilioClient } from "./twilio-client.js";

/**
 * SMS via Twilio. Because multi-point alerts are long, pair this with a
 * "compact" channel format (headline + why + link) for SMS, or accept a long
 * concatenated message. When credentials/from-number are missing it logs what
 * it would send and reports a "skipped" status.
 */
export class TwilioSmsNotifier implements Notifier {
  readonly channel = "sms";
  readonly live: boolean;

  constructor() {
    this.live = !!getTwilioClient() && !!env.twilioSmsFrom;
  }

  async send(alert: FormattedAlert, cfg: ChannelConfig): Promise<SendResult> {
    const client = getTwilioClient();
    if (!client || !env.twilioSmsFrom) {
      console.log(`[sms:mock] -> ${cfg.to.join(", ")}\n${alert.text}\n`);
      return { status: "skipped", detail: "twilio sms not configured (mock log)" };
    }
    const body = clampSms(alert.text);
    try {
      const ids: string[] = [];
      for (const to of cfg.to) {
        const msg = await client.messages.create({ from: env.twilioSmsFrom, to, body });
        ids.push(msg.sid);
      }
      return { status: "sent", detail: ids.join(",") };
    } catch (err: any) {
      return { status: "failed", detail: err?.message ?? String(err) };
    }
  }
}
