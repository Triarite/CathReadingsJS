/**
 * Catholic Daily Readings API
 * Fetches and parses daily readings from the USCCB website
 * URL format: https://bible.usccb.org/bible/readings/MMDDYY.cfm
 */

class CathReadings {
  constructor() {
    this.baseUrl = 'https://bible.usccb.org/bible/readings';
    this.corsProxy = 'https://api.allorigins.win/raw?url=';
    this.timeout = 6000; // 6 second timeout for CORS requests (allows for slow networks)
    this.cache = new Map(); // In-memory cache for frequently requested dates
    // Multiple public CORS proxies; we'll race them for fastest response
    this.proxyCandidates = [
      (u) => `https://cors.isomorphic-git.org/${u}`,
      (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
      (u) => `https://thingproxy.freeboard.io/fetch/${u}`
    ];
  }

  /**
   * Formats a date into the MMDDYY format required by USCCB
   * @param {Date} date - The date to format
   * @returns {string} Date in MMDDYY format
   */
  static formatDateForUrl(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${month}${day}${year}`;
  }

  /**
   * Parses MMDDYY format into a Date object
   * @param {string} dateStr - Date string in MMDDYY format
   * @returns {Date} Parsed date object
   */
  static parseDateString(dateStr) {
    if (!/^\d{6}$/.test(dateStr)) {
      throw new Error('Date must be in MMDDYY format');
    }
    const month = parseInt(dateStr.substring(0, 2), 10);
    const day = parseInt(dateStr.substring(2, 4), 10);
    const year = parseInt('20' + dateStr.substring(4, 6), 10);
    
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date values');
    }
    return date;
  }

  /**
   * Fetches daily readings for a given date
   * @param {Date|string} date - Date object or MMDDYY string
   * @returns {Promise<Object>} Object containing all readings for the day
   */
  async getReadings(date) {
    let dateStr;
    
    if (typeof date === 'string') {
      dateStr = date;
      date = CathReadings.parseDateString(date);
    } else if (date instanceof Date) {
      dateStr = CathReadings.formatDateForUrl(date);
    } else {
      throw new Error('Date must be a Date object or MMDDYY string');
    }

    // Check in-memory cache first
    if (this.cache.has(dateStr)) {
      return this.cache.get(dateStr);
    }

    // Check persistent cache (localStorage) if available
    const persisted = this.readFromPersistentCache(dateStr);
    if (persisted) {
      this.cache.set(dateStr, persisted);
      return persisted;
    }

    const url = `${this.baseUrl}/${dateStr}.cfm`;
    
    try {
      // Try direct fetch first (works in Node.js)
      const html = await this.fetchUrl(url);
      const result = this.parseReadings(html, date);
      this.cache.set(dateStr, result);
      return result;
    } catch (error) {
      // Fallback to CORS proxies for browser with timeout
      if (typeof window !== 'undefined') {
        try {
          const html = await this.fetchViaProxies(url, this.timeout);
          const result = this.parseReadings(html, date);
          this.cache.set(dateStr, result);
          this.writeToPersistentCache(dateStr, result);
          return result;
        } catch (proxyError) {
          // Provide better error message for debugging
          const errorMsg = proxyError.name === 'AbortError' 
            ? 'Network request timed out (CORS proxies may be slow or unavailable)'
            : 'Unable to fetch readings (CORS or network error)';
          throw new Error(errorMsg);
        }
      }
      throw error;
    }
  }

  async fetchUrl(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  }

  async fetchUrlWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Build proxy URLs for a target URL
   */
  buildProxyUrls(url) {
    return this.proxyCandidates.map(fn => fn(url));
  }

  /**
   * Fetch a URL by racing multiple public CORS proxies and returning
   * the first successful response body. Aborts the others upon success.
   * @param {string} url - The original target URL (https://...)
   * @param {number} totalTimeoutMs - Global timeout across proxies
   * @returns {Promise<string>} response text
   */
  async fetchViaProxies(url, totalTimeoutMs = 6000) {
    const proxyUrls = this.buildProxyUrls(url);
    const controllers = proxyUrls.map(() => new AbortController());
    let settled = false;

    return new Promise((resolve, reject) => {
      let failures = 0;

      // Global timeout
      const globalTimer = setTimeout(() => {
        if (!settled) {
          controllers.forEach(c => c.abort());
          reject(new Error('Network request timed out across proxies'));
        }
      }, totalTimeoutMs);

      proxyUrls.forEach((purl, i) => {
        // Stagger starts slightly to reduce thundering herd
        setTimeout(async () => {
          if (settled) return;
          try {
            const res = await fetch(purl, { signal: controllers[i].signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            if (settled) return;
            settled = true;
            clearTimeout(globalTimer);
            controllers.forEach((c, j) => { if (j !== i) try { c.abort(); } catch (_) {} });
            resolve(text);
          } catch (e) {
            failures += 1;
            if (failures === proxyUrls.length && !settled) {
              clearTimeout(globalTimer);
              reject(new Error('All CORS proxies failed or were blocked'));
            }
          }
        }, i * 150);
      });
    });
  }

  /**
   * LocalStorage-backed persistent cache helpers
   */
  storageAvailable() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const k = '__cr_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (_) {
      return false;
    }
  }

  readFromPersistentCache(key) {
    if (!this.storageAvailable()) return null;
    try {
      const raw = window.localStorage.getItem(`CathReadings:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  writeToPersistentCache(key, value) {
    if (!this.storageAvailable()) return;
    try {
      window.localStorage.setItem(`CathReadings:${key}`, JSON.stringify(value));
    } catch (_) {
      // Ignore quota or serialization errors
    }
  }

  /**
   * Parses HTML content and extracts readings
   * @param {string} html - HTML content from the readings page
   * @param {Date} date - The date of the readings
   * @returns {Object} Parsed readings data
   */
  parseReadings(html, date) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const title = this.extractTitle(doc);
    const readings = {
      date: date.toISOString().split('T')[0],
      displayDate: date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      title: title,
      season: this.extractSeason(title),
      rank: this.extractLiturgicalRank(title, doc),
      lectionary: this.extractLectionary(doc),
      readings: []
    };

    // Extract all reading sections
    const verseBlocks = doc.querySelectorAll('.wr-block.b-verse');
    verseBlocks.forEach((block) => {
      const reading = this.parseReadingBlock(block);
      if (reading) {
        readings.readings.push(reading);
      }
    });

    return readings;
  }

  /**
   * Extracts the liturgical title (e.g., "Monday of the Third Week of Advent")
   * @param {Document} doc - The parsed HTML document
   * @returns {string} The liturgical title
   */
  extractTitle(doc) {
    const titleElement = doc.querySelector('.wr-block.b-lectionary h2');
    return titleElement ? titleElement.textContent.trim() : '';
  }

  /**
   * Extracts the liturgical season from the title
   * @param {string} title - The liturgical title
   * @returns {string} The season (e.g., "Advent", "Christmas", "Lent", "Easter", "Ordinary Time")
   */
  extractSeason(title) {
    if (!title) return 'Unknown';
    
    if (title.includes('Advent')) return 'Advent';
    if (title.includes('Christmas')) return 'Christmas';
    if (title.includes('Lent')) return 'Lent';
    if (title.includes('Easter')) return 'Easter';
    if (title.includes('Pentecost')) return 'Pentecost';
    if (title.includes('Ordinary Time')) return 'Ordinary Time';
    
    return 'Ordinary Time';
  }

  /**
   * Extracts the liturgical rank from the title and context
   * Solemnity: Most important (Christmas, Easter, Pentecost, patron saints)
   * Feast: Important celebration of a saint or mystery
   * Memorial: Commemoration of a saint (lower rank)
   * Ferial: Weekday with no special observance
   * @param {string} title - The liturgical title
   * @param {Document} doc - The parsed HTML document
   * @returns {string} The rank ("Solemnity", "Feast", "Memorial", or "Ferial")
   */
  extractLiturgicalRank(title, doc) {
    if (!title) return 'Ferial';

    const titleLower = title.toLowerCase();

    // Solemnity: Major feasts and seasons
    if (titleLower.includes('solemnity') ||
        titleLower.includes('christmas') ||
        titleLower.includes('epiphany') ||
        titleLower.includes('easter') ||
        titleLower.includes('pentecost') ||
        titleLower.includes('ascension') ||
        titleLower.includes('assumption') ||
        titleLower.includes('all saints') ||
        titleLower.includes('immaculate conception')) {
      return 'Solemnity';
    }

    // Feast: Important but lower than solemnity
    if (titleLower.includes('feast')) {
      return 'Feast';
    }

    // Memorial: Commemorations of saints
    if (titleLower.includes('memorial')) {
      return 'Memorial';
    }

    // St./Saint names without explicit rank are usually memorials
    if (titleLower.includes('st. ') || titleLower.includes('saint ')) {
      return 'Memorial';
    }

    // Default: Ferial (weekday)
    return 'Ferial';
  }

  /**
   * Extracts the lectionary number
   * @param {Document} doc - The parsed HTML document
   * @returns {string} The lectionary number
   */
  extractLectionary(doc) {
    const lectElement = doc.querySelector('.wr-block.b-lectionary p');
    if (lectElement) {
      const match = lectElement.textContent.match(/Lectionary:\s*(\d+)/);
      return match ? match[1] : '';
    }
    return '';
  }

  /**
   * Parses a single reading block
   * @param {Element} block - The DOM element containing a reading block
   * @returns {Object|null} Parsed reading object or null if invalid
   */
  parseReadingBlock(block) {
    const nameElement = block.querySelector('.content-header .name');
    const addressElement = block.querySelector('.content-header .address');
    const contentElement = block.querySelector('.content-body');

    if (!nameElement || !contentElement) {
      return null;
    }

    const name = nameElement.textContent.trim();
    
    // Extract reference and link
    const referenceLink = addressElement?.querySelector('a');
    const reference = referenceLink?.textContent.trim() || '';
    const referenceUrl = referenceLink?.href || '';

    // Extract text content and preserve formatting
    const text = this.extractTextContent(contentElement);

    return {
      name,
      reference,
      referenceUrl,
      text
    };
  }

  /**
   * Extracts text content from a reading block, preserving line breaks
   * @param {Element} element - The content element
   * @returns {string} Formatted text content
   */
  extractTextContent(element) {
    // Fast path: use textContent and replace HTML manually
    let html = element.innerHTML;
    
    // Remove script and style tags
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Replace br tags with newlines
    html = html.replace(/<br\s*\/?>/gi, '\n');
    
    // Remove strong/em tags
    html = html.replace(/<(strong|em|b|i)>|<\/(strong|em|b|i)>/gi, '');
    
    // Extract text from paragraphs
    const paragraphs = element.querySelectorAll('p');
    const texts = [];
    
    paragraphs.forEach(p => {
      let text = p.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .trim();
      if (text) texts.push(text);
    });

    return texts.join('\n\n');
  }

  /**
   * Fetches readings for today
   * @returns {Promise<Object>} Today's readings
   */
  async getToday() {
    return this.getReadings(new Date());
  }

  /**
   * Fetches readings for tomorrow
   * @returns {Promise<Object>} Tomorrow's readings
   */
  async getTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.getReadings(tomorrow);
  }

  /**
   * Fetches readings for a specific number of days from today
   * @param {number} daysOffset - Number of days offset (positive or negative)
   * @returns {Promise<Object>} Readings for the specified date
   */
  async getReadingsByDaysOffset(daysOffset) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysOffset);
    return this.getReadings(targetDate);
  }

  /**
   * Gets the liturgical season for a given date
   * @param {Date|string} date - Date object or MMDDYY string
   * @returns {Promise<string>} The liturgical season
   */
  async getSeason(date) {
    const readings = await this.getReadings(date);
    return readings.season;
  }

  /**
   * Gets the liturgical rank for a given date
   * @param {Date|string} date - Date object or MMDDYY string
   * @returns {Promise<string>} The liturgical rank ("Solemnity", "Feast", "Memorial", or "Ferial")
   */
  async getRank(date) {
    const readings = await this.getReadings(date);
    return readings.rank;
  }

  /**
   * Returns demo data for testing (December 15, 2025)
   * Useful for development and testing CORS issues
   * @returns {Object} Demo readings data
   */
  static getDemoData() {
    return {
      date: "2025-12-15",
      displayDate: "December 15, 2025",
      title: "Monday of the Third Week of Advent",
      season: "Advent",
      rank: "Ferial",
      lectionary: "187",
      readings: [
        {
          name: "Reading 1",
          reference: "Numbers 24:2-7, 15-17a",
          referenceUrl: "https://bible.usccb.org/bible/numbers/24?2",
          text: "When Balaam raised his eyes and saw Israel encamped, tribe by tribe,\nthe spirit of God came upon him,\nand he gave voice to his oracle:\n\nThe utterance of Balaam, son of Beor,\nthe utterance of a man whose eye is true,\nThe utterance of one who hears what God says,\nand knows what the Most High knows,\nOf one who sees what the Almighty sees,\nenraptured, and with eyes unveiled:\nHow goodly are your tents, O Jacob;\nyour encampments, O Israel!\nThey are like gardens beside a stream,\nlike the cedars planted by the LORD.\nHis wells shall yield free-flowing waters,\nhe shall have the sea within reach;\nHis king shall rise higher,\nand his royalty shall be exalted.\n\nThen Balaam gave voice to his oracle:\n\nThe utterance of Balaam, son of Beor,\nthe utterance of the man whose eye is true,\nThe utterance of one who hears what God says,\nand knows what the Most High knows,\nOf one who sees what the Almighty sees,\nenraptured, and with eyes unveiled.\nI see him, though not now;\nI behold him, though not near:\nA star shall advance from Jacob,\nand a staff shall rise from Israel."
        },
        {
          name: "Responsorial Psalm",
          reference: "Psalm 25:4-5ab, 6 and 7bc, 8-9",
          referenceUrl: "https://bible.usccb.org/bible/Psalms/25?4",
          text: "R.(4) Teach me your ways, O Lord.\nYour ways, O LORD, make known to me;\nteach me your paths,\nGuide me in your truth and teach me,\nfor you are God my savior.\nR. Teach me your ways, O Lord.\nRemember that your compassion, O LORD,\nand your kindness are from of old.\nIn your kindness remember me,\nbecause of your goodness, O LORD.\nR. Teach me your ways, O Lord.\nGood and upright is the LORD;\nthus he shows sinners the way.\nHe guides the humble to justice,\nhe teaches the humble his way.\nR. Teach me your ways, O Lord."
        },
        {
          name: "Alleluia",
          reference: "Psalm 85:8",
          referenceUrl: "https://bible.usccb.org/bible/Psalms/85?8",
          text: "R. Alleluia, alleluia.\nShow us, LORD, your love,\nand grant us your salvation.\nR. Alleluia, alleluia."
        },
        {
          name: "Gospel",
          reference: "Matthew 21:23-27",
          referenceUrl: "https://bible.usccb.org/bible/matthew/21?23",
          text: "When Jesus had come into the temple area,\nthe chief priests and the elders of the people approached him\nas he was teaching and said,\n\"By what authority are you doing these things?\nAnd who gave you this authority?\"\nJesus said to them in reply,\n\"I shall ask you one question, and if you answer it for me,\nthen I shall tell you by what authority I do these things.\nWhere was John's baptism from?\nWas it of heavenly or of human origin?\"\nThey discussed this among themselves and said,\n\"If we say 'Of heavenly origin,' he will say to us,\n'Then why did you not believe him?'\nBut if we say, 'Of human origin,' we fear the crowd,\nfor they all regard John as a prophet.\"\nSo they said to Jesus in reply, \"We do not know.\"\nHe himself said to them,\n\"Neither shall I tell you by what authority I do these things.\""
        }
      ]
    };
  }
}

// Export for Node.js/CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CathReadings;
}
