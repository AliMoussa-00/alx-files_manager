import Queue from 'bull';
import sha1 from 'sha1';
import dbClient from '../utils/db';

const userQueue = new Queue('userQueue');

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Missing email' });
    } else if (!password) {
      res.status(400).json({ error: 'Missing password' });
    } else {
      const usersCollection = dbClient.db.collection('users');

      const user = await usersCollection.findOne({ email });
      if (user) {
        res.status(400).json({ error: 'Already exist' });
      } else {
        const result = await usersCollection.insertOne({ email, password: sha1(password) });

        await userQueue.add({ userId: result.insertedId });
        res.status(201).json({ id: result.insertedId, email });
      }
    }
  }
}

export default UsersController;
