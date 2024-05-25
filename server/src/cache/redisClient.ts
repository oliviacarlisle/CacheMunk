import 'dotenv/config';
import { Redis } from 'ioredis';
import { configureCache } from './cache.js';

console.log('docker?', process.env.DOCKER);

export const redis = new Redis({
  host: process.env.DOCKER ? 'redis' : 'localhost',
  port: 6379,
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Error connecting to Redis', err);
});

const cache = configureCache({
  redis,
  compression: false,
});

export default cache;
