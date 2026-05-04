// js/utils.js — Shared helpers

/** Safely traverse nested object by dot-path */
function get(obj, path, fallback) {
    if (fallback === undefined) fallback = null;
    return path.split('.').reduce(function (acc, key) {
        return acc != null && acc[key] !== undefined ? acc[key] : fallback;
    }, obj);
}

/** Format USD currency */
function fmtUSD(v) {
    if (v == null || isNaN(v)) return '—';
    return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format INR currency */
function fmtINR(v) {
    if (v == null || isNaN(v)) return '';
    return '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format number with N decimal places */
function fmtNum(v, d) {
    if (d === undefined) d = 2;
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(d);
}

/** Format large numbers with K/M suffix */
function fmtVolume(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toString();
}

/** Convert timestamp to IST string */
function toIST(ts) {
    return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/** localStorage wrapper with error handling */
var cache = {
    set: function (key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
    },
    get: function (key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
    }
};

/** Clamp number between min and max */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
