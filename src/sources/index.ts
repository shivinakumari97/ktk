import { SourceRegistry } from "../core/registry.js";
import { mockSourceFactory } from "./mock.js";
import { rssSourceFactory } from "./rss.js";
import { newsApiSourceFactory } from "./newsapi.js";
import { diprSourceFactory } from "./dipr.js";

/**
 * The one place sources are wired up. Adding a new source type = write the
 * module + add one `.register(...)` line here. Core never imports concrete
 * sources directly.
 */
export function buildSourceRegistry(): SourceRegistry {
  return new SourceRegistry()
    .register("mock", mockSourceFactory)
    .register("rss", rssSourceFactory)
    .register("newsapi", newsApiSourceFactory)
    .register("dipr", diprSourceFactory);
}
