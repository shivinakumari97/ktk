import twilio from "twilio";
import { env } from "../config/env.js";

/**
 * Lazily constructs a shared Twilio client. Returns null when credentials are
 * absent, which lets notifiers fall back to mock/log mode cleanly.
 */
let client: ReturnType<typeof twilio> | null = null;

export function getTwilioClient(): ReturnType<typeof twilio> | null {
  if (!env.twilioAccountSid || !env.twilioAuthToken) return null;
  if (!client) client = twilio(env.twilioAccountSid, env.twilioAuthToken);
  return client;
}

/** SMS bodies over ~1600 chars get rejected; trim with an ellipsis marker. */
export function clampSms(text: string, max = 1500): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}
