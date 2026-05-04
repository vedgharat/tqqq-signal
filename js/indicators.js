// js/indicators.js — Pure-JS technical indicator library
// Each function operates on an array of {time, open, high, low, close, volume} candles.

var Ind = {

    // SMA — Simple Moving Average
    // SMA(i) = (1/period) × Σ close[i-j] for j = 0..period-1
    sma: function (data, period, key) {
        if (!key) key = 'close';
        var n = data.length, out = new Array(n).fill(null);
        if (n < period) return out;
        var sum = 0;
        for (var i = 0; i < period; i++) sum += data[i][key];
        out[period - 1] = sum / period;
        for (var i = period; i < n; i++) {
            sum += data[i][key] - data[i - period][key];
            out[i] = sum / period;
        }
        return out;
    },

    // EMA — Exponential Moving Average
    // k = 2 / (period + 1);  EMA(i) = close(i)*k + EMA(i-1)*(1-k)
    // Seeded with SMA of first `period` values.
    ema: function (data, period, key) {
        if (!key) key = 'close';
        var n = data.length, out = new Array(n).fill(null);
        if (n < period) return out;
        var k = 2 / (period + 1);
        var sum = 0;
        for (var i = 0; i < period; i++) sum += data[i][key];
        out[period - 1] = sum / period;
        for (var i = period; i < n; i++) {
            out[i] = data[i][key] * k + out[i - 1] * (1 - k);
        }
        return out;
    },

    // EMA over a raw number array (used for MACD signal line)
    // Skips leading nulls; seeds with SMA of first `period` valid values.
    emaArray: function (arr, period) {
        var n = arr.length, out = new Array(n).fill(null);
        // Find first contiguous run of `period` non-null values
        var start = -1, cnt = 0;
        for (var i = 0; i < n; i++) {
            if (arr[i] != null) {
                if (start < 0) start = i;
                cnt++;
                if (cnt === period) break;
            } else {
                start = -1; cnt = 0;
            }
        }
        if (cnt < period) return out;
        var seedEnd = start + period - 1;
        var sum = 0;
        for (var i = start; i <= seedEnd; i++) sum += arr[i];
        out[seedEnd] = sum / period;
        var k = 2 / (period + 1);
        for (var i = seedEnd + 1; i < n; i++) {
            if (arr[i] == null) continue;
            if (out[i - 1] == null) { out[i] = arr[i]; continue; }
            out[i] = arr[i] * k + out[i - 1] * (1 - k);
        }
        return out;
    },

    // RSI — Relative Strength Index (Wilder smoothing)
    // RS = avgGain / avgLoss;  RSI = 100 - 100/(1+RS)
    rsi: function (data, period) {
        if (!period) period = 14;
        var n = data.length, out = new Array(n).fill(null);
        if (n < period + 1) return out;
        var gains = 0, losses = 0;
        for (var i = 1; i <= period; i++) {
            var d = data[i].close - data[i - 1].close;
            if (d > 0) gains += d; else losses -= d;
        }
        var ag = gains / period, al = losses / period;
        out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
        for (var i = period + 1; i < n; i++) {
            var d = data[i].close - data[i - 1].close;
            ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
            al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
            out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
        }
        return out;
    },

    // MACD (12, 26, 9)
    // MACD Line = EMA(fast) - EMA(slow)
    // Signal    = EMA(MACD Line, sig)
    // Histogram = MACD - Signal
    macd: function (data, fast, slow, sig) {
        if (!fast) fast = 12; if (!slow) slow = 26; if (!sig) sig = 9;
        var n = data.length;
        var emaF = this.ema(data, fast);
        var emaS = this.ema(data, slow);
        var line = new Array(n).fill(null);
        for (var i = 0; i < n; i++) {
            if (emaF[i] != null && emaS[i] != null) line[i] = emaF[i] - emaS[i];
        }
        var signal = this.emaArray(line, sig);
        var hist = new Array(n).fill(null);
        for (var i = 0; i < n; i++) {
            if (line[i] != null && signal[i] != null) hist[i] = line[i] - signal[i];
        }
        return { line: line, signal: signal, hist: hist };
    },

    // Bollinger Bands (period=20, mult=2)
    // Middle = SMA;  Upper/Lower = Middle ± mult × σ
    bollinger: function (data, period, mult) {
        if (!period) period = 20; if (!mult) mult = 2;
        var mid = this.sma(data, period);
        var n = data.length;
        var upper = new Array(n).fill(null);
        var lower = new Array(n).fill(null);
        for (var i = period - 1; i < n; i++) {
            var ss = 0;
            for (var j = 0; j < period; j++) {
                var diff = data[i - j].close - mid[i];
                ss += diff * diff;
            }
            var sd = Math.sqrt(ss / period);
            upper[i] = mid[i] + mult * sd;
            lower[i] = mid[i] - mult * sd;
        }
        return { mid: mid, upper: upper, lower: lower };
    },

    // ATR — Average True Range (Wilder smoothing)
    // TR = max(H-L, |H-prevC|, |L-prevC|)
    atr: function (data, period) {
        if (!period) period = 14;
        var n = data.length, out = new Array(n).fill(null);
        if (n < period + 1) return out;
        var tr = [data[0].high - data[0].low];
        for (var i = 1; i < n; i++) {
            tr[i] = Math.max(
                data[i].high - data[i].low,
                Math.abs(data[i].high - data[i - 1].close),
                Math.abs(data[i].low  - data[i - 1].close)
            );
        }
        var sum = 0;
        for (var i = 0; i < period; i++) sum += tr[i];
        out[period - 1] = sum / period;
        for (var i = period; i < n; i++) {
            out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
        }
        return out;
    },

    // Stochastic Oscillator (%K smoothed, %D)
    // Raw %K = (C - LL) / (HH - LL) × 100 over kPeriod
    // Slow %K = SMA(Raw %K, dPeriod)  — only over valid region
    // %D = SMA(Slow %K, dPeriod)      — only over valid region
    stochastic: function (data, kP, dP) {
        if (!kP) kP = 14; if (!dP) dP = 3;
        var n = data.length;

        // Step 1: Raw %K
        var rawK = new Array(n).fill(null);
        for (var i = kP - 1; i < n; i++) {
            var hi = -Infinity, lo = Infinity;
            for (var j = 0; j < kP; j++) {
                if (data[i - j].high > hi) hi = data[i - j].high;
                if (data[i - j].low  < lo) lo = data[i - j].low;
            }
            rawK[i] = hi === lo ? 50 : ((data[i].close - lo) / (hi - lo)) * 100;
        }

        // Step 2: Slow %K = SMA of rawK over valid region only
        var firstValid = kP - 1;
        var slowK = new Array(n).fill(null);
        for (var i = firstValid + dP - 1; i < n; i++) {
            var s = 0;
            for (var j = 0; j < dP; j++) s += rawK[i - j];
            slowK[i] = s / dP;
        }

        // Step 3: %D = SMA of slowK over valid region only
        var dStart = firstValid + dP - 1;
        var dLine = new Array(n).fill(null);
        for (var i = dStart + dP - 1; i < n; i++) {
            var s = 0;
            for (var j = 0; j < dP; j++) s += slowK[i - j];
            dLine[i] = s / dP;
        }

        return { k: slowK, d: dLine };
    },

    // Support & Resistance from swing highs/lows
    supportResistance: function (data, lookback) {
        if (!lookback) lookback = 20;
        if (data.length < lookback) return { support: null, resistance: null };
        var s = data.slice(-lookback);
        var sup = Infinity, res = -Infinity;
        for (var i = 0; i < s.length; i++) {
            if (s[i].low  < sup) sup = s[i].low;
            if (s[i].high > res) res = s[i].high;
        }
        return { support: sup, resistance: res };
    },

    // 52-Week High / Low (up to 252 trading days)
    week52HighLow: function (data) {
        var n = Math.min(data.length, 252);
        var slice = data.slice(-n);
        var hi = -Infinity, lo = Infinity;
        for (var i = 0; i < slice.length; i++) {
            if (slice[i].high > hi) hi = slice[i].high;
            if (slice[i].low  < lo) lo = slice[i].low;
        }
        return { high: hi, low: lo };
    },

    // Candlestick Pattern Detection (last candle)
    candlePattern: function (data) {
        if (data.length < 3) return null;
        var c = data[data.length - 1];
        var p = data[data.length - 2];
        var body  = Math.abs(c.close - c.open);
        var range = c.high - c.low;
        if (range === 0) return null;
        var lowerShadow = Math.min(c.open, c.close) - c.low;
        var upperShadow = c.high - Math.max(c.open, c.close);
        var bodyRatio = body / range;

        if (lowerShadow > body * 2 && upperShadow < body * 0.5 && bodyRatio < 0.35)
            return { name: 'Hammer', bias: 'BULLISH' };
        if (p.close < p.open && c.close > c.open && c.open <= p.close && c.close >= p.open)
            return { name: 'Bullish Engulfing', bias: 'BULLISH' };
        if (p.close > p.open && c.close < c.open && c.open >= p.close && c.close <= p.open)
            return { name: 'Bearish Engulfing', bias: 'BEARISH' };
        if (bodyRatio < 0.08)
            return { name: 'Doji', bias: 'NEUTRAL' };
        if (upperShadow > body * 2 && lowerShadow < body * 0.5 && bodyRatio < 0.35)
            return { name: 'Shooting Star', bias: 'BEARISH' };
        return null;
    },

    // Relative Strength vs QQQ (10-day rolling return ratio)
    relativeStrength: function (tqqq, qqq, window) {
        if (!window) window = 10;
        if (!qqq || qqq.length < window || tqqq.length < window) return null;
        var tRet = (tqqq[tqqq.length - 1].close - tqqq[tqqq.length - window].close) / tqqq[tqqq.length - window].close;
        var qRet = (qqq[qqq.length - 1].close   - qqq[qqq.length - window].close)   / qqq[qqq.length - window].close;
        if (qRet === 0) return null;
        return tRet / qRet;
    }
};
