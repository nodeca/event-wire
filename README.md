# event-wire

[![Build Status](https://img.shields.io/travis/nodeca/event-wire/master.svg?style=flat)](https://travis-ci.org/nodeca/event-wire)
[![NPM version](https://img.shields.io/npm/v/event-wire.svg?style=flat)](https://www.npmjs.org/package/event-wire)
[![Coverage Status](https://img.shields.io/coveralls/nodeca/event-wire/master.svg?style=flat)](https://coveralls.io/r/nodeca/event-wire?branch=master)

> Mediator with dynamic responsibility chains.

Idea if this package is to have hybrid of [EventEmitter](http://nodejs.org/api/events.html)
and [chain-of-Responsibility](http://en.wikipedia.org/wiki/Chain-of-responsibility_pattern).
In short - dynamic channels with wildcards, and guaranteed execution order for
listeners.

Features:

- sync, async & generator listeners
- wildards
- exclusions


## Install

```bash
npm install event-wire --save
```

## API


### constructor

Create new `event-wire` instanse.

```js
var wire = require('event-wire')();

// With alternate libs
var wire = require('event-wire')({
  co: require('bluebird-co'),
  p: require('bluebird')
});
```

Options can define alternate core libraries (co & promises).


### .emit(channel [, obj, callback])

Sends message with `obj` param into the `channel`. Once all sync and
ascync handlers finished, optional `callback(err)` (if specified) fired.

If callback not passed, `Promise` is returned.


### .on(channels [, options], handler)

Registers `handler` to be executed upon messages in the a single channel
or a sequence of channels stored in `channels` parameter. Handler can be
either sync, async or generator function:

```js
wire.on('foobar', function () {
  return new Error('test'); // You can return error
});

wire.on('foobar', function () {
  throw new Error('test'); // You can throw error
});

wire.on('foobar', function () {
  return new Promise(resolve => { // You can return Promise
    setTimeout(() => { resolve(); }, 1000);
  });
});

wire.on('foobar', function (obj) {
  // do stuff here
});

wire.on('foobar', function (callback) {
  // do stuff here
  callback();
});

wire.on('foobar', function (obj, callback) {
  // do stuff here
  callback();
});

wire.on('foobar', function* (obj) {
  // do stuff here
  yield ...
});
```

Each handler can termitate chain execution by returning not falsy
result (error). Also handker can throw and return `Promise`.

Options:

- `priority` (Number, Default: 0) - execution order (lower is earlier).
  Handlers with equal priorities are executed in definition order.
- `ensure` (Boolean, Default: false) - If `true`, will run handler even
  if one of previous fired error.
- `parallel` (Boolean, Default: false) - all adjacent handlers with the same
  priority that also have `parallel=true` will be executed in parallel.

  For example:

  ```js
  wire.on('foobar', { priority: 9, parallel: true }, handler1); // different priority
  wire.on('foobar', { priority: 10, parallel: true }, handler2); // handler2 and handler3 are parallel
  wire.on('foobar', { priority: 10, parallel: true }, handler3); // handler2 and handler3 are parallel
  wire.on('foobar', { priority: 10 }, handler4); // not parallel
  wire.on('foobar', { priority: 10, parallel: true }, handler5); // handler5 and handler6 are parallel
  wire.on('foobar', { priority: 10, parallel: true }, handler6); // handler5 and handler6 are parallel
  wire.on('foobar', { priority: 11, parallel: true }, handler7); // different priority
  ```
- `name` (String) - handler name, if function is anonimous or you need to
  guarantee it intat after code uglifiers.


### .once(...)

The same as `.on(...)`, but executed only one time.


### .before(...), .after(...)

Aliases of `.on(...)`, but with priority `-10` and `+10`


### .off(channel [, handler])

Removes `handler` of a channel, or removes ALL handlers of a channel if
`handler` is not given.


### .skip(channel, skipList)

Exclude calling list of named handlers for given channel (wildard allowed
at the end):

```js
wire.skip('server:static.*', [
  session_start,
  cookies_start
]);
```


### .has(channel) -> Boolean

Returns if `channel` (String) has at least one subscriber
with zero priority (main handler). Useful for dynamic routing


### .stat() -> Array

Returns array of info about every channel. For debug purposes. For example,
you can write dumper to check that all expected channels have required
handlers. Or to track number of calls.


### .hook(eventName, fn)

Internal messaging for debug. Currently supported events:

- `eachBefore` (handlerInfo, params) - called before every handler execute.
- `eachAfter` (handlerInfo, params) - called after every handler execute.


## License

[MIT](https://github.com/nodeca/event-wire/blob/master/LICENSE)
