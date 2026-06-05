import type { Notifier, Source, SourceFactory, SourceRecord, SourceType } from "../types.js";

/**
 * Registries map a `type` string to a concrete implementation. The pipeline
 * only ever talks to these registries, so adding a source or channel is a pure
 * addition — register the factory, no core edits.
 */

export class SourceRegistry {
  private factories = new Map<SourceType, SourceFactory>();

  register(type: SourceType, factory: SourceFactory): this {
    this.factories.set(type, factory);
    return this;
  }

  /** Instantiate live Source objects from enabled records, skipping unknown types. */
  build(records: SourceRecord[]): Source[] {
    const out: Source[] = [];
    for (const rec of records) {
      const factory = this.factories.get(rec.type);
      if (!factory) {
        console.warn(`[registry] no factory for source type "${rec.type}" (${rec.name})`);
        continue;
      }
      try {
        out.push(factory(rec));
      } catch (err) {
        console.warn(`[registry] failed to build source ${rec.name}:`, err);
      }
    }
    return out;
  }
}

export class NotifierRegistry {
  private byChannel = new Map<string, Notifier>();

  register(notifier: Notifier): this {
    this.byChannel.set(notifier.channel, notifier);
    return this;
  }

  get(channel: string): Notifier | undefined {
    return this.byChannel.get(channel);
  }

  all(): Notifier[] {
    return [...this.byChannel.values()];
  }
}
