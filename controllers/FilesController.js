import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userCollection = dbClient.db.collection('users');
    const filesCollection = dbClient.db.collection('files');

    const user = await userCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    let parentDocument = null;
    if (parentId !== 0) {
      parentDocument = await filesCollection.findOne({ _id: new ObjectId(parentId) });
      if (!parentDocument) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentDocument.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const fileDocument = {
      userId,
      name,
      type,
      isPublic,
      parentId,
    };

    if (type === 'folder') {
      const result = await filesCollection.insertOne(fileDocument);
      return res.status(201).json({
        id: result.insertedId, userId, name, type, isPublic, parentId,
      });
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const localPath = path.join(folderPath, uuidv4());
    const clearData = Buffer.from(data, 'base64').toString('utf-8');
    fs.writeFileSync(localPath, clearData);

    fileDocument.localPath = localPath;
    const result = await filesCollection.insertOne(fileDocument);
    return res.status(201).json({
      id: result.insertedId, userId, name, type, isPublic, parentId,
    });
  }

  static async getShow(req, res) {
    const fileId = req.params.id;
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userCollection = dbClient.db.collection('users');
    const filesCollection = dbClient.db.collection('files');

    const user = await userCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let file;
    try {
      file = await filesCollection.findOne({
        _id: new ObjectId(fileId), userId: new ObjectId(userId),
      });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json({
      id: file._id.toString(),
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
    });
  }

  static async getIndex(req, res) {
    const { parentId = '0', page = '0' } = req.query;
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userCollection = dbClient.db.collection('users');
    const filesCollection = dbClient.db.collection('files');

    const user = await userCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pageNumber = parseInt(page, 10);
    const pageSize = 20;

    const query = { userId: new ObjectId(userId) };
    if (parentId !== '0') {
      try {
        query.parentId = new ObjectId(parentId);
      } catch (err) {
        query.parentId = parentId; // in case parentId is not an ObjectId
      }
    } else {
      query.parentId = 0;
    }

    const pipeline = [
      { $match: query },
      { $skip: pageNumber * pageSize },
      { $limit: pageSize },
      {
        $project: {
          _id: 0,
          id: '$_id',
          userId: { $toString: '$userId' },
          name: 1,
          type: 1,
          isPublic: 1,
          parentId: {
            $cond: {
              if: { $eq: ['$parentId', 0] },
              then: '0',
              else: { $toString: '$parentId' },
            },
          },
        },
      },
    ];

    const files = await filesCollection.aggregate(pipeline).toArray();
    return res.json(files);
  }

  static async putPublish(req, res) {
    const fileId = req.params.id;
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userCollection = dbClient.db.collection('users');
    const filesCollection = dbClient.db.collection('files');

    const user = await userCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let file;
    try {
      file = await filesCollection.findOne({
        _id: new ObjectId(fileId), userId: new ObjectId(userId),
      });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne(
      { _id: new ObjectId(fileId) },
      { $set: { isPublic: true } },
    );

    const updatedFile = await filesCollection.findOne({ _id: new ObjectId(fileId) });

    return res.status(200).json({
      id: updatedFile._id,
      userId: updatedFile.userId,
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId,
    });
  }

  static async putUnpublish(req, res) {
    const fileId = req.params.id;
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userCollection = dbClient.db.collection('users');
    const filesCollection = dbClient.db.collection('files');

    const user = await userCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let file;
    try {
      file = await filesCollection.findOne({
        _id: new ObjectId(fileId), userId: new ObjectId(userId),
      });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne(
      { _id: new ObjectId(fileId) },
      { $set: { isPublic: false } },
    );

    const updatedFile = await filesCollection.findOne({ _id: new ObjectId(fileId) });

    return res.status(200).json({
      id: updatedFile._id,
      userId: updatedFile.userId,
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId,
    });
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    const userCollection = dbClient.db.collection('users');
    const filesCollection = dbClient.db.collection('files');

    const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file.isPublic) {
      if (!userId) {
        return res.status(404).json({ error: 'Not found' });
      }
      const user = await userCollection.findOne({ _id: new ObjectId(userId) });

      if (!user || user._id.toString() !== file.userId.toString()) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: 'A folder doesn\'t have content' });
    }

    if (!fs.existsSync(file.localPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const mimeType = mime.lookup(file.name);

    const fileContent = fs.readFileSync(file.localPath);

    res.setHeader('Content-Type', mimeType);
    return res.send(fileContent);
  }
}

export default FilesController;
