import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();

    this.client.on('connect', () => {
      console.log('Redis client connected to the server');
    });

    this.client.on('error', (error) => {
      console.error(`Redis client not connected to the server: ${error.message}`);
    });

    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setAsync = promisify(this.client.set).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    const value = await this.getAsync(key);
    return value;
  }

  async set(key, value, duration) {
    await this.setAsync(key, value, 'EX', duration);
  }

  async del(key) {
    await this.delAsync(key);
  }
}

const redisClient = new RedisClient();

export default redisClient;
