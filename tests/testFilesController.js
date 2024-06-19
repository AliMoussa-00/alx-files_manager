import chai from 'chai';
import chaiHttp from 'chai-http';
import sinon from 'sinon';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import Queue from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import FilesController from '../controllers/FilesController';

const expect = chai.expect;
chai.use(chaiHttp);

describe('FilesController', () => {
  let server;
  let sandbox;

  before(() => {
    const express = require('express');
    const app = express();
    app.use(express.json());

    app.post('/files', (req, res) => FilesController.postUpload(req, res));
    app.get('/files/:id', (req, res) => FilesController.getShow(req, res));
    app.get('/files', (req, res) => FilesController.getIndex(req, res));
    app.put('/files/:id/publish', (req, res) => FilesController.putPublish(req, res));
    app.put('/files/:id/unpublish', (req, res) => FilesController.putUnpublish(req, res));
    app.get('/files/:id/data', (req, res) => FilesController.getFile(req, res));

    server = app.listen(3000);

    sandbox = sinon.createSandbox();
  });

  after(() => {
    sinon.restore();
    server.close();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('POST /files', () => {
    it('should return status 201 and file data on valid request', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileData = {
        name: 'test.txt',
        type: 'file',
        data: Buffer.from('Hello World').toString('base64'),
      };

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'insertOne').resolves({ insertedId: new ObjectId() });

      chai.request(server)
        .post('/files')
        .set('x-token', token)
        .send(fileData)
        .end((err, res) => {
          if (err) {
            done(err);
            return;
          }
          expect(res).to.have.status(201);
          expect(res.body).to.have.property('id').that.is.a('string');
          expect(res.body).to.have.property('userId').that.equals(userId.toString());
          expect(res.body).to.have.property('name').that.equals(fileData.name);
          expect(res.body).to.have.property('type').that.equals(fileData.type);
          expect(res.body).to.have.property('isPublic').that.equals(false);
          expect(res.body).to.have.property('parentId').that.equals(0);
          done();
        });
    });

    it('should return status 401 on unauthorized request', (done) => {
      const fileData = {
        name: 'test.txt',
        type: 'file',
        data: Buffer.from('Hello World').toString('base64'),
      };

      sandbox.stub(redisClient, 'get').withArgs('auth_invalidtoken').resolves(null);

      chai.request(server)
        .post('/files')
        .set('x-token', 'invalidtoken')
        .send(fileData)
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });

    // Add more tests for missing fields and invalid data...
  });

  describe('GET /files/:id', () => {
    it('should return status 200 and file data on valid request', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileId = new ObjectId();
      const file = {
        _id: fileId,
        userId,
        name: 'test.txt',
        type: 'file',
        isPublic: false,
        parentId: 0,
      };

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves(file);

      chai.request(server)
        .get(`/files/${fileId}`)
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('id').that.equals(fileId.toString());
          expect(res.body).to.have.property('userId').that.equals(userId.toString());
          expect(res.body).to.have.property('name').that.equals(file.name);
          expect(res.body).to.have.property('type').that.equals(file.type);
          expect(res.body).to.have.property('isPublic').that.equals(file.isPublic);
          expect(res.body).to.have.property('parentId').that.equals(file.parentId === 0 ? '0' : file.parentId.toString());
          done();
        });
    });

    it('should return status 401 on unauthorized request', (done) => {
      const fileId = new ObjectId();

      sandbox.stub(redisClient, 'get').withArgs('auth_invalidtoken').resolves(null);

      chai.request(server)
        .get(`/files/${fileId}`)
        .set('x-token', 'invalidtoken')
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });

    it('should return status 404 when file is not found', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileId = new ObjectId();

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves(null);

      chai.request(server)
        .get(`/files/${fileId}`)
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(404);
          done();
        });
    });
  });

  describe('GET /files', () => {
    it('should return status 200 and list of files with pagination', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const files = [
        {
          _id: new ObjectId(),
          userId,
          name: 'file1.txt',
          type: 'file',
          isPublic: false,
          parentId: 0,
        },
        {
          _id: new ObjectId(),
          userId,
          name: 'file2.txt',
          type: 'file',
          isPublic: false,
          parentId: 0,
        },
      ];

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'aggregate').returns({
        toArray: () => Promise.resolve(files.map((file) => ({
          id: file._id.toString(),
          userId: file.userId.toString(),
          name: file.name,
          type: file.type,
          isPublic: file.isPublic,
          parentId: file.parentId === 0 ? '0' : file.parentId.toString(),
        }))),
      });

      chai.request(server)
        .get('/files')
        .set('x-token', token)
        .query({ page: 0 })
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.be.an('array');
          expect(res.body.length).to.equal(2);
          done();
        });
    });

    it('should return status 401 on unauthorized request', (done) => {
      sandbox.stub(redisClient, 'get').withArgs('auth_invalidtoken').resolves(null);

      chai.request(server)
        .get('/files')
        .set('x-token', 'invalidtoken')
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });
  });

  describe('PUT /files/:id/publish', () => {
    it('should return status 200 and updated file data on valid request', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileId = new ObjectId();
      const file = {
        _id: fileId,
        userId,
        name: 'test.txt',
        type: 'file',
        isPublic: false,
        parentId: 0,
      };

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves(file);
      sandbox.stub(dbClient.db.collection('files'), 'updateOne').resolves({ modifiedCount: 1 });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves({ ...file, isPublic: true });

      chai.request(server)
        .put(`/files/${fileId}/publish`)
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('id').that.equals(fileId.toString());
          expect(res.body).to.have.property('userId').that.equals(userId.toString());
          expect(res.body).to.have.property('name').that.equals(file.name);
          expect(res.body).to.have.property('type').that.equals(file.type);
          expect(res.body).to.have.property('isPublic').that.equals(true);
          expect(res.body).to.have.property('parentId').that.equals(file.parentId === 0 ? '0' : file.parentId.toString());
          done();
        });
    });

    it('should return status 401 on unauthorized request', (done) => {
      const fileId = new ObjectId();

      sandbox.stub(redisClient, 'get').withArgs('auth_invalidtoken').resolves(null);

      chai.request(server)
        .put(`/files/${fileId}/publish`)
        .set('x-token', 'invalidtoken')
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });

    it('should return status 404 when file is not found', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileId = new ObjectId();

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves(null);

      chai.request(server)
        .put(`/files/${fileId}/publish`)
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(404);
          done();
        });
    });
  });

  describe('PUT /files/:id/unpublish', () => {
    it('should return status 200 and updated file data on valid request', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileId = new ObjectId();
      const file = {
        _id: fileId,
        userId,
        name: 'test.txt',
        type: 'file',
        isPublic: true,
        parentId: 0,
      };

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves(file);
      sandbox.stub(dbClient.db.collection('files'), 'updateOne').resolves({ modifiedCount: 1 });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves({ ...file, isPublic: false });

      chai.request(server)
        .put(`/files/${fileId}/unpublish`)
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('id').that.equals(fileId.toString());
          expect(res.body).to.have.property('userId').that.equals(userId.toString());
          expect(res.body).to.have.property('name').that.equals(file.name);
          expect(res.body).to.have.property('type').that.equals(file.type);
          expect(res.body).to.have.property('isPublic').that.equals(false);
          expect(res.body).to.have.property('parentId').that.equals(file.parentId === 0 ? '0' : file.parentId.toString());
          done();
        });
    });

    it('should return status 401 on unauthorized request', (done) => {
      const fileId = new ObjectId();

      sandbox.stub(redisClient, 'get').withArgs('auth_invalidtoken').resolves(null);

      chai.request(server)
        .put(`/files/${fileId}/unpublish`)
        .set('x-token', 'invalidtoken')
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });

    it('should return status 404 when file is not found', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileId = new ObjectId();

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves(null);

      chai.request(server)
        .put(`/files/${fileId}/unpublish`)
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(404);
          done();
        });
    });
  });

  describe('GET /files/:id/data', () => {
    it('should return status 200 and file data on valid request', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileId = new ObjectId();
      const file = {
        _id: fileId,
        userId,
        name: 'test.txt',
        type: 'file',
        isPublic: false,
        localPath: '/tmp/files_manager/test.txt',
        parentId: 0,
      };

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves(file);
      sandbox.stub(fs, 'existsSync').withArgs(file.localPath).returns(true);
      sandbox.stub(fs, 'readFileSync').withArgs(file.localPath).returns(Buffer.from('Hello World'));

      chai.request(server)
        .get(`/files/${fileId}/data`)
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.header).to.have.property('content-type').that.includes('text/plain');
          expect(res.text).to.equal('Hello World');
          done();
        });
    });

    it('should return status 401 on unauthorized request', (done) => {
      const fileId = new ObjectId();

      sandbox.stub(redisClient, 'get').withArgs('auth_invalidtoken').resolves(null);

      chai.request(server)
        .get(`/files/${fileId}/data`)
        .set('x-token', 'invalidtoken')
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });

    it('should return status 404 when file is not found', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileId = new ObjectId();

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves(null);

      chai.request(server)
        .get(`/files/${fileId}/data`)
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(404);
          done();
        });
    });

    it('should return status 404 when file does not exist on disk', (done) => {
      const token = 'validtoken';
      const userId = new ObjectId();
      const fileId = new ObjectId();
      const file = {
        _id: fileId,
        userId,
        name: 'test.txt',
        type: 'file',
        isPublic: false,
        localPath: '/tmp/files_manager/test.txt',
        parentId: 0,
      };

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(userId.toString());
      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: userId });
      sandbox.stub(dbClient.db.collection('files'), 'findOne').resolves(file);
      sandbox.stub(fs, 'existsSync').withArgs(file.localPath).returns(false);

      chai.request(server)
        .get(`/files/${fileId}/data`)
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(404);
          done();
        });
    });
  });
});
