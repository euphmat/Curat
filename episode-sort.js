(function attachEpisodeSorting(root) {
  "use strict";

  const KANJI_DIGITS = {
    "〇": 0,
    "零": 0,
    "一": 1,
    "壱": 1,
    "二": 2,
    "弐": 2,
    "三": 3,
    "参": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
  };

  const ENGLISH_NUMBERS = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };

  const NUMBER_VALUE_PATTERN =
    "\\d{1,4}(?:\\.\\d+)?(?:st|nd|rd|th)?|[〇零一二三四五六七八九壱弐参十拾百千]+|(?:xx|xix|xviii|xvii|xvi|xv|xiv|xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?";
  const RAW_NUMBER_TOKEN = `(${NUMBER_VALUE_PATTERN})`;
  const NUMBER_TOKEN = `${RAW_NUMBER_TOKEN}(?=$|[^a-z0-9])`;

  function normalizeTitle(title) {
    return String(title || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ja")
      .replace(/[‐‑‒–—―]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function kanjiToNumber(value) {
    if (!value) return null;
    if (!/[十拾百千]/.test(value)) {
      const digits = [...value].map((char) => KANJI_DIGITS[char]);
      return digits.some((digit) => digit === undefined) ? null : Number(digits.join(""));
    }
    const units = { "十": 10, "拾": 10, "百": 100, "千": 1000 };
    let total = 0;
    let current = 0;
    for (const char of value) {
      if (char in KANJI_DIGITS) {
        current = KANJI_DIGITS[char];
      } else if (char in units) {
        total += (current || 1) * units[char];
        current = 0;
      } else {
        return null;
      }
    }
    return total + current;
  }

  function romanToNumber(value) {
    if (!/^[ivxlcdm]+$/i.test(value)) return null;
    const values = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    let total = 0;
    let previous = 0;
    for (const char of [...value.toLowerCase()].reverse()) {
      const number = values[char];
      total += number < previous ? -number : number;
      previous = Math.max(previous, number);
    }
    return total;
  }

  function englishToNumber(value) {
    const parts = value.toLowerCase().split(/[- ]/);
    if (!parts.every((part) => part in ENGLISH_NUMBERS)) return null;
    return parts.reduce((sum, part) => sum + ENGLISH_NUMBERS[part], 0);
  }

  function parseNumberToken(value) {
    if (!value) return null;
    if (/^\d/.test(value)) return Number.parseFloat(value);
    if (/^[〇零一二三四五六七八九壱弐参十拾百千]+$/.test(value)) return kanjiToNumber(value);
    if (/^[ivxlcdm]+$/i.test(value)) return romanToNumber(value);
    return englishToNumber(value);
  }

  function segmentOrder(title) {
    if (/(?:前編|前半|上巻|\bfirst half\b)/.test(title)) return 0.1;
    if (/(?:中編|中盤|中巻|\bmiddle\b)/.test(title)) return 0.2;
    if (/(?:後編|後半|下巻|\bsecond half\b)/.test(title)) return 0.3;
    return 0;
  }

  function matchNumber(title, expression, confidence, season = 1) {
    const match = title.match(expression);
    if (!match) return null;
    const number = parseNumberToken(match[1]);
    if (!Number.isFinite(number) || number < 0 || number > 9999) return null;
    const subPart = match[2] ? Number(match[2]) / 1000 : 0;
    return {
      season,
      number,
      segment: segmentOrder(title) + subPart,
      confidence,
      source: match[0],
    };
  }

  function parseEpisodeOrder(rawTitle) {
    const title = normalizeTitle(rawTitle);
    if (!title) return null;

    const seasonMatch = title.match(
      new RegExp(`(?:\\bseason|\\bs|シーズン)\\s*[-_.:]?\\s*${NUMBER_TOKEN}`, "i"),
    );
    const season = seasonMatch ? parseNumberToken(seasonMatch[1]) || 1 : 1;

    const seasonEpisode = title.match(
      new RegExp(
        `(?:\\bseason|\\bs|シーズン)\\s*[-_.:]?\\s*${RAW_NUMBER_TOKEN}\\s*(?:[-_. ]*e(?:p(?:isode)?)?|第)\\s*[-_.:#]?\\s*${NUMBER_TOKEN}`,
        "i",
      ),
    );
    if (seasonEpisode) {
      const parsedSeason = parseNumberToken(seasonEpisode[1]);
      const number = parseNumberToken(seasonEpisode[2]);
      if (Number.isFinite(parsedSeason) && Number.isFinite(number)) {
        return {
          season: parsedSeason,
          number,
          segment: segmentOrder(title),
          confidence: 100,
          source: seasonEpisode[0],
        };
      }
    }

    const patterns = [
      [
        new RegExp(
          `(?:\\bpart|\\bpt|\\bepisode|\\bep|\\bchapter|\\bchap|\\bch|\\bvolume|\\bvol|\\bno)\\.?\\s*[-_.:#]?\\s*${NUMBER_TOKEN}(?:\\s*[-.]\\s*(\\d{1,2}))?`,
          "i",
        ),
        95,
      ],
      [new RegExp(`(?:パート|ぱーと|其ノ|其の|その)\\s*[-_.:]?\\s*${NUMBER_TOKEN}`, "i"), 95],
      [new RegExp(`第\\s*${NUMBER_TOKEN}\\s*(?:話|回|章|夜|日|節|幕|戦|弾)`, "i"), 95],
      [new RegExp(`${NUMBER_TOKEN}\\s*(?:話|回|章|日目|夜目|戦目)`, "i"), 90],
      [new RegExp(`[#＃]\\s*${NUMBER_TOKEN}(?:\\s*[-.]\\s*(\\d{1,2}))?`, "i"), 90],
      [new RegExp(`(?:^|[【\\[(])\\s*${NUMBER_TOKEN}\\s*(?:[】\\])]|$)`, "i"), 80],
      [new RegExp(`^\\s*${NUMBER_TOKEN}\\s*[.)、:：-]\\s*`, "i"), 75],
    ];

    for (const [pattern, confidence] of patterns) {
      const result = matchNumber(title, pattern, confidence, season);
      if (result) return result;
    }

    const leadingNumber = title.match(/^(\d{1,3})\s+(?=\D)/);
    if (leadingNumber) {
      const number = Number(leadingNumber[1]);
      if (number <= 500) {
        return {
          season,
          number,
          segment: segmentOrder(title),
          confidence: 55,
          source: leadingNumber[0],
        };
      }
    }

    if (/(?:プロローグ|序章|序幕|はじまり|\bprologue\b)/.test(title)) {
      return { season, number: 0, segment: 0, confidence: 70, source: "prologue" };
    }
    if (/(?:最終回|最終話|完結編|大団円|\bfinale\b)/.test(title)) {
      return { season, number: 1000000, segment: 0, confidence: 70, source: "finale" };
    }
    return null;
  }

  function comparePlaylistTasks(a, b) {
    if (Boolean(a.archived) !== Boolean(b.archived)) return a.archived ? 1 : -1;
    const aOrder = a.episodeOrder || parseEpisodeOrder(a.title);
    const bOrder = b.episodeOrder || parseEpisodeOrder(b.title);
    if (aOrder && bOrder) {
      return (
        aOrder.season - bOrder.season ||
        aOrder.number - bOrder.number ||
        aOrder.segment - bOrder.segment ||
        (a.sourcePosition ?? a.position ?? 0) - (b.sourcePosition ?? b.position ?? 0)
      );
    }
    if (aOrder) return -1;
    if (bOrder) return 1;
    return (a.sourcePosition ?? a.position ?? 0) - (b.sourcePosition ?? b.position ?? 0);
  }

  function sortPlaylistTasks(tasks) {
    tasks.sort(comparePlaylistTasks);
    tasks.forEach((task, index) => {
      task.position = index;
    });
    return tasks;
  }

  root.PlaylogEpisodeSort = {
    normalizeTitle,
    parseEpisodeOrder,
    comparePlaylistTasks,
    sortPlaylistTasks,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
