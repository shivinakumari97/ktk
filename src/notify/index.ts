import { NotifierRegistry } from "../core/registry.js";
import { TwilioSmsNotifier } from "./twilio-sms.js";
import { TwilioWhatsAppNotifier } from "./twilio-whatsapp.js";

/**
 * The one place notification channels are wired up. Adding email/Telegram/Slack
 * later = implement Notifier + add one `.register(...)` line here.
 */
export function buildNotifierRegistry(): NotifierRegistry {
  return new NotifierRegistry()
    .register(new TwilioSmsNotifier())
    .register(new TwilioWhatsAppNotifier());
}
