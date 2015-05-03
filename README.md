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

- sync & async listeners
- wildards
- exclusions


## Install

```bash
npm install event-wire --save
```

## API


### constructor

```js
var wire = new require('event-wire');
// or
var wire = require('event-wire')();
```

Create new `event-wire` instanse.


### .emit(channels [, obj, callback])

Sends message with `obj` param into the `channels` (String|Array). Once all
sync and ascync handlers finished, optional `callback(err)` (if specified) fired.


### .on(channels [, options], handler)

Registers `handler` to be executed upon messages in the a single channel
or a sequence of channels stored in `channels` parameter. Handler can be
either sync function:

```js
wire.on('foobar', function () {
  // do stuff here
});

wire.on('foobar', function (obj) {
  // do stuff here
});
```

Or it might be an async function with `callback(err)` second argument:

```js
wire.on('foobar', function (obj, callback) {
  // do stuff here
  callback(null);
});
```

Each handler can termitate chain execution by returning not falsy result (error)

Options:

- `priority` (Number, Default: 0) - execution order (lower is earlier).
  Handlers with equal priorities are executed in definition order.
- `ensure` (Boolean, Default: false) - If `true`, will run handler even
  if one of previous fired error.
- `name` (String) - handler name, if function is anonimous or you need to
  guarantee it intat after code uglifiers.


### .once(channels [, options], handler)

The same as `.on()`, but executed only one time.


### .before(...), .after(...)

Aliases of `.on(...)`, but with priority `-10` and `+10`


### .off(channel[, handler])

Removes `handler` of a channel, or removes ALL handlers of a channel if
`handler` is not given.


### .skip(channel, skipList)

Exclude calling list of named handlers for given chennel (wildards allowed):

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


## License

[MIT](https://github.com/nodeca/event-wire/blob/master/LICENSE)
