/*global describe, it*/

'use strict';


var assert = require('assert');
var ew = require('../');


describe('Wire', function () {

  it('init', function () {
    assert.ok(ew() instanceof ew);
    /*eslint-disable new-cap*/
    assert.ok((new ew()) instanceof ew);
  });


  it('.on', function (done) {
    var w = ew(),
        data = [];

    w.on('test', function h1() { data.push(1); });
    w.on([ 'test' ], function h2() { data.push(2); });
    w.on('test', function h3() { data.push(3); });

    w.emit('test', function (err) {
      assert.ifError(err);
      assert.deepEqual(data, [ 1, 2, 3 ]);
      done();
    });
  });


  it('.off', function () {
    var w = ew();

    function h1() {}
    function h2() {}
    function h3() {}

    assert.equal(w.has('test'), false);

    w.on('test', h1);
    w.on('test', h2);
    w.after('test', h3);

    assert.equal(w.has('test'), true);

    w.off('test', h2);
    assert.equal(w.has('test'), true);

    w.off('test', h3);
    assert.equal(w.has('test'), true);

    w.off('test', h1);
    assert.equal(w.has('test'), false);
  });


  it('.after', function (done) {
    var w = ew(),
        data = [];

    w.on('test', { priority: 11 }, function h1() { data.push(1); });
    w.on('test', { priority: 9 }, function h2() { data.push(2); });

    w.after('test', function h3() { data.push(3); });

    w.on('test', function h4() { data.push(4); });

    w.after('test', null, function h5() { data.push(5); });

    w.emit('test', function (err) {
      assert.ifError(err);
      assert.deepEqual(data, [ 4, 2, 3, 5, 1 ]);
      done();
    });
  });


  it('.before', function (done) {
    var w = ew(),
        data = [];

    w.before('test', function h1() { data.push(1); });

    w.on('test', function h2() { data.push(2); });

    w.before('test', null, function h3() { data.push(3); });

    w.on('test', { priority: -11 }, function h4() { data.push(4); });
    w.on('test', { priority: -9 }, function h5() { data.push(5); });

    w.emit('test', function (err) {
      assert.ifError(err);
      assert.deepEqual(data, [ 4, 1, 3, 5, 2 ]);
      done();
    });
  });


  it('.once', function (done) {
    var w = ew(),
        data = [];

    w.once('test.*', function h1() { data.push(1); });
    w.once('test.1', null, function h2() { data.push(2); });

    w.emit('test.1', function (e) {
      assert.ifError(e);
      w.emit('test.1', function (err) {
        assert.ifError(err);
        assert.deepEqual(data, [ 1, 2 ]);
        done();
      });
    });
  });


  it('.skip', function (done) {
    var w = ew(), data;

    w.on('foo.*', function foo() { data.push(1); });
    w.on('foo.bar', { name: 'foobar' }, function () { data.push(2); });
    w.on('foo.bar', function foobar2() { data.push(3); });

    data = [];
    w.emit('foo.bar', function (err) {
      assert.ifError(err);
      assert.deepEqual(data, [ 1, 2, 3 ]);

      w.skip('foo.bar', 'foobar');

      data = [];
      w.emit('foo.bar', function (err) {
        assert.ifError(err);
        assert.deepEqual(data, [ 1, 3 ]);

        // Second attempt doesn't change anything
        w.skip('foo.bar', 'foobar');

        data = [];
        w.emit('foo.bar', function (err) {
          assert.ifError(err);
          assert.deepEqual(data, [ 1, 3 ]);
          done();
        });
      });
    });
  });


  it('.skip + wildard', function (done) {
    var w = ew(),
        data;

    w.on('foo.*', function foo() { data.push(1); });
    w.on('foo.bar', function foobar() { data.push(2); });
    w.on('foo.bar', function foobar2() { data.push(3); });
    w.on('baz', function foobaz() { data.push(4); });


    data = [];
    w.emit('foo.bar', function (err) {
      assert.ifError(err);
      assert.deepEqual(data, [ 1, 2, 3 ]);

      data = [];
      w.emit('foo.baz', function (err) {
        assert.ifError(err);
        assert.deepEqual(data, [ 1 ]);

        w.skip('foo*', [ 'foo' ]);

        data = [];
        w.emit('foo.bar', function (err) {
          assert.ifError(err);
          assert.deepEqual(data, [ 2, 3 ]);

          data = [];
          w.emit('foo.baz', function (err) {
            assert.ifError(err);
            assert.deepEqual(data, []);

            data = [];
            w.emit('baz', function (err) {
              assert.ifError(err);
              assert.deepEqual(data, [ 4 ]);

              done();
            });
          });
        });
      });
    });
  });


  it('.has', function () {
    var w = ew();

    assert.equal(w.has('test'), false);

    w.after('test', function () {});

    assert.equal(w.has('test'), false);

    w.on('test', function () {});

    assert.equal(w.has('test'), true);
  });


  it('.stat', function () {
    var w = ew();

    w.once('test.*', function h1() {});
    w.once('test.1', function h2() {});
    w.once('test.2', function h3() {});
    w.once('test.2', function h4() {});

    assert.deepEqual(w.stat().length, 3);
  });


  it('emit multiple', function (done) {
    var w = ew(),
        data = [];

    w.on('test.1', function h1() { data.push(1); });
    w.on('test.2', function h2() { data.push(2); });
    w.on('test.*', function hw() { data.push(3); });

    w.emit([ 'test.1', 'test.2', 'test.3' ], function (err) {
      assert.ifError(err);
      assert.deepEqual(data, [ 1, 3, 2, 3, 3 ]);
      done();
    });
  });


  it('sync + data', function (done) {
    var w = ew(),
        data = {};

    w.on('test', function (obj) {
      obj.foo = 5;
    });

    w.emit('test', data, function(err) {
      assert.ifError(err);
      assert.deepEqual(data, { foo: 5 });
      done(err);
    });
  });


  it('sync + err', function (done) {
    var w = ew(),
        data = {};

    w.on('test', function h1() {
      return new Error('test');
    });

    w.on('test', function h2(obj) {
      obj.foo = 5;
    });

    w.emit('test', data, function () {
      assert.deepEqual(data, {});
      done();
    });
  });


  it('`ensure` option', function (done) {
    var w = ew(),
        data = {};

    w.on('test', function h1() {
      return new Error('test');
    });

    w.on('test', { ensure: true }, function h2(obj) {
      obj.foo = 5;
    });

    w.emit('test', data, function() {
      assert.deepEqual(data, { foo: 5 });
      done();
    });
  });


  it('async + data', function (done) {
    var w = ew(),
        data = {};

    w.on('test', function (obj, cb) {
      obj.foo = 5;
      cb();
    });

    w.emit('test', data, function(err) {
      assert.deepEqual(data, { foo: 5 });
      done(err);
    });
  });


  it('async + err', function (done) {
    var w = ew(),
        data = {};

    w.on('test', function h1(obj, cb) {
      cb(new Error('test'));
    });

    w.on('test', function h2(obj) {
      obj.foo = 5;
    });

    w.emit('test', data, function() {
      assert.deepEqual(data, {});
      done();
    });
  });


  it('errors', function () {
    var w = ew();

    assert.throws(function () {
      w.after('test', { priority: -5 }, function () {});
    });

    assert.throws(function () {
      w.before('test', { priority: 5 }, function () {});
    });

    assert.throws(function () { w.on('test'); });

    assert.throws(function () {
      /*eslint-disable no-unused-vars*/
      w.on('test', function (a, b, c, d) {});
    });

    assert.throws(function () {
      w.on('', function () {});
    });

    assert.throws(function () {
      w.on('*test', function () {});
    });

    assert.throws(function () { w.emit('test*'); });

    assert.throws(function () { w.skip('test'); });

    assert.throws(function () { w.skip('*test'); });
  });


  describe('Generators', function () {

    it('.on', function (done) {
      var w = ew(),
          data = [],
          i = 5;

      function defer(timeout) {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(i++); }, timeout);
        });
      }

      w.on('test', function h1(d, next) {
        d.push(1);
        next();
      });

      w.on('test', function* h2(d) {
        d.push(yield defer(50));
        d.push(yield defer(10));
        d.push(yield defer(5));
      });

      w.emit('test', data, function (err) {
        assert.deepEqual(data, [ 1, 5, 6, 7 ]);
        done(err);
      });
    });


    it('throw', function (done) {
      var w = ew();

      w.on('test', function* (d) {
        throw 'test';
      });

      w.emit('test', function (err) {
        assert.strictEqual(err, 'test');
        done();
      });
    });


    it('throw after yield', function (done) {
      var w = ew();

      function defer() {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(1); }, 100);
        });
      }

      w.on('test', function* (d) {
        yield defer();
        throw 'test';
      });

      w.emit('test', function (err) {
        assert.strictEqual(err, 'test');
        done();
      });
    });

  });
});
