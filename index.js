const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const Slimbot = require('slimbot');

require('dotenv').config();

const slimbot = new Slimbot(process.env.TELEGRAM_BOT_TOKEN);

exports.handler = async function (event, context) {
  const [bookmark, latestDeals] = await Promise.all([downloadBookmark(), getLatestDeals()]);
  console.log('last pulled url:' + bookmark);
  for (const deal of latestDeals) {
    if (deal.url == bookmark)
      break;

    await slimbot.sendMessage(`@${process.env.TELEGRAM_CHANNEL_NAME}`, `${deal.title}\n${deal.url}`, {disable_web_page_preview: true});

    await sleep(1000); //avoid Telegram API rate limits
  }

  await uploadBookmark(latestDeals.shift().url);
  console.log(`Successfully processed ${latestDeals.length} events.`);
  return `Successfully processed ${latestDeals.length} events.`;
}

async function getLatestDeals() {
  const browser = await chromium.puppeteer.launch();

  const page = await browser.newPage();
  await page.goto(process.env.HOTDEALSUK_URL);
  await page.addScriptTag({ url: 'https://code.jquery.com/jquery-3.2.1.min.js' });

  const result = await page.evaluate(() => {
    let result = [];
    const items = $('article > div > div.threadGrid-title.js-contextual-message-placeholder > strong > a').toArray()
    for (let item of items) {
      result.push({
        title: item.text.trim(),
        url: item.href
      });
    }
    return result;
  });
  await browser.close();

  return result;
}

async function uploadBookmark(bookmarkContent) {
  const params = {
      Bucket: process.env.BUCKET_NAME,
      Key: 'electronics/new/bookmark',
      Body: bookmarkContent
  };
  await s3.upload(params).promise();
}

async function downloadBookmark() {
  const params = {
      Bucket: process.env.BUCKET_NAME,
      Key: 'electronics/new/bookmark'
  };
  const response = await s3.getObject(params).promise();
  return response.Body.toString('utf-8');
}