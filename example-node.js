/**
 * Simple Node.js example - no CORS issues
 * Run: node example-node.js
 */

const CathReadings = require('./cathReadings.js');

async function main() {
  const api = new CathReadings();

  // Today's readings
  console.log('📖 Today\'s Readings\n');
  const today = await api.getToday();
  
  console.log(`${today.displayDate} - ${today.title}`);
  console.log(`Lectionary: ${today.lectionary}\n`);
  
  today.readings.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name}`);
    console.log(`   ${r.reference}\n`);
    console.log(r.text.substring(0, 200) + '...\n');
  });
}

main().catch(console.error);
