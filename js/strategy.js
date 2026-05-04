// js/strategy.js — Scoring engine, Fear & Greed, backtester

var Strategy = {

    computeAll: function (data, qqq) {
        return {
            data: data, rsi: Ind.rsi(data, 14), macd: Ind.macd(data, 12, 26, 9),
            bb: Ind.bollinger(data, 20, 2), ema9: Ind.ema(data, 9), ema21: Ind.ema(data, 21),
            ema50: Ind.ema(data, 50), atr: Ind.atr(data, 14), stoch: Ind.stochastic(data, 14, 3),
            vol20: Ind.sma(data, 20, 'volume'), sr: Ind.supportResistance(data, 20),
            w52: Ind.week52HighLow(data), pattern: Ind.candlePattern(data),
            relStr: Ind.relativeStrength(data, qqq, 10)
        };
    },

    /**
     * Improved composite signal scoring.
     * Each indicator → fractional score 0.0 (bearish) to 1.0 (bullish) × weight.
     * Weights sum to 100. VIX is now included as a first-class factor.
     * Missing indicators are skipped and weights redistributed.
     */
    evaluate: function (comp, idx, vixData) {
        var d = comp.data;
        if (idx === undefined) idx = d.length - 1;
        if (idx < 1) return this._empty('Not enough data.');

        var c = d[idx], prev = d[idx - 1], P = c.close;
        var rsi = comp.rsi[idx], mH = comp.macd.hist[idx], mL = comp.macd.line[idx];
        var mS = comp.macd.signal[idx], bbU = comp.bb.upper[idx], bbL = comp.bb.lower[idx];
        var e9 = comp.ema9[idx], e21 = comp.ema21[idx], e50 = comp.ema50[idx];
        var stK = comp.stoch.k[idx], stD = comp.stoch.d[idx];
        var vol = c.volume, v20 = comp.vol20[idx];
        var atr = comp.atr[idx];
        var sr = Ind.supportResistance(d.slice(0, idx + 1), Math.min(20, idx));
        var prevH = idx > 0 ? comp.macd.hist[idx - 1] : null;

        var parts = [], reasons = [];

        // ── RSI (wt 15) — mean-reversion focus ──
        if (rsi != null) {
            var f;
            if      (rsi <= 20) { f = 1.0; reasons.push('RSI deeply oversold (' + fmtNum(rsi) + ')'); }
            else if (rsi <= 30) { f = 0.85; reasons.push('RSI oversold'); }
            else if (rsi <= 40)   f = 0.7;
            else if (rsi <= 50)   f = 0.55;
            else if (rsi <= 60)   f = 0.45;
            else if (rsi <= 70)   f = 0.3;
            else if (rsi <= 80) { f = 0.15; reasons.push('RSI overbought (' + fmtNum(rsi) + ')'); }
            else                { f = 0.0; reasons.push('RSI extreme overbought'); }
            parts.push({ name: 'RSI (14)', val: fmtNum(rsi), f: f, w: 15, lbl: f >= 0.6 ? 'BUY' : f <= 0.3 ? 'SELL' : 'NEUTRAL' });
        }

        // ── MACD (wt 15) — momentum direction ──
        if (mH != null && mL != null) {
            var f;
            if      (mH > 0 && mL < 0)                          { f = 1.0; reasons.push('MACD bullish cross below zero'); }
            else if (mH > 0 && prevH != null && mH > prevH)       f = 0.8;
            else if (mH > 0)                                       f = 0.65;
            else if (mH < 0 && prevH != null && mH > prevH)       f = 0.45;
            else if (mH < 0 && mL > 0)                           { f = 0.1; reasons.push('MACD bearish above zero'); }
            else                                                    f = 0.2;
            parts.push({ name: 'MACD', val: fmtNum(mH, 3), f: f, w: 15, lbl: f >= 0.6 ? 'BUY' : f <= 0.3 ? 'SELL' : 'NEUTRAL' });
        }

        // ── EMA Ribbon (wt 15) — trend alignment + slope ──
        if (e9 != null && e21 != null) {
            var f;
            var p9 = idx > 3 ? comp.ema9[idx - 3] : null;
            var slopeUp = p9 != null ? e9 > p9 : false;
            if (P > e9 && e9 > e21 && (e50 == null || e21 > e50)) { f = slopeUp ? 1.0 : 0.85; reasons.push('Strong uptrend'); }
            else if (P > e9 && e9 > e21)  f = 0.75;
            else if (P > e21)             f = 0.55;
            else if (e50 != null && P > e50) f = 0.4;
            else if (P < e9 && e9 < e21) { f = 0.1; reasons.push('Downtrend — price below EMAs'); }
            else                           f = 0.3;
            parts.push({ name: 'EMA Ribbon', val: (P > e9 ? '↑' : '↓') + fmtNum(e9, 1), f: f, w: 15, lbl: f >= 0.6 ? 'BUY' : f <= 0.3 ? 'SELL' : 'NEUTRAL' });
        }

        // ── Stochastic (wt 10) ──
        if (stK != null) {
            var f;
            if      (stK < 20 && stD != null && stK > stD) { f = 1.0; reasons.push('Stochastic bullish crossover in oversold'); }
            else if (stK < 20) f = 0.8;
            else if (stK < 40) f = 0.6;
            else if (stK < 60) f = 0.5;
            else if (stK < 80) f = 0.35;
            else if (stK > 80 && stD != null && stK < stD) { f = 0.0; reasons.push('Stochastic bearish in overbought'); }
            else f = 0.15;
            parts.push({ name: 'Stochastic', val: fmtNum(stK, 1), f: f, w: 10, lbl: f >= 0.6 ? 'BUY' : f <= 0.3 ? 'SELL' : 'NEUTRAL' });
        }

        // ── Bollinger %B (wt 10) ──
        if (bbU != null && bbL != null) {
            var bw = bbU - bbL, pos = bw > 0 ? (P - bbL) / bw : 0.5;
            var f;
            if      (pos <= 0.05) { f = 1.0; reasons.push('Price at lower BB'); }
            else if (pos <= 0.2) f = 0.85;
            else if (pos <= 0.4) f = 0.6;
            else if (pos <= 0.6) f = 0.5;
            else if (pos <= 0.8) f = 0.35;
            else if (pos >= 0.95) { f = 0.0; reasons.push('Price at upper BB'); }
            else f = 0.2;
            parts.push({ name: 'Bollinger', val: fmtNum(pos * 100, 0) + '%', f: f, w: 10, lbl: f >= 0.6 ? 'BUY' : f <= 0.3 ? 'SELL' : 'NEUTRAL' });
        }

        // ── Volume (wt 10) ──
        if (v20 != null && v20 > 0) {
            var vr = vol / v20, up = P > prev.close, f;
            if      (vr > 1.5 && up)  { f = 1.0; reasons.push('Strong volume surge on up-day'); }
            else if (vr > 1.2 && up)    f = 0.75;
            else if (vr > 1.0 && up)    f = 0.6;
            else if (vr < 0.6)          f = 0.4;
            else if (vr > 1.2 && !up) { f = 0.1; reasons.push('Heavy selling volume'); }
            else                        f = 0.5;
            parts.push({ name: 'Volume', val: fmtNum(vr, 2) + 'x', f: f, w: 10, lbl: f >= 0.6 ? 'BUY' : f <= 0.3 ? 'SELL' : 'NEUTRAL' });
        }

        // ── VIX Context (wt 10) — critical for 3x leveraged ETFs ──
        if (vixData && vixData.length > 0) {
            var vixClose = vixData[vixData.length - 1].close, f;
            if      (vixClose < 14) { f = 0.9; reasons.push('VIX very low — favorable for leverage'); }
            else if (vixClose < 18)   f = 0.7;
            else if (vixClose < 22)   f = 0.5;
            else if (vixClose < 28) { f = 0.25; reasons.push('Elevated VIX — caution with 3x'); }
            else                    { f = 0.05; reasons.push('VIX extreme (' + fmtNum(vixClose,1) + ') — avoid leveraged ETFs'); }
            parts.push({ name: 'VIX', val: fmtNum(vixClose, 1), f: f, w: 10, lbl: f >= 0.6 ? 'BUY' : f <= 0.3 ? 'SELL' : 'NEUTRAL' });
        }

        // ── Support/Resistance (wt 5) ──
        if (sr.support != null && sr.resistance != null) {
            var rng = sr.resistance - sr.support, f = 0.5;
            if (rng > 0) { var p = (P - sr.support) / rng; f = p < 0.2 ? 0.9 : p > 0.8 ? 0.1 : 0.5; }
            parts.push({ name: 'S/R', val: fmtNum(sr.support, 1) + '–' + fmtNum(sr.resistance, 1), f: f, w: 5, lbl: f >= 0.6 ? 'BUY' : f <= 0.3 ? 'SELL' : 'NEUTRAL' });
        }

        // ── QQQ Relative Strength (wt 5) ──
        if (comp.relStr != null) {
            var f = comp.relStr > 1.2 ? 0.9 : comp.relStr > 1.0 ? 0.65 : comp.relStr > 0.8 ? 0.4 : 0.15;
            parts.push({ name: 'QQQ RS', val: fmtNum(comp.relStr, 2), f: f, w: 5, lbl: f >= 0.6 ? 'BUY' : f <= 0.3 ? 'SELL' : 'NEUTRAL' });
        }

        if (!parts.length) return this._empty('No indicators available.');

        // Weighted score (normalized)
        var rawS = 0, wS = 0;
        for (var i = 0; i < parts.length; i++) { rawS += parts[i].f * parts[i].w; wS += parts[i].w; }
        var score = clamp(Math.round((rawS / wS) * 100), 0, 100);

        var label = score >= 80 ? 'STRONG BUY' : score >= 65 ? 'BUY' : score >= 50 ? 'WAIT' : score >= 35 ? 'CAUTION' : 'AVOID';
        var reason = reasons.length ? reasons.slice(0, 3).join(' · ') : 'Indicators are mixed.';

        return { score: score, label: label, reason: reason, components: parts, snapshot: { price: P, atr: atr, sr: sr } };
    },

    _empty: function (msg) { return { score: 0, label: 'NO DATA', reason: msg, components: [], snapshot: null }; },

    /**
     * Fear & Greed composite (0 = extreme fear, 100 = extreme greed).
     * Built from: VIX (40%), RSI (25%), Price vs EMA50 (20%), BB width (15%)
     */
    fearGreed: function (comp, vixData) {
        var n = comp.data.length - 1, parts = [], wSum = 0;

        // VIX (40%) — inverted: low VIX = greed
        if (vixData && vixData.length) {
            var v = vixData[vixData.length - 1].close;
            var s = v < 12 ? 95 : v < 15 ? 80 : v < 18 ? 65 : v < 22 ? 45 : v < 28 ? 25 : v < 35 ? 10 : 3;
            parts.push(s * 40); wSum += 40;
        }

        // RSI (25%)
        var rsi = comp.rsi[n];
        if (rsi != null) {
            parts.push(rsi * 25 / 100 * 100); // RSI 0-100 maps to fear-greed
            wSum += 25;
        }

        // Price vs EMA50 (20%)
        var e50 = comp.ema50[n];
        if (e50 != null) {
            var pDist = (comp.data[n].close - e50) / e50 * 100;
            var s = pDist > 15 ? 95 : pDist > 8 ? 80 : pDist > 3 ? 65 : pDist > -3 ? 50 : pDist > -8 ? 35 : pDist > -15 ? 20 : 5;
            parts.push(s * 20); wSum += 20;
        }

        // BB Width (15%) — narrow = complacency/greed
        var bbU = comp.bb.upper[n], bbL = comp.bb.lower[n];
        if (bbU != null && bbL != null) {
            var w = (bbU - bbL) / comp.data[n].close * 100;
            var s = w < 3 ? 80 : w < 6 ? 65 : w < 10 ? 50 : w < 15 ? 35 : 15;
            parts.push(s * 15); wSum += 15;
        }

        if (!wSum) return { score: 50, label: 'Neutral', color: '#facc15' };
        var fg = Math.round(parts.reduce(function (a, b) { return a + b; }, 0) / wSum);
        fg = clamp(fg, 0, 100);

        var label, color;
        if      (fg <= 20) { label = 'Extreme Fear'; color = '#ef4444'; }
        else if (fg <= 40) { label = 'Fear'; color = '#f97316'; }
        else if (fg <= 60) { label = 'Neutral'; color = '#facc15'; }
        else if (fg <= 80) { label = 'Greed'; color = '#84cc16'; }
        else               { label = 'Extreme Greed'; color = '#22c55e'; }

        return { score: fg, label: label, color: color };
    },

    /** Detect Golden/Death crosses and other crossover alerts */
    detectCrossovers: function (comp) {
        var alerts = [], n = comp.data.length;
        if (n < 3) return alerts;

        var i = n - 1, j = n - 2;
        // EMA 9/21 cross
        if (comp.ema9[i] != null && comp.ema21[i] != null && comp.ema9[j] != null && comp.ema21[j] != null) {
            if (comp.ema9[j] <= comp.ema21[j] && comp.ema9[i] > comp.ema21[i])
                alerts.push({ type: 'bull', text: '🟢 EMA 9/21 Golden Cross', detail: 'Short-term trend turning bullish' });
            if (comp.ema9[j] >= comp.ema21[j] && comp.ema9[i] < comp.ema21[i])
                alerts.push({ type: 'bear', text: '🔴 EMA 9/21 Death Cross', detail: 'Short-term trend turning bearish' });
        }
        // EMA 21/50 cross
        if (comp.ema21[i] != null && comp.ema50[i] != null && comp.ema21[j] != null && comp.ema50[j] != null) {
            if (comp.ema21[j] <= comp.ema50[j] && comp.ema21[i] > comp.ema50[i])
                alerts.push({ type: 'bull', text: '🟢 EMA 21/50 Golden Cross', detail: 'Medium-term trend reversal' });
            if (comp.ema21[j] >= comp.ema50[j] && comp.ema21[i] < comp.ema50[i])
                alerts.push({ type: 'bear', text: '🔴 EMA 21/50 Death Cross', detail: 'Medium-term breakdown' });
        }
        // RSI exits oversold/overbought
        var rsi = comp.rsi[i], rsiP = comp.rsi[j];
        if (rsi != null && rsiP != null) {
            if (rsiP < 30 && rsi >= 30) alerts.push({ type: 'bull', text: '📈 RSI exiting oversold', detail: 'Momentum recovery signal' });
            if (rsiP > 70 && rsi <= 70) alerts.push({ type: 'bear', text: '📉 RSI exiting overbought', detail: 'Momentum fading' });
        }
        // MACD cross
        var ml = comp.macd.line[i], ms = comp.macd.signal[i], mlP = comp.macd.line[j], msP = comp.macd.signal[j];
        if (ml != null && ms != null && mlP != null && msP != null) {
            if (mlP <= msP && ml > ms) alerts.push({ type: 'bull', text: '🟢 MACD bullish crossover' });
            if (mlP >= msP && ml < ms) alerts.push({ type: 'bear', text: '🔴 MACD bearish crossover' });
        }

        if (!alerts.length) alerts.push({ type: 'info', text: 'No crossover events detected today' });
        return alerts;
    },

    /** Walk-forward backtest returning trade log + stats + equity */
    backtest: function (comp, threshold) {
        if (!threshold) threshold = 55;
        var d = comp.data, n = d.length;
        if (n < 60) return { trades: [], equity: [10000], stats: this._emptyStats() };

        var trades = [], eq = [10000], bal = 10000, peak = bal, maxDD = 0;
        var inTrade = false, entry = 0, entryIdx = 0, sl = 0, tp = 0;

        for (var i = 50; i < n - 1; i++) {
            var sig = this.evaluate(comp, i);
            var nxt = d[i + 1];
            if (!inTrade && sig.score >= threshold) {
                inTrade = true; entry = nxt.open; entryIdx = i + 1;
                var a = comp.atr[i] || (d[i].high - d[i].low);
                sl = entry - a * 2; tp = entry + a * 4;
            } else if (inTrade) {
                var exitP = null, exitT = '';
                if      (nxt.low  <= sl) { exitP = sl; exitT = 'SL'; }
                else if (nxt.high >= tp) { exitP = tp; exitT = 'TP'; }
                else if (sig.score < 40) { exitP = nxt.close; exitT = 'SIG'; }
                if (exitP != null) {
                    var pnl = (exitP - entry) / entry;
                    bal *= (1 + pnl);
                    trades.push({
                        entryDate: new Date(d[entryIdx].time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
                        entry: entry, exit: exitP, type: exitT, pnl: pnl
                    });
                    inTrade = false;
                }
            }
            eq.push(bal);
            if (bal > peak) peak = bal;
            var dd = peak > 0 ? (peak - bal) / peak : 0;
            if (dd > maxDD) maxDD = dd;
        }

        var w = trades.filter(function (t) { return t.pnl > 0; });
        var l = trades.filter(function (t) { return t.pnl <= 0; });
        var avgW = w.length ? w.reduce(function (s, t) { return s + t.pnl; }, 0) / w.length : 0;
        var avgL = l.length ? l.reduce(function (s, t) { return s + Math.abs(t.pnl); }, 0) / l.length : 0;
        var gW = w.reduce(function (s, t) { return s + t.pnl; }, 0);
        var gL = l.reduce(function (s, t) { return s + Math.abs(t.pnl); }, 0);

        return {
            trades: trades, equity: eq,
            stats: { total: trades.length, winRate: trades.length ? w.length / trades.length * 100 : 0, avgWin: avgW * 100, avgLoss: avgL * 100, pf: gL > 0 ? gW / gL : gW > 0 ? 999 : 0, maxDD: maxDD * 100 }
        };
    },

    _emptyStats: function () { return { total: 0, winRate: 0, avgWin: 0, avgLoss: 0, pf: 0, maxDD: 0 }; }
};
