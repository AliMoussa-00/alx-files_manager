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
    _id: new ObjectId(fileId), userId: new ObjectId(userId),
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
