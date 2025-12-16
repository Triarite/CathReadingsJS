# CathReadingsJS

Simple, vibe-coded API for Catholic daily readings from the USCCB website.

## Features

- Parse USCCB readings from HTML
- Works in browser (with CORS proxy) and Node.js
- Request caching for fast repeated lookups
- 6-second timeout to fail fast on network issues
- Auto-fallback to demo data on error (browser)

## Usage

### Browser
```html
<script src="cathReadings.js"></script>
<script>
  const api = new CathReadings();
  const readings = await api.getToday();
</script>
```

Open `example.html` for working demo.

### Node.js
```bash
node example-node.js
```

## API

```javascript
const api = new CathReadings();

// Today
await api.getToday();

// Tomorrow
await api.getTomorrow();

// Specific date (MMDDYY)
await api.getReadings('121525');

// Get liturgical season for a date
await api.getSeason('121525');

// Relative date
await api.getReadingsByDaysOffset(-7);

// Demo data
CathReadings.getDemoData();
```

## Response

```javascript
{
  date: "2025-12-15",
  displayDate: "December 15, 2025",
  title: "Monday of the Third Week of Advent",
  season: "Advent",
  lectionary: "187",
  readings: [
    {
      name: "Reading 1",
      reference: "Numbers 24:2-7, 15-17a",
      referenceUrl: "https://...",
      text: "..."
    }
  ]
}
```

`getSeason()` returns just the season string:
```javascript
const season = await api.getSeason('121525');
// "Advent"
```

## CORS Notes

Browser uses CORS proxy (may be slow). Use Node.js for best performance.

## License

This project is provided as-is for personal use. The readings data is copyright by the USCCB.

## Notes

- USCCB doesn't have readings for all dates. For exmaple, this can't get readings for Christmases since the main page subdivides into multiple masses.
- This API respects USCCB's terms of service
- Consider caching results to reduce server load
- Date parsing uses local timezone

## Contributing

To improve this API, you can:
- Report issues with parsing specific dates
- Suggest additional data extraction features
- Improve documentation
- Add unit tests

## Disclaimer

This is an unofficial tool. The daily readings data is provided by and copyright of the United States Conference of Catholic Bishops. This API simply provides convenient access to their publicly available website content.
