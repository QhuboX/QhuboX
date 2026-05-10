import fs from 'fs';
import fetch from 'node-fetch';
(async () => {
  const q = JSON.parse(fs.readFileSync('../quote.json', 'utf8'));
  const body = { quoteResponse: q };
  const res = await fetch('https://api.jup.ag/swap/v2/build', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'c7c8370a-77ed-4dd9-8af2-106f01882805',
      'Authorization': 'Bearer c7c8370a-77ed-4dd9-8af2-106f01882805'
    },
    body: JSON.stringify(body)
  });
  console.log('status', res.status);
  console.log(await res.text());
})();
