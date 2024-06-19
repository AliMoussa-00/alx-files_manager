import chai from 'chai';
import chaiHttp from 'chai-http';
import sinon from 'sinon';
import AppController from '../../controllers/AppController';
import dbClient from '../../utils/db';
import redisClient from '../../utils/redis';

const { expect } = chai;
chai.use(chaiHttp);

describe('appController', () => {
  let server; // Declare server variable
  let sandbox; // Declare sinon sandbox

  before(() => {
    // Stub isAlive methods
    sinon.stub(redisClient, 'isAlive').returns(true);
    sinon.stub(dbClient, 'isAlive').returns(true);

    // Create a new express server instance
    const express = require('express');
    const app = express();

    // Register routes
    app.get('/status', AppController.getStatus);
    app.get('/stats', AppController.getStats);

    // Start server
    server = app.listen(5000); // Adjust port as necessary

    // Create sinon sandbox
    sandbox = sinon.createSandbox();
  });

  after(() => {
    // Restore stubs and close server
    sinon.restore();
    server.close();
  });

  afterEach(() => {
    // Restore sandbox after each test
    sandbox.restore();
  });

  describe('GET /status', () => {
    it('should return status 200 with redis and db status', () => new Promise((done) => {
      chai.request(server)
        .get('/status')
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('redis').that.is.true;
          expect(res.body).to.have.property('db').that.is.true;
          done();
        });
    }));
  });

  describe('GET /stats', () => {
    it('should return status 200 with number of users and files', () => new Promise((done) => {
      // Stub nbUsers and nbFiles
      sandbox.stub(dbClient, 'nbUsers').resolves(10);
      sandbox.stub(dbClient, 'nbFiles').resolves(5);

      chai.request(server)
        .get('/stats')
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('users').that.is.a('number').and.equals(10);
          expect(res.body).to.have.property('files').that.is.a('number').and.equals(5);
          done();
        });
    }));

    it('should return status 500 on dbClient error', () => new Promise((done) => {
      // Restore the previous stubs and re-stub nbUsers to reject
      sandbox.restore();
      sandbox.stub(dbClient, 'nbUsers').rejects(new Error('Database error'));

      chai.request(server)
        .get('/stats')
        .end((err, res) => {
          expect(res).to.have.status(500);
          expect(res.body).to.have.property('error').that.equals('Internal Server Error');
          done();
        });
    }));
  });
});
