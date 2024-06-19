import Queue from 'bull';
import thumbnail from 'image-thumbnail';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

async function generateThumbnails(file) {
  const sizes = [500, 250, 100];

  for (const size of sizes) {
    try {
      const options = { width: size };
      // eslint-disable-next-line no-await-in-loop
      const thumbnailBuffer = await thumbnail(file.localPath, options);
      const thumbnailPath = `${file.localPath}_${size}`;
      fs.writeFileSync(thumbnailPath, thumbnailBuffer);
    } catch (err) {
      console.error(`Error generating thumbnail (${size}px): ${err.message}`);
      throw new Error(err.message);
    }
  }
}

const fileQueue = new Queue('fileQueue');
fileQueue.process(async (job, done) => {
  const { fileId, userId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }
  if (!userId) {
    throw new Error('Missing userId');
  }

  const filesCollection = dbClient.db.collection('files');

  const file = await filesCollection.findOne({
    _id: new ObjectId(fileId), userId,
  });

  if (!file) {
    throw new Error('File not found');
  }

  try {
    await generateThumbnails(file.localPath);
    done();
  } catch (error) {
    done(error);
  }
});

const userQueue = new Queue('userQueue');

userQueue.process(async (job) => {
  const { userId } = job.data;

  if (!userId) {
    throw new Error('Missing userId');
  }

  const usersCollection = dbClient.db.collection('users');
  const user = await usersCollection.findOne({ _id: userId });

  if (!user) {
    throw new Error('User not found');
  }

  console.log(`Welcome ${user.email}!`);

  // In a real-world scenario, you would send the email here using a service like Mailgun
  // Example:
  // await sendWelcomeEmail(user.email);

  // For demonstration purposes, we're just logging the message
});
