import chai from 'chai';
import chaiHttp from 'chai-http';
import sinon from 'sinon';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import UsersController from '../controllers/UsersController';

const expect = chai.expect;
chai.use(chaiHttp);

describe('UsersController', () => {
  let server;
  let sandbox;

  before(() => {
    const express = require('express');
    const app = express();
    app.use(express.json());

    app.post('/users', (req, res) => UsersController.postNew(req, res));

    server = app.listen(3000);

    sandbox = sinon.createSandbox();
  });

  after(() => {
    server.close();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('POST /users', () => {
    it('should return status 201 and user data on valid request', (done) => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const fakeInsertId = new ObjectId();

      const findOneStub = sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves(null);
      const insertOneStub = sandbox.stub(dbClient.db.collection('users'), 'insertOne').resolves({ insertedId: fakeInsertId });

      chai.request(server)
        .post('/users')
        .send(userData)
        .end((err, res) => {
          if (err) {
            done(err);
            return;
          }
          expect(res).to.have.status(201);
          expect(res.body).to.have.property('id').that.equals(fakeInsertId.toString());
          expect(res.body).to.have.property('email').that.equals(userData.email);

          // Ensure the stubs were called as expected
          sinon.assert.calledOnce(findOneStub);
          sinon.assert.calledOnce(insertOneStub);

          done();
        });
    });

    it('should return status 400 when email is missing', (done) => {
      const userData = {
        password: 'password123',
      };

      chai.request(server)
        .post('/users')
        .send(userData)
        .end((err, res) => {
          expect(res).to.have.status(400);
          expect(res.body).to.have.property('error').that.equals('Missing email');
          done();
        });
    });

    it('should return status 400 when password is missing', (done) => {
      const userData = {
        email: 'test@example.com',
      };

      chai.request(server)
        .post('/users')
        .send(userData)
        .end((err, res) => {
          expect(res).to.have.status(400);
          expect(res.body).to.have.property('error').that.equals('Missing password');
          done();
        });
    });

    it('should return status 400 when email already exists', (done) => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };

      sandbox.stub(dbClient.db.collection('users'), 'findOne').resolves({ _id: new ObjectId() });

      chai.request(server)
        .post('/users')
        .send(userData)
        .end((err, res) => {
          expect(res).to.have.status(400);
          expect(res.body).to.have.property('error').that.equals('Already exist');
          done();
        });
    });
  });
});
