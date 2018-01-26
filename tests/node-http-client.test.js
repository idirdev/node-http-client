'use strict';

/**
 * @file tests/node-http-client.test.js
 * @description Tests for the node-http-client module.
 * @author idirdev
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { HttpClient } = require('../src/index.js');

function createTestServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

test('GET request returns correct shape', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  try {
    const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}` });
    const res = await client.get('/');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { ok: true });
    assert.equal(typeof res.timing, 'number');
    assert.ok(res.headers);
  } finally {
    server.close();
  }
});

test('POST sends JSON body', async () => {
  const { server, port } = await createTestServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ received: body }));
    });
  });
  try {
    const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}` });
    const res = await client.post('/', { name: 'test' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.data.received, { name: 'test' });
  } finally {
    server.close();
  }
});

test('PUT request works', async () => {
  const { server, port } = await createTestServer((req, res) => {
    assert.equal(req.method, 'PUT');
    res.writeHead(200);
    res.end('updated');
  });
  try {
    const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}` });
    const res = await client.put('/', { value: 1 });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});

test('PATCH request works', async () => {
  const { server, port } = await createTestServer((req, res) => {
    assert.equal(req.method, 'PATCH');
    res.writeHead(200);
    res.end('patched');
  });
  try {
    const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}` });
    const res = await client.patch('/', { delta: 1 });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});

test('DELETE request works', async () => {
  const { server, port } = await createTestServer((req, res) => {
    assert.equal(req.method, 'DELETE');
    res.writeHead(204);
    res.end();
  });
  try {
    const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}` });
    const res = await client.delete('/item/1');
    assert.equal(res.status, 204);
  } finally {
    server.close();
  }
});

test('request interceptor modifies config', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ auth: req.headers['x-auth'] }));
  });
  try {
    const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}` });
    client.addRequestInterceptor((config) => {
      config.headers['x-auth'] = 'token123';
      return config;
    });
    const res = await client.get('/');
    assert.equal(res.data.auth, 'token123');
  } finally {
    server.close();
  }
});

test('response interceptor modifies response', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ value: 1 }));
  });
  try {
    const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}` });
    client.addResponseInterceptor((response) => {
      response._intercepted = true;
      return response;
    });
    const res = await client.get('/');
    assert.equal(res._intercepted, true);
  } finally {
    server.close();
  }
});

test('retry on 5xx eventually succeeds', async () => {
  let callCount = 0;
  const { server, port } = await createTestServer((req, res) => {
    callCount++;
    if (callCount < 3) {
      res.writeHead(503);
      res.end('unavailable');
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }
  });
  try {
    const client = new HttpClient({
      baseUrl: `http://127.0.0.1:${port}`,
      retries: 3,
      retryDelay: 10,
      backoff: false,
    });
    const res = await client.get('/');
    assert.equal(res.status, 200);
    assert.ok(callCount >= 3);
  } finally {
    server.close();
  }
});

test('HttpClient.create static factory works', async () => {
  const client = HttpClient.create({ baseUrl: 'http://example.com', timeout: 5000 });
  assert.ok(client instanceof HttpClient);
  assert.equal(client.baseUrl, 'http://example.com');
  assert.equal(client.timeout, 5000);
});

test('defaultHeaders are sent with every request', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ua: req.headers['user-agent'] }));
  });
  try {
    const client = new HttpClient({
      baseUrl: `http://127.0.0.1:${port}`,
      defaultHeaders: { 'user-agent': 'test-agent/1.0' },
    });
    const res = await client.get('/');
    assert.equal(res.data.ua, 'test-agent/1.0');
  } finally {
    server.close();
  }
});

test('timing is a non-negative number', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  try {
    const client = new HttpClient({ baseUrl: `http://127.0.0.1:${port}` });
    const res = await client.get('/');
    assert.equal(typeof res.timing, 'number');
    assert.ok(res.timing >= 0);
  } finally {
    server.close();
  }
});
