import { appendCsvRow } from "./utils.js";

const PAPER_HEADER = [
  "timestamp",
  "market_slug",
  "side",
  "entry_time",
  "entry_price",
  "price_to_beat",
  "settlement_time",
  "exit_time",
  "exit_price",
  "outcome",
  "payout",
  "pnl",
  "equity",
  "trade_number"
];

export class PaperTrader {
  constructor({ logPath = "./logs/paper_trades.csv" } = {}) {
    this.logPath = logPath;
    this.position = null;
    this.stats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnl: 0,
      equity: 0,
      peakEquity: 0,
      maxDrawdown: 0,
      sumWin: 0,
      sumLoss: 0
    };
  }

  getSummary() {
    const { trades, wins, losses, totalPnl, equity, maxDrawdown, sumWin, sumLoss } = this.stats;
    const winRate = trades > 0 ? wins / trades : 0;
    const avgWin = wins > 0 ? sumWin / wins : 0;
    const avgLoss = losses > 0 ? sumLoss / losses : 0;
    return {
      trades,
      wins,
      losses,
      winRate,
      totalPnl,
      equity,
      maxDrawdown,
      avgWin,
      avgLoss,
      position: this.position
    };
  }

  openPosition({ side, entryPrice, marketSlug, priceToBeat, settlementMs, timestampMs }) {
    if (!side || entryPrice === null || entryPrice === undefined) return null;
    this.position = {
      side,
      entryPrice: Number(entryPrice),
      marketSlug,
      priceToBeat: priceToBeat ?? null,
      settlementMs: settlementMs ?? null,
      entryTimeMs: timestampMs ?? Date.now()
    };
    return this.position;
  }

  closePosition({ exitPrice, exitTimeMs }) {
    if (!this.position) return null;
    const pos = this.position;
    if (pos.priceToBeat === null || pos.priceToBeat === undefined) return null;
    const outcome = exitPrice > pos.priceToBeat ? "UP" : "DOWN"; // down if equal
    const payout = pos.side === outcome ? 1 : 0;
    const pnl = payout - pos.entryPrice;

    this.stats.trades += 1;
    if (pnl >= 0) {
      this.stats.wins += 1;
      this.stats.sumWin += pnl;
    } else {
      this.stats.losses += 1;
      this.stats.sumLoss += pnl;
    }
    this.stats.totalPnl += pnl;
    this.stats.equity += pnl;
    this.stats.peakEquity = Math.max(this.stats.peakEquity, this.stats.equity);
    const dd = this.stats.peakEquity - this.stats.equity;
    this.stats.maxDrawdown = Math.max(this.stats.maxDrawdown, dd);

    appendCsvRow(this.logPath, PAPER_HEADER, [
      new Date().toISOString(),
      pos.marketSlug,
      pos.side,
      new Date(pos.entryTimeMs).toISOString(),
      pos.entryPrice,
      pos.priceToBeat,
      pos.settlementMs ? new Date(pos.settlementMs).toISOString() : "",
      new Date(exitTimeMs ?? Date.now()).toISOString(),
      exitPrice,
      outcome,
      payout,
      pnl,
      this.stats.equity,
      this.stats.trades
    ]);

    this.position = null;
    return { outcome, pnl };
  }

  onSignal({ action, side, marketSlug, priceToBeat, settlementMs, marketUp, marketDown, timestampMs }) {
    if (action !== "ENTER") return null;
    if (this.position) return null;
    if (priceToBeat === null || priceToBeat === undefined) return null;
    const entryPrice = side === "UP" ? marketUp : marketDown;
    if (entryPrice === null || entryPrice === undefined) return null;
    return this.openPosition({
      side,
      entryPrice,
      marketSlug,
      priceToBeat,
      settlementMs,
      timestampMs
    });
  }

  onTick({ marketSlug, currentPrice, nowMs }) {
    if (!this.position) return null;
    if (currentPrice === null || currentPrice === undefined) return null;
    const now = nowMs ?? Date.now();
    const shouldClose = (this.position.settlementMs !== null && now >= this.position.settlementMs)
      || (marketSlug && this.position.marketSlug && marketSlug !== this.position.marketSlug);
    if (!shouldClose) return null;
    return this.closePosition({ exitPrice: currentPrice, exitTimeMs: now });
  }
}
