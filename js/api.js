// js/api.js — Data fetching with multi-proxy fallback + caching

var PROXIES = [
    { name: 'Direct',     wrap: function (u) { return u; } },
    { name: 'CorsProxy',  wrap: function (u) { return 'https://corsproxy.io/?' + encodeURIComponent(u); } },
    { name: 'AllOrigins', wrap: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } }
];

var DataAPI = {
    proxyIdx: 0,
    usdInr: 83.0,

    /** Update the proxy status chip in the header */
    _proxyChip: function (text, ok) {
        var el = document.getElementById('proxyChip');
        if (!el) return;
        el.textContent = text;
        el.style.borderColor = ok ? 'rgba(34,197,94,.3)' : '';
        el.style.color = ok ? 'var(--green)' : '';
    },

    /**
     * Try fetching `url` through each proxy in order.
     * Returns parsed JSON on success, throws on total failure.
     */
    fetchJSON: async function (url) {
        var lastErr = null;
        for (var i = 0; i < PROXIES.length; i++) {
            var p = PROXIES[(this.proxyIdx + i) % PROXIES.length];
            var target = p.wrap(url);
            try {
                this._proxyChip('⏳ ' + p.name + '…', false);
                var resp = await fetch(target, { cache: 'no-store' });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                var json = await resp.json();
                this.proxyIdx = (this.proxyIdx + i) % PROXIES.length;
                this._proxyChip('✓ ' + p.name, true);
                return json;
            } catch (e) {
                lastErr = e;
                console.warn('[API] ' + p.name + ' failed for ' + url.substring(0, 60) + ':', e.message);
            }
        }
        throw new Error('All proxies failed: ' + (lastErr ? lastErr.message : 'unknown'));
    },

    /**
     * Fetch Yahoo Finance chart data for a ticker.
     * Returns array of {time, open, high, low, close, volume}.
     */
    getChart: async function (ticker, range, interval) {
        if (!range)    range = '6mo';
        if (!interval) interval = '1d';
        var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker)
                + '?range=' + range + '&interval=' + interval + '&includePrePost=false';
        var raw = await this.fetchJSON(url);
        return this._parseYahoo(raw, ticker);
    },

    /** Parse Yahoo v8 chart response into clean candle array */
    _parseYahoo: function (data, ticker) {
        var result = get(data, 'chart.result');
        if (!result || !result[0]) throw new Error('Invalid payload for ' + ticker);
        var r = result[0];
        var ts   = r.timestamp;
        var q    = get(r, 'indicators.quote.0');
        if (!ts || !q) throw new Error('Missing quote data for ' + ticker);

        var opens  = q.open   || [];
        var highs  = q.high   || [];
        var lows   = q.low    || [];
        var closes = q.close  || [];
        var vols   = q.volume || [];
        var candles = [];

        for (var i = 0; i < ts.length; i++) {
            // Skip any bar where close is null/undefined
            if (closes[i] == null) continue;
            candles.push({
                time:   ts[i] * 1000,
                open:   opens[i]  != null ? opens[i]  : closes[i],
                high:   highs[i]  != null ? highs[i]  : closes[i],
                low:    lows[i]   != null ? lows[i]   : closes[i],
                close:  closes[i],
                volume: vols[i]   != null ? vols[i]   : 0
            });
        }
        if (candles.length === 0) throw new Error('No valid bars for ' + ticker);
        return candles;
    },

    /** Fetch USD → INR exchange rate */
    getExchangeRate: async function () {
        try {
            var data = await this.fetchJSON('https://api.exchangerate-api.com/v4/latest/USD');
            if (data && data.rates && typeof data.rates.INR === 'number') {
                this.usdInr = data.rates.INR;
            }
        } catch (e) {
            console.warn('[API] USD/INR fetch failed, using fallback ' + this.usdInr);
        }
        var el = document.getElementById('usdInrChip');
        if (el) el.textContent = 'USD/INR ₹' + this.usdInr.toFixed(2);
        return this.usdInr;
    },

    /**
     * Master loader — fetches TQQQ, QQQ, VIX, and USD/INR.
     * Caches successful result; returns cached data on failure.
     */
    loadAll: async function (range) {
        try {
            var results = await Promise.all([
                this.getChart('TQQQ', range),
                this.getChart('QQQ', range).catch(function () { return null; }),
                this.getChart('^VIX', range).catch(function () { return null; }),
                this.getExchangeRate()
            ]);
            var payload = {
                tqqq:      results[0],
                qqq:       results[1],
                vix:       results[2],
                usdInr:    this.usdInr,
                fetchedAt: Date.now()
            };
            cache.set('tqqq_v2', payload);
            return payload;
        } catch (err) {
            console.error('[API] loadAll failed:', err);
            var cached = cache.get('tqqq_v2');
            if (cached && cached.tqqq) {
                this._proxyChip('⚠ Cached Data', false);
                return cached;
            }
            throw err;
        }
    }
};
