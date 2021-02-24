'use strict';


var assert = require('assert');
var ew     = require('../');

var ew_opts = {};

describe('Wire', function () {

  it('init', function () {
    assert.ok(ew() instanceof ew);
    /*eslint-disable new-cap*/
    assert.ok((new ew()) instanceof ew);
  });


  it('.on', function (done) {
    var w = ew(ew_opts),
        data = [];

    w.on('test', function h1() { data.push(1); });
    w.on([ 'test' ], function h2() { data.push(2); });
    w.on('test', function h3() { data.push(3); });

    w.emit('test', function (err) {
      assert.ifError(err);
      assert.deepStrictEqual(data, [ 1, 2, 3 ]);
      done();
    });
  });


  it('.off', function () {
    var w = ew(ew_opts);

    function h1() {}
    function h2() {}
    function h3() {}

    assert.strictEqual(w.has('test'), false);

    w.on('test', h1);
    w.on('test', h2);
    w.after('test', h3);

    assert.strictEqual(w.has('test'), true);

    w.off('test', h2);
    assert.strictEqual(w.has('test'), true);

    w.off('test', h3);
    assert.strictEqual(w.has('test'), true);

    w.off('test', h1);
    assert.strictEqual(w.has('test'), false);
  });


  it('.after', function (done) {
    var w = ew(ew_opts),
        data = [];

    w.on('test', { priority: 11 }, function h1() { data.push(1); });
    w.on('test', { priority: 9 }, function h2() { data.push(2); });

    w.after('test', function h3() { data.push(3); });

    w.on('test', function h4() { data.push(4); });

    w.after('test', null, function h5() { data.push(5); });

    w.emit('test', function (err) {
      assert.ifError(err);
      assert.deepStrictEqual(data, [ 4, 2, 3, 5, 1 ]);
      done();
    });
  });


  it('.before', function (done) {
    var w = ew(ew_opts),
        data = [];

    w.before('test', function h1() { data.push(1); });

    w.on('test', function h2() { data.push(2); });

    w.before('test', null, function h3() { data.push(3); });

    w.on('test', { priority: -11 }, function h4() { data.push(4); });
    w.on('test', { priority: -9 }, function h5() { data.push(5); });

    w.emit('test', function (err) {
      assert.ifError(err);
      assert.deepStrictEqual(data, [ 4, 1, 3, 5, 2 ]);
      done();
    });
  });


  it('.once', function (done) {
    var w = ew(ew_opts),
        data = [];

    w.once('test.*', function h_sync() {
      data.push(1);
    });

    w.once('test.*', function h_async(__, cb) {
      data.push(2);
      cb();
    });

    w.once('test.*', function* h_gen() {
      data.push(3);
    });

    w.once('test.1', null, function h_end() {
      data.push(4);
    });

    w.emit('test.1', function (e) {
      assert.ifError(e);
      w.emit('test.1', function (err) {
        assert.ifError(err);
        assert.deepStrictEqual(data, [ 1, 2, 3, 4 ]);
        done();
      });
    });
  });


  it('.skip', function (done) {
    var w = ew(ew_opts), data;

    w.on('foo.*', function foo() { data.push(1); });
    w.on('foo.bar', { name: 'foobar' }, function () { data.push(2); });
    w.on('foo.bar', function foobar2() { data.push(3); });

    data = [];
    w.emit('foo.bar', function (err) {
      assert.ifError(err);
      assert.deepStrictEqual(data, [ 1, 2, 3 ]);

      w.skip('foo.bar', 'foobar');

      data = [];
      w.emit('foo.bar', function (err) {
        assert.ifError(err);
        assert.deepStrictEqual(data, [ 1, 3 ]);

        // Second attempt doesn't change anything
        w.skip('foo.bar', 'foobar');

        data = [];
        w.emit('foo.bar', function (err) {
          assert.ifError(err);
          assert.deepStrictEqual(data, [ 1, 3 ]);
          done();
        });
      });
    });
  });


  it('.skip + wildard', function (done) {
    var w = ew(ew_opts),
        data;

    w.on('foo.*', function foo() { data.push(1); });
    w.on('foo.bar', function foobar() { data.push(2); });
    w.on('foo.bar', function foobar2() { data.push(3); });
    w.on('baz', function foobaz() { data.push(4); });


    data = [];
    w.emit('foo.bar', function (err) {
      assert.ifError(err);
      assert.deepStrictEqual(data, [ 1, 2, 3 ]);

      data = [];
      w.emit('foo.baz', function (err) {
        assert.ifError(err);
        assert.deepStrictEqual(data, [ 1 ]);

        w.skip('foo*', [ 'foo' ]);

        data = [];
        w.emit('foo.bar', function (err) {
          assert.ifError(err);
          assert.deepStrictEqual(data, [ 2, 3 ]);

          data = [];
          w.emit('foo.baz', function (err) {
            assert.ifError(err);
            assert.deepStrictEqual(data, []);

            data = [];
            w.emit('baz', function (err) {
              assert.ifError(err);
              assert.deepStrictEqual(data, [ 4 ]);

              done();
            });
          });
        });
      });
    });
  });


  it('.has', function () {
    var w = ew(ew_opts);

    assert.strictEqual(w.has('test'), false);

    w.after('test', function () {});

    assert.strictEqual(w.has('test'), false);

    w.on('test', function () {});

    assert.strictEqual(w.has('test'), true);
  });


  it('.stat', function () {
    var w = ew(ew_opts);

    w.once('test.*', function h1() {});
    w.once('test.1', function h2() {});
    w.once('test.2', function h3() {});
    w.once('test.2', function h4() {});

    assert.deepStrictEqual(w.stat().length, 3);
  });


  it('sync + data', function (done) {
    var w = ew(ew_opts),
        data = {};

    w.on('test', function (obj) {
      obj.foo = 5;
    });

    w.emit('test', data, function (err) {
      assert.ifError(err);
      assert.deepStrictEqual(data, { foo: 5 });
      done(err);
    });
  });


  it('sync + return err', function (done) {
    var w = ew(ew_opts),
        data = {};

    w.on('test', function h1() {
      return new Error('test');
    });

    w.on('test', function h2(obj) {
      obj.foo = 5;
    });

    w.emit('test', data, function (err) {
      assert.strictEqual(err.message, 'test');
      assert.deepStrictEqual(data, {});
      done();
    });
  });


  it('sync + throw err', function (done) {
    var w = ew(ew_opts),
        data = {};

    w.on('test', function h1() {
      throw new Error('test');
    });

    w.on('test', function h2(obj) {
      obj.foo = 5;
    });

    w.emit('test', data, function (err) {
      assert.strictEqual(err.message, 'test');
      assert.deepStrictEqual(data, {});
      done();
    });
  });


  it('sync + promise', function (done) {
    var w = ew(ew_opts),
        data = [];

    w.on('test', function h1() {
      return new Promise(function (resolve) {
        setTimeout(function () {
          data.push(1);
          resolve();
        }, 50);
      });
    });

    w.on('test', function h2() {
      data.push(5);
    });

    w.emit('test', function () {
      assert.deepStrictEqual(data, [ 1, 5 ]);
      done();
    });
  });


  it('`ensure` option', function (done) {
    var w = ew(ew_opts),
        data = {};

    w.on('test', function h1() {
      return new Error('test');
    });

    // coverage
    w.on('test', function* hg(obj) {
      obj.bar = 'failed';
    });
    w.on('test', function hcb(obj, cb) {
      obj.bar = 'failed';
      cb();
    });

    w.on('test', { ensure: true }, function h2(obj) {
      obj.foo = 5;
    });
    // coverage - should not override prev error
    w.on('test', { ensure: true }, function h3(obj) {
      obj.zab = 6;
      throw new Error('overriden');
    });

    w.emit('test', data, function (err) {
      assert.strictEqual(err.message, 'test');
      assert.deepStrictEqual(data, { foo: 5, zab: 6 });
      done();
    });
  });


  it('`parallel` option', function (done) {
    var w = ew(ew_opts),
        data = [];

    function handler(name) {
      return function (__, cb) {
        data.push(name + ' start');

        setTimeout(function () {
          data.push(name + ' end');
          cb();
        }, 1);
      };
    }

    w.on('test', { priority: 9, parallel: true }, handler('h0'));
    w.on('test', { priority: 10, parallel: true }, handler('h1'));
    w.on('test', { priority: 10 }, handler('h2'));
    w.on('test', { priority: 10, parallel: true }, handler('h3parr'));
    w.on('test', { priority: 10, parallel: true }, handler('h4parr'));
    w.on('test', { priority: 11, parallel: true }, handler('h5'));

    w.emit('test', data, function (err) {
      assert.deepStrictEqual(data, [
        'h0 start',
        'h0 end',
        'h1 start',
        'h1 end',
        'h2 start',
        'h2 end',
        'h3parr start',
        'h4parr start',
        'h3parr end',
        'h4parr end',
        'h5 start',
        'h5 end'
      ]);
      done(err);
    });
  });


  it('`parallel` + error', function (done) {
    var w = ew(ew_opts),
        data = [];

    w.on('test', { priority: 10, parallel: true }, function h0(__, cb) {
      data.push('h0 start');

      setTimeout(function () {
        data.push('h0 end');
        cb();
      }, 1);
    });

    w.on('test', { priority: 10, parallel: true }, function h1(__, cb) {
      data.push('h1 start');

      setTimeout(function () {
        data.push('h1 end');
        cb(new Error('test'));
      }, 1);
    });

    w.on('test', { priority: 10, parallel: true }, function h2(__, cb) {
      data.push('h2 start');

      setTimeout(function () {
        data.push('h2 end');
        cb();
      }, 1);
    });

    w.on('test', { priority: 11, parallel: true }, function h3(__, cb) {
      data.push('h3 start');

      setTimeout(function () {
        data.push('h3 end');
        cb();
      }, 1);
    });

    w.emit('test', data, function (err) {
      assert.strictEqual(err.message, 'test');
      assert.deepStrictEqual(data, [
        'h0 start',
        'h1 start',
        'h2 start',
        'h0 end',
        'h1 end',
        'h2 end'
      ]);
      done();
    });
  });


  it('async + data', function (done) {
    var w = ew(ew_opts),
        data = {};

    w.on('test', function (obj, cb) {
      obj.foo = 5;
      cb();
    });

    w.emit('test', data, function (err) {
      assert.deepStrictEqual(data, { foo: 5 });
      done(err);
    });
  });


  it('async + err', function (done) {
    var w = ew(ew_opts),
        data = {};

    w.on('test', function h1(obj, cb) {
      cb(new Error('test'));
    });

    w.on('test', function h2(obj) {
      obj.foo = 5;
    });

    w.emit('test', data, function () {
      assert.deepStrictEqual(data, {});
      done();
    });
  });


  it('async + `.off()` race condition', function (done) {
    var w = ew();

    function h2() {
    }

    function h1(__, callback) {
      w.off('test', h2);
      setTimeout(callback, 1);
    }

    w.on('test', h1);
    w.on('test', h2);

    w.emit('test', done);
  });


  describe('errors', function () {

    it('bad priority', function () {
      var w = ew(ew_opts);

      assert.throws(function () {
        w.after('test', { priority: -5 }, function () {});
      });

      assert.throws(function () {
        w.before('test', { priority: 5 }, function () {});
      });
    });


    it('bad params count', function () {
      var w = ew(ew_opts);

      assert.throws(function () { w.on('test'); });

      assert.throws(function () {
        /*eslint-disable no-unused-vars*/
        w.on('test', function (a, b, c, d) {});
      });
    });

    it('bad handler', function () {
      var w = ew(ew_opts);

      assert.throws(function () { w.on('test', []); });
    });


    it('bad channel name (configure)', function () {
      var w = ew(ew_opts);

      assert.throws(function () {
        w.on('', function () {});
      });

      assert.throws(function () {
        w.on('*test', function () {});
      });

      assert.throws(function () {
        w.skip('test');
      });

      assert.throws(function () {
        w.skip('*test');
      });
    });


    it('bad channel name (emit *)', function (done) {
      var w = ew(ew_opts);
      // Do we really need it?
      w.emit('test*', function (err) {
        done(!err);
      });
    });

    it('bad channel name (emit [])', function (done) {
      var w = ew(ew_opts);
      // Do we really need it?
      w.emit([ 'test1', 'test2' ], function (err) {
        done(!err);
      });
    });

    it('emit empty values', function () {
      var w = ew(ew_opts),
          log = [];

      w.on('test', function () {
        log.push(Array.prototype.slice.call(arguments, 0));
      });

      /*eslint-disable no-undefined*/
      return w.emit('test', {})
        .then(function () { return w.emit('test', []); })
        .then(function () { return w.emit('test', ''); })
        .then(function () { return w.emit('test', null); })
        .then(function () { return w.emit('test', undefined); })
        .then(function () { return w.emit('test', false); })
        .then(function () {
          assert.deepStrictEqual(log, [
            [ {} ],
            [ [] ],
            [ '' ],
            [ null ],
            [ undefined ],
            [ false ]
          ]);
        });
    });

  });


  describe('Generators', function () {

    it('.on', function (done) {
      var w = ew(ew_opts),
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
        assert.deepStrictEqual(data, [ 1, 5, 6, 7 ]);
        done(err);
      });
    });


    it('throw', function (done) {
      var w = ew(ew_opts);

      w.on('test', function* (d) {
        throw 'test';
      });

      w.emit('test', function (err) {
        assert.strictEqual(err, 'test');
        done();
      });
    });


    it('throw after yield', function (done) {
      var w = ew(ew_opts);

      function defer() {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(1); }, 50);
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


    it('promise resolved', function (done) {
      var w = ew(ew_opts);

      function defer() {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(1); }, 50);
        });
      }

      w.on('test', function* (d) {
        yield defer();
      });

      w.emit('test')
        .then(function () {
          done();
        })
        .catch(done);
    });


    it('promise rejected', function (done) {
      var w = ew(ew_opts);

      w.on('test', function* (d) {
        throw 'test';
      });

      w.emit('test')
        .catch(function (err) {
          assert.strictEqual(err, 'test');
          done();
        });
    });
  });


  describe('Async/Await', function () {
    it('.on', function (done) {
      var w = ew(ew_opts),
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

      w.on('test', async function h2(d) {
        d.push(await defer(50));
        d.push(await defer(10));
        d.push(await defer(5));
      });

      w.emit('test', data, function (err) {
        assert.deepStrictEqual(data, [ 1, 5, 6, 7 ]);
        done(err);
      });
    });


    it('throw', function (done) {
      var w = ew(ew_opts);

      w.on('test', async function (d) {
        throw 'test';
      });

      w.emit('test', function (err) {
        assert.strictEqual(err, 'test');
        done();
      });
    });


    it('throw after await', function (done) {
      var w = ew(ew_opts);

      function defer() {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(1); }, 50);
        });
      }

      w.on('test', async function (d) {
        await defer();
        throw 'test';
      });

      w.emit('test', function (err) {
        assert.strictEqual(err, 'test');
        done();
      });
    });


    it('promise resolved', function (done) {
      var w = ew(ew_opts);

      function defer() {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(1); }, 50);
        });
      }

      w.on('test', async function (d) {
        await defer();
      });

      w.emit('test')
        .then(function () {
          done();
        })
        .catch(done);
    });


    it('promise rejected', function (done) {
      var w = ew(ew_opts);

      w.on('test', async function (d) {
        throw 'test';
      });

      w.emit('test')
        .catch(function (err) {
          assert.strictEqual(err, 'test');
          done();
        });
    });
  });


  describe('.hook', function () {

    it('eachBefore and eachAfter with async', function () {
      var w = ew(ew_opts);

      var beforeFns = [], afterFns = [];

      w.hook('eachBefore', function (fn) {
        beforeFns.push(fn.name);
      });

      w.hook('eachAfter', function (fn) {
        afterFns.push(fn.name);
      });

      w.before('test', function beforeFn(__, callback) {
        callback();
      });
      w.on('test', function onFn(__, callback) {
        callback();
      });
      w.after('test', function afterFn(__, callback) {
        callback();
      });

      w.emit('test', function () {
        assert.deepStrictEqual(beforeFns, [ 'beforeFn', 'onFn', 'afterFn' ]);
        assert.deepStrictEqual(afterFns, [ 'beforeFn', 'onFn', 'afterFn' ]);
      });
    });


    it('eachBefore and eachAfter with sync', function () {
      var w = ew(ew_opts);

      var beforeFns = [], afterFns = [];

      w.hook('eachBefore', function (fn) {
        beforeFns.push(fn.name);
      });

      w.hook('eachAfter', function (fn) {
        afterFns.push(fn.name);
      });

      w.before('test', function beforeFn(__) {
      });
      w.on('test', function onFn(__) {
      });
      w.after('test', function afterFn(__) {
      });

      w.emit('test', function () {
        assert.deepStrictEqual(beforeFns, [ 'beforeFn', 'onFn', 'afterFn' ]);
        assert.deepStrictEqual(afterFns, [ 'beforeFn', 'onFn', 'afterFn' ]);
      });
    });


    it('eachBefore and eachAfter with promise', function (done) {
      var w = ew(ew_opts);

      function defer() {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(1); }, 5);
        });
      }

      var beforeFns = [], afterFns = [];

      w.hook('eachBefore', function (fn) {
        beforeFns.push(fn.name);
      });

      w.hook('eachAfter', function (fn) {
        afterFns.push(fn.name);
      });

      w.before('test', function* beforeFn(__) {
        yield defer();
      });
      w.on('test', function* onFn(__) {
        yield defer();
      });
      w.after('test', function* afterFn(__) {
        yield defer();
      });

      w.emit('test', function () {
        assert.deepStrictEqual(beforeFns, [ 'beforeFn', 'onFn', 'afterFn' ]);
        assert.deepStrictEqual(afterFns, [ 'beforeFn', 'onFn', 'afterFn' ]);
        done();
      });
    });
  });
});
