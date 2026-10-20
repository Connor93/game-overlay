// Decides whether an EXP reading can be trusted.
//
// Within one level, EXP needed for the level is fixed, and the on-screen percentage (two decimals)
// pins it to a narrow range: required ≈ exp / pct. Every trusted reading narrows that range; a
// reading whose own range doesn't overlap it must be a misread. Level-ups reset the range.
// A reading the digit reader wasn't sure of (sure: false) can only confirm the range, never set it.

const PCT_HALF_STEP = 0.005; // the percentage is rounded to two decimals
const LEVEL_UP_PCT_DROP = 50;
const RECOVER_AFTER_REJECTS = 3;

function requiredRange({ exp, pct }) {
  const lo = exp / ((pct + PCT_HALF_STEP) / 100);
  const hi = pct <= PCT_HALF_STEP ? Infinity : exp / ((pct - PCT_HALF_STEP) / 100);
  return [lo, hi];
}

function overlap(a, b) {
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : null;
}

function createValidator() {
  let required = null; // range for the current level
  let last = null; // last trusted reading
  let streak = null; // { count, range } of consecutive rejects that agree with each other

  function trust(reading, range) {
    required = range;
    last = reading;
    streak = null;
  }

  function accept(reading) {
    const range = requiredRange(reading);
    const verdict = (status, extra) => ({ status, exp: reading.exp, pct: reading.pct, required, ...extra });

    if (reading.sure === false) {
      const both = required && overlap(required, range);
      if (!both) return verdict('reject');
      trust(reading, both);
      return verdict('ok');
    }

    if (!required) {
      trust(reading, range);
      return verdict('ok');
    }
    // A level-up: EXP and percentage both fall, the percentage by a lot.
    if (last.pct - reading.pct > LEVEL_UP_PCT_DROP && reading.exp < last.exp) {
      const previousRequired = required;
      trust(reading, range);
      return verdict('levelup', { previousRequired });
    }
    const both = overlap(required, range);
    if (both) {
      trust(reading, both);
      return verdict('ok');
    }
    // Disagrees with what we know. If several readings in a row agree with each other instead,
    // what we knew was wrong (or the level changed unseen): start over from them.
    const agreeing = streak && overlap(streak.range, range);
    streak = agreeing ? { count: streak.count + 1, range: agreeing } : { count: 1, range };
    if (streak.count >= RECOVER_AFTER_REJECTS) {
      trust(reading, streak.range);
      return verdict('ok');
    }
    return verdict('reject');
  }

  return {
    accept,
    reset() {
      required = null;
      last = null;
      streak = null;
    },
  };
}

module.exports = { createValidator, requiredRange };
