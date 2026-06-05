import "dotenv/config";

/** Centralized, typed access to environment configuration. */
function str(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1" || v === "yes";
}

function int(key: string, fallback: number): number {
  const v = parseInt(str(key), 10);
  return Number.isFinite(v) ? v : fallback;
}

function list(key: string): string[] {
  return str(key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  port: int("PORT", 3000),
  databasePath: str("DATABASE_PATH", "./data/ktk.sqlite"),
  tz: str("TZ", "Asia/Kolkata"),
  pollCron: str("POLL_CRON", "*/15 * * * *"),
  schedulerEnabled: bool("SCHEDULER_ENABLED", true),

  anthropicApiKey: str("ANTHROPIC_API_KEY"),
  assessorModel: str("ASSESSOR_MODEL", "claude-haiku-4-5"),
  assessorMaxTokens: int("ASSESSOR_MAX_TOKENS", 1500),

  newsApiKey: str("NEWSAPI_KEY"),
  rssFeeds: list("RSS_FEEDS"),

  twilioAccountSid: str("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: str("TWILIO_AUTH_TOKEN"),
  twilioSmsFrom: str("TWILIO_SMS_FROM"),
  twilioWhatsappFrom: str("TWILIO_WHATSAPP_FROM"),
  alertTo: list("ALERT_TO"),
};

export type Env = typeof env;
