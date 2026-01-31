import { CONFIG } from "../config.js";

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseIntervalMinutes(interval) {
  if (typeof interval === "number" && Number.isFinite(interval)) return interval;
  const m = String(interval || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function pickResultKey(result) {
  if (!result || typeof result !== "object") return null;
  return Object.keys(result).find((k) => k !== "last") || null;
}

export async function fetchKlines({ interval, limit } = {}) {
  const intervalMinutes = parseIntervalMinutes(interval) ?? CONFIG.candleWindowMinutes;
  const url = new URL("/0/public/OHLC", CONFIG.krakenBaseUrl);
  url.searchParams.set("pair", CONFIG.krakenPair);
  url.searchParams.set("interval", String(intervalMinutes));

  if (limit && Number.isFinite(limit)) {
    const since = Math.floor(Date.now() / 1000) - (Number(limit) * intervalMinutes * 60);
    url.searchParams.set("since", String(since));
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Kraken OHLC error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (data?.error?.length) {
    throw new Error(`Kraken OHLC error: ${data.error.join(", ")}`);
  }

  const key = pickResultKey(data.result);
  const rows = key ? data.result[key] : [];
  const trimmed = limit && Number.isFinite(limit) ? rows.slice(-Number(limit)) : rows;

  return trimmed.map((k) => {
    const openTimeSec = Number(k[0]);
    return {
      openTime: openTimeSec * 1000,
      open: toNumber(k[1]),
      high: toNumber(k[2]),
      low: toNumber(k[3]),
      close: toNumber(k[4]),
      volume: toNumber(k[6]),
      closeTime: (openTimeSec + intervalMinutes * 60) * 1000
    };
  });
}

export async function fetchLastPrice() {
  const url = new URL("/0/public/Ticker", CONFIG.krakenBaseUrl);
  url.searchParams.set("pair", CONFIG.krakenPair);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Kraken ticker error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (data?.error?.length) {
    throw new Error(`Kraken ticker error: ${data.error.join(", ")}`);
  }
  const key = pickResultKey(data.result);
  const ticker = key ? data.result[key] : null;
  const price = ticker?.c?.[0];
  return toNumber(price);
}
