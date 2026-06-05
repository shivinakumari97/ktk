import type { ChannelConfig, FormattedAlert, Notifier, SendResult } from "../types.js";
import { env } from "../config/env.js";
import { getTwilioClient } from "./twilio-client.js";

/**
 * WhatsApp via Twilio — the preferred channel for the full multi-point alert.
 *
 * ⚠️ SETUP REQUIRED for proactive (business-initiated) WhatsApp messages:
 *   1. A registered WhatsApp sender (TWILIO_WHATSAPP_FROM), e.g. the Twilio
 *      sandbox number for testing, or an approved business sender for prod.
 *   2. For messages OUTSIDE the 24-hour customer-service window, WhatsApp
 *      requires a pre-approved MESSAGE TEMPLATE; free-form text will be rejected.
 *      The sandbox is fine for testing; production needs template approval.
 *
 * This notifier sends free-form text (works in sandbox / within the 24h window)
 * and is stubbed to degrade to a log when unconfigured. Template support is a
 * clean extension point (see `sendTemplate` note below).
 */
export class TwilioWhatsAppNotifier implements Notifier {
  readonly channel = "whatsapp";
  readonly live: boolean;

  constructor() {
    this.live = !!getTwilioClient() && !!env.twilioWhatsappFrom;
  }

  async send(alert: FormattedAlert, cfg: ChannelConfig): Promise<SendResult> {
    const client = getTwilioClient();
    if (!client || !env.twilioWhatsappFrom) {
      console.log(`[whatsapp:mock] -> ${cfg.to.join(", ")}\n${alert.text}\n`);
      return {
        status: "skipped",
        detail: "twilio whatsapp not configured — needs registered sender + approved template",
      };
    }
    try {
      const ids: string[] = [];
      for (const to of cfg.to) {
        const msg = await client.messages.create({
          from: ensureWhatsApp(env.twilioWhatsappFrom),
          to: ensureWhatsApp(to),
          body: alert.text,
          // To send outside the 24h window, replace `body` with an approved
          // template via `contentSid` + `contentVariables`. Left as a stub
          // because it requires your own approved template id.
        });
        ids.push(msg.sid);
      }
      return { status: "sent", detail: ids.join(",") };
    } catch (err: any) {
      return { status: "failed", detail: err?.message ?? String(err) };
    }
  }
}

/** Twilio expects WhatsApp addresses prefixed with "whatsapp:". */
function ensureWhatsApp(addr: string): string {
  return addr.startsWith("whatsapp:") ? addr : `whatsapp:${addr}`;
}
