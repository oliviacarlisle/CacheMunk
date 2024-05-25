import { Redis } from 'ioredis';
import { compress, uncompress } from 'snappy';

type EventHandler = (queryKey: string, executionTime: number) => void;

interface Config {
  redis: Redis;
  defaultTtl?: number;
  maxEntrySize?: number;
  onCacheHit?: EventHandler;
  onCacheMiss?: EventHandler;
  compression?: boolean;
}
// write cache in the functional style (creator function)
// instead of class (OOP) syntax for stronger encapsulation
export const configureCache = (options: Config) => {
  const { redis } = options;

  const compression = options.compression === true ? true : false;

  // checks that redis passed in is an instance of Redis
  if (!(redis instanceof Redis)) {
    throw new Error('ioredis client not found');
  }

  // set default ttl to 1 hour (3600 seconds)
  const defaultTtl = options.defaultTtl && options.defaultTtl > 0 ? options.defaultTtl : 3600;

  // set default maxEntrySize to 5MB (5_000_000 bytes)
  const maxEntrySize =
    options.maxEntrySize && options.maxEntrySize > 0 ? options.maxEntrySize : 5_000_000;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { onCacheHit, onCacheMiss } = options;

  // function to convert nanoseconds to milliseconds
  const calcExecTime = (start: bigint, end: bigint) => Number(end - start) / 1_000_000;

  // Function to add a query result to the cache
  async function set(
    queryKey: string,
    data: string,
    dependencies?: string[],
    ttlInSeconds = defaultTtl, // default to 1 hour in seconds
  ): Promise<void> {
    // Capture initial timestamp for performance monitoring
    const start = process.hrtime.bigint();

    let compressedData;
    if (compression) {
      // Convert data to binary Buffer
      const binaryData = Buffer.from(data);

      // check if binary Data exceeds maxEntrySize
      if (binaryData.length > maxEntrySize) {
        throw new Error('maxEntrySize exceeded');
      }

      // Compress buffer to save bandwidth using snappy. To further compress buffer. ex: 10kb ->3 kb
      compressedData = await compress(binaryData);
    }

    if (dependencies && dependencies.length > 0) {
      // Create a pipeline/transaction (ensure data integrity and consistency. If one fail, all fails)
      const pipeline = redis.multi();

      // Store the query result
      if (compression && compressedData) {
        pipeline.set(queryKey, compressedData, 'EX', ttlInSeconds);
      } else {
        pipeline.set(queryKey, data, 'EX', ttlInSeconds);
      }

      // Track dependencies
      dependencies.forEach((dependency) => {
        const dependencyKey = `dependency:${dependency}`;
        pipeline.sadd(dependencyKey, queryKey);
        pipeline.expire(dependencyKey, ttlInSeconds); // Set the TTL for the dependency key
      });

      // Execute the pipeline
      await pipeline.exec();
    } else {
      if (compression && compressedData) {
        await redis.set(queryKey, compressedData, 'EX', ttlInSeconds);
      } else {
        await redis.set(queryKey, data, 'EX', ttlInSeconds);
      }
    }

    // Capture final timestamp
    const end = process.hrtime.bigint();

    console.log(`write data to cache in ${calcExecTime(start, end).toFixed(3)}`);
  }

  // Function to retrieve a cached query result
  async function get(queryKey: string): Promise<string | null> {
    // Capture initial timestamp for performance monitoring
    const start = process.hrtime.bigint();

    let data;
    let bufferData: Buffer | null;
    // Retrieve the cached query result based on query key
    const startReq = process.hrtime.bigint();
    if (compression) {
      data = await redis.getBuffer(queryKey);
    } else {
      data = await redis.get(queryKey);
    }
    const endReq = process.hrtime.bigint();

    // Handle cache miss
    if (data === null) {
      // this is a cache miss
      // to do: log cache miss
      const end = process.hrtime.bigint();
      // if (onCacheMiss) onCacheMiss(queryKey, calcExecTime(start, end));
      // console.log(`cache miss in ${calcExecTime(start, end).toFixed(3)}`);
      return null;
    }

    // Decompress result
    if (data instanceof Buffer) {
      const startSnappy = process.hrtime.bigint();
      const binaryData = await uncompress(data);
      const endSnappy = process.hrtime.bigint();
      // Convert result to string
      data = typeof binaryData === 'string' ? binaryData : binaryData.toString();
    }

    data;

    // Capture final timestamp
    const end = process.hrtime.bigint();

    // if (onCacheHit) onCacheHit(queryKey, calcExecTime(start, end));
    // console.log(`response from redis in ${calcExecTime(startReq, endReq).toFixed(3)}`);
    // console.log(`compressed data size ${compressedData.length / 1000} KB`);
    // console.log(`decompression in ${calcExecTime(startSnappy, endSnappy).toFixed(3)}`);
    // console.log(`cache hit in ${calcExecTime(start, end).toFixed(3)}`);
    return data;
  }

  // Function to invalidate cache based on table updates
  async function invalidate(dependency: string) {
    const start = process.hrtime.bigint();

    const dependencyKey = `dependency:${dependency}`;

    const queriesToInvalidate = await redis.smembers(dependencyKey);

    if (queriesToInvalidate.length > 0) {
      // Create a pipeline to batch multiple operations
      const pipeline = redis.multi();

      queriesToInvalidate.forEach((queryKey) => pipeline.del(queryKey));
      pipeline.del(dependencyKey);

      await pipeline.exec();
    } else {
      // Clear the dependency set if it's the only key
      await redis.del(dependencyKey);
    }

    const end = process.hrtime.bigint();

    console.log(`cache invalidate in ${calcExecTime(start, end).toFixed(3)}`);
  }

  return { set, get, invalidate };
};

export default configureCache;
