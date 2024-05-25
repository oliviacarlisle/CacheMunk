import { redis } from '../cache/redisClient.js';
import cache from '../cache/redisClient.js';
import { nanoid } from 'nanoid';

// DEFINE TESTING PARAMETERS
const testTarget = cache;
const requests = 200;
const requestsPerSecond = 500; // cannot be more than 1000

// DO NOT CHANGE THIS
const delay = 1000 / Math.min(requestsPerSecond, 1000);

interface fakeData {
  someRandomData: string;
  someOtherData: string;
}

// generating array of fake semi-random data
const arr: fakeData[] = [];
for (let i = 0; i < 500; i++) {
  arr.push({
    someRandomData: nanoid(),
    someOtherData: nanoid(),
  });
}

// serialize the array to JSON
const serialized = JSON.stringify(arr);

// set the key in redis
await testTarget.set('testKey', serialized);

async function getVal(): Promise<number> {
  const a = process.hrtime.bigint();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const res = await testTarget.get('testKey');
  const b = process.hrtime.bigint();
  return Number(b - a) / 1_000_000;
}

// latency test to establish baseline

await redis.set('ping', 'pong');

const pingTimes: Promise<number | null>[] = [];
const delayFunc = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

for (let i = 0; i < 100; i++) {
  await delayFunc(2); // Delay of 10 milliseconds between each ping
  const a = process.hrtime.bigint();
  const promise = redis.get('ping').then((res) => {
    if (res === 'pong') {
      const b = process.hrtime.bigint();
      const execTime = Number(b - a) / 1_000_000;
      return execTime;
    } else {
      return null;
    }
  });
  pingTimes.push(promise);
}

const resolvedPingTimes = await Promise.all(pingTimes);
console.log('resolved ping times:');
console.log(resolvedPingTimes);

const n = resolvedPingTimes.reduce(
  (acc: number, val) => (typeof val === 'number' ? acc + 1 : acc),
  0,
);
const sum = resolvedPingTimes.reduce(
  (acc: number, val) => (typeof val === 'number' ? acc + val : acc),
  0,
);

const avg = sum / n;
console.log('average is', avg);

// benchmark start

console.log('testing');
const execTimes: Promise<number>[] = [];

for (let i = 0; i < requests; i++) {
  setTimeout(() => execTimes.push(getVal()), delay * i);
}

setTimeout(
  () => {
    void Promise.all(execTimes).then((values) => {
      const sum = values.reduce((acc, val) => acc + val, 0);
      const avg = sum / values.length;

      console.log('n\t', values.length);
      console.log('avg\t', Number(avg.toFixed(5)));
      console.log('bytes\t', Buffer.byteLength(Buffer.from(serialized)));
    });
  },
  delay * (requests + 1),
);

setTimeout(() => process.exit(0), 2000);
