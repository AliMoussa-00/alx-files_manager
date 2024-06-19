import chai from 'chai';
import chaiHttp from 'chai-http';
import sinon from 'sinon';
import { ObjectId } from 'mongodb';
import sha1 from 'sha1';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import AuthController from '../controllers/AuthController';

const expect = chai.expect;
chai.use(chaiHttp);

describe('AuthController', () => {
  let server;
  let sandbox;

  before(() => {
    const express = require('express');
    const app = express();
    app.use(express.json());

    app.get('/connect', (req, res) => AuthController.getConnect(req, res));
    app.get('/disconnect', (req, res) => AuthController.getDisconnect(req, res));
    app.get('/users/me', (req, res) => AuthController.getMe(req, res));

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

  describe('GET /connect', () => {
    it('should return status 200 and token on valid credentials', (done) => {
      const email = 'test@example.com';
      const password = 'password';
      const hashedPassword = sha1(password);
      const base64Credentials = Buffer.from(`${email}:${password}`).toString('base64');
      const authHeader = `Basic ${base64Credentials}`;

      const user = { _id: new ObjectId(), email, password: hashedPassword };

      const findOneStub = sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves(user);
      const setStub = sandbox.stub(redisClient, 'set').resolves();

      chai.request(server)
        .get('/connect')
        .set('Authorization', authHeader)
        .end((err, res) => {
          if (err) {
            done(err);
            return;
          }
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('token').that.is.a('string');
          expect(findOneStub.calledOnce).to.be.true;
          expect(setStub.calledOnce).to.be.true;
          done();
        });
    });

    it('should return status 401 on invalid credentials', (done) => {
      const email = 'test@example.com';
      const password = 'wrongpassword';
      const base64Credentials = Buffer.from(`${email}:${password}`).toString('base64');
      const authHeader = `Basic ${base64Credentials}`;

      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves(null);

      chai.request(server)
        .get('/connect')
        .set('Authorization', authHeader)
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });

    it('should return status 500 on missing authorization header', (done) => {
      chai.request(server)
        .get('/connect')
        .end((err, res) => {
          expect(res).to.have.status(500);
          done();
        });
    });
  });

  describe('GET /disconnect', () => {
    it('should return status 204 on valid token', (done) => {
      const token = 'validtoken';
      const key = `auth_${token}`;

      sandbox.stub(redisClient, 'get').withArgs(key).resolves('validUserId');
      sandbox.stub(redisClient, 'del').resolves();

      chai.request(server)
        .get('/disconnect')
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(204);
          done();
        });
    });

    it('should return status 401 on invalid token', (done) => {
      const token = 'invalidtoken';

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(null);

      chai.request(server)
        .get('/disconnect')
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });
  });

  describe('GET /users/me', () => {
    it('should return status 200 and user information on valid token', (done) => {
      const token = 'validtoken';
      const key = `auth_${token}`;
      const userId = new ObjectId().toString();

      sandbox.stub(redisClient, 'get').withArgs(key).resolves(userId);
      const user = { _id: new ObjectId(userId), email: 'test@example.com' };
      const findOneStub = sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves(user);

      chai.request(server)
        .get('/users/me')
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('id').that.equals(userId);
          expect(res.body).to.have.property('email').that.equals('test@example.com');
          expect(findOneStub.calledOnce).to.be.true;
          done();
        });
    });

    it('should return status 401 on invalid token', (done) => {
      const token = 'invalidtoken';

      sandbox.stub(redisClient, 'get').withArgs(`auth_${token}`).resolves(null);

      chai.request(server)
        .get('/users/me')
        .set('x-token', token)
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });
  });
});
