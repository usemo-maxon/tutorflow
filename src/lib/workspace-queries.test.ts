import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  appDataOptions,
  bookingsOptions,
  financeOptions,
  materialsOptions,
} from "./workspace-queries";

const clients: QueryClient[] = [];
function client() {
  const result = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
  clients.push(result);
  return result;
}

afterEach(() => {
  clients.forEach((item) => item.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

describe("workspace navigation cache", () => {
  it("opens a warmed page without another request", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ students: [] }));
    vi.stubGlobal("fetch", fetch);
    const cache = client();
    const options = financeOptions("teacher-a");
    await cache.prefetchQuery(options);
    const observer = new QueryObserver(cache, options);
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().isPending).toBe(false);
    expect(observer.getCurrentResult().data).toEqual({ students: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("deduplicates a hover, background warmup, and navigation in flight", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const cache = client();
    const options = bookingsOptions("teacher-a");
    const warm = cache.prefetchQuery(options);
    const hover = cache.prefetchQuery(options);
    const page = cache.fetchQuery(options);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(Response.json([]));
    await Promise.all([warm, hover, page]);
    expect(cache.getQueryData(options.queryKey)).toEqual([]);
  });

  it("keeps accounts, material filters, and calendar ranges separate", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({ items: [] })));
    vi.stubGlobal("fetch", fetch);
    const cache = client();
    await cache.fetchQuery(materialsOptions("teacher-a"));
    expect(
      cache.getQueryData(materialsOptions("teacher-b").queryKey),
    ).toBeUndefined();
    expect(
      cache.getQueryData(materialsOptions("teacher-a", "q=algebra").queryKey),
    ).toBeUndefined();
    expect(
      appDataOptions("a", { start: "1", end: "2" }, "calendar").queryKey,
    ).not.toEqual(
      appDataOptions("a", { start: "2", end: "3" }, "calendar").queryKey,
    );
  });

  it("refetches invalidated data even within the freshness window", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json([])));
    vi.stubGlobal("fetch", fetch);
    const cache = client();
    const options = bookingsOptions("teacher-a");
    await cache.prefetchQuery(options);
    await cache.invalidateQueries({ queryKey: ["new-bookings", "teacher-a"] });
    await cache.fetchQuery(options);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not poison navigation after a failed background request", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "Temporarily unavailable" }, { status: 503 }),
      )
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetch);
    const cache = client();
    const options = bookingsOptions("teacher-a");
    await cache.prefetchQuery(options);
    expect(await cache.fetchQuery(options)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
