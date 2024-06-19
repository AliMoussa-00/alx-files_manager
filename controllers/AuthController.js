import { ObjectId } from 'mongodb';
import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    const { authorization } = req.headers;
    if (authorization) {
      const base64Credentials = authorization.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [email, pwd] = credentials.split(':');

      const userCollection = dbClient.db.collection('users');
      const user = await userCollection.findOne({ email, password: sha1(pwd) });
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
      } else {
        const uuid = uuidv4();
        const key = `auth_${uuid}`;
        await redisClient.set(key, user._id, 24 * 3600);

        res.status(200).json({ token: uuid });
      }
    } else {
      res.status(500).json({ error: 'no authorization header' });
    }
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];
    const key = `auth_${token}`;

    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      await redisClient.del(key);

      res.status(204).send();
    }
  }

  static async getMe(req, res) {
    const token = req.headers['x-token'];
    const key = `auth_${token}`;

    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      const userCollection = await dbClient.db.collection('users');
      const user = await userCollection.findOne({ _id: new ObjectId(userId) });

      res.json({ id: userId, email: user.email });
    }
  }
}

export default AuthController;
