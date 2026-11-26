// Table-safety helpers: a gentle chat filter for young players.
const WORDS = ['fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'piss', 'slut', 'whore', 'fag', 'nigg', 'retard', 'damn', 'crap', 'douche', 'wanker', 'twat', 'cock', 'pussy', 'tits', 'boob', 'porn', 'sex', 'rape', 'kill yourself', 'kys'];
const RE = new RegExp('(' + WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')[a-z]*', 'gi');
function clean(c, text) {
  const on = !c.safety || c.safety.filter !== false;
  if (!on) return text;
  return String(text).replace(RE, (m) => m[0] + '★'.repeat(Math.max(2, m.length - 1)));
}
function defaults(o = {}) { return { level: o.level === 'family' ? 'family' : 'teen', filter: o.filter !== false, lines: Array.isArray(o.lines) ? o.lines.map(x => String(x).slice(0, 40)).filter(Boolean).slice(0, 12) : [], paused: 0 }; }
module.exports = { clean, defaults };
