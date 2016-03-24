/**
 *  class Wire
 **/
'use strict';


var nextTick = require('next-tick');


//////////////////////////////////////////////////////////////////////////////
// Helpers

function _class(obj) { return Object.prototype.toString.call(obj); }

function isString(obj) { return _class(obj) === '[object String]'; }
function isFunction(obj) { return _class(obj) === '[object Function]'; }


//
// Simplified stable sort implementation from Lo-Dash (http://lodash.com/)
//

function compareAscending(a, b) {
  var ai = a.idx,
      bi = b.idx;

  a = a.criteria;
  b = b.criteria;

  // ensure a stable sort in V8 and other engines
  // http://code.google.com/p/v8/issues/detail?id=90
  if (a !== b) {
    if (a > b || typeof a === 'undefined') {
      return 1;
    }
    /*istanbul ignore next*/
    if (a < b || typeof b === 'undefined') {
      return -1;
    }
  }

  /*istanbul ignore next*/
  return ai < bi ? -1 : 1;
}

function stableSort(arr) {
  var idx,
      len    = arr.length,
      result = new Array(len);

  for (idx = 0; idx < len; idx += 1) {
    result[idx] = {
      criteria: arr[idx].priority,
      idx:      idx,
      val:      arr[idx]
    };
  }

  result.sort(compareAscending);

  for (idx = 0; idx < len; idx += 1) {
    result[idx] = result[idx].val;
  }

  return result;
}


function isGeneratorFunction(obj) {
  var constructor = obj.constructor;
  /*istanbul ignore if*/
  if (!constructor) {
    return false;
  }
  if (constructor.name === 'GeneratorFunction' ||
      constructor.displayName === 'GeneratorFunction') {
    return true;
  }
  return false;
}


function isPromise(obj) {
  return typeof obj.then === 'function';
}


//////////////////////////////////////////////////////////////////////////////


// Structure to hold handler data
function WireHandler(channel, options, func) {
  if (channel.indexOf('*') !== -1 &&
      channel.indexOf('*') !== channel.length - 1) {
    throw new Error("Bad channel name '" + channel + "'. Broadcast symbol (*) must " +
                    'be the last character.');
  }

  this.channel   = channel;
  this.func      = func;
  this.name      = func.name || options.name || '<anonymous>';
  this.gen       = isGeneratorFunction(func);
  this.sync      = func.length === 0 || func.length === 1;
  this.once      = Boolean(options.once);
  this.ensure    = Boolean(options.ensure);
  this.priority  = Number(options.priority || 0);
  this.ncalled   = 0;

  // Use channel name of this handler only as a prefix to match or not.
  this.isBroadcast = (channel.charAt(channel.length - 1) === '*');

  // Used to match this handler.
  this.lookupString = this.isBroadcast ? channel.slice(0, -1) : channel;
}


//////////////////////////////////////////////////////////////////////////////


function Wire(options) {
  if (!(this instanceof Wire)) { return new Wire(options); }

  var opts = options || {};

  this.__co = opts.co || require('co');
  this.__p = opts.p || Promise;

  this.__hooks          = {};
  this.__handlers       = [];
  this.__sortedCache    = [];
  this.__knownChannels  = {};
  this.__skips          = {};
}


// Add hook.
//
Wire.prototype.hook = function (eventName, handler) {
  this.__hooks[eventName] = this.__hooks[eventName] || [];
  this.__hooks[eventName].push(handler);
};


// Returns true if `handlerName` must be skipped on `channelName`.
//
Wire.prototype.__checkSkip = function (handlerName, channelName) {

  return !!(this.__skips[handlerName] || []).some(function (skip) {
    var wcard = skip.charAt(skip.length - 1) === '*';

    if (!wcard && skip === channelName) { return true; }

    if (wcard && (channelName.indexOf(skip.slice(0, -1)) === 0)) { return true; }
  });
};


Wire.prototype.__getHandlers = function (channel) {
  var self = this, result;

  if (!this.__sortedCache[channel]) {
    result = [];

    this.__handlers.forEach(function (handler) {

      // Respect skips.
      if (self.__checkSkip(handler.name, channel)) {
        return;
      }

      // Non-broadcast handler - do exact match.
      if (!handler.isBroadcast && (channel !== handler.lookupString)) {
        return;
      }

      // Broadcast handler - match as a prefix.
      if (handler.isBroadcast && (channel.indexOf(handler.lookupString)) !== 0) {
        return;
      }

      result.push(handler);
    });

    // We must use stable sort here to be sure, that handlers in the resulting
    // list will be placed exactly in the order they are declared.
    this.__sortedCache[channel] = stableSort(result);
  }

  return this.__sortedCache[channel];
};


// Helper to run hooks
//
function _hook(slf, name, handlerInfo, params) {
  if (!slf.__hooks[name]) { return; }

  slf.__hooks[name].forEach(function (hook) {
    hook(handlerInfo, params);
  });
}


// Run all listeners for specific channel
//
Wire.prototype.__emitOne = function (ch, params) {
  var p = this.__p.resolve(),
      self = this,
      errored = false, err;

  function storeErrOnce(e) {
    if (errored) { return; }
    errored = true;
    err = e;
  }

  this.__getHandlers(ch).slice().forEach(function (wh) {
    var fn = wh.func;

    if (!fn) { return; }

    if (wh.once) { self.off(wh.channel, fn); }

    if (wh.gen) {
      // Handler is generator
      p = p.then(function () {
        if (errored && !wh.ensure) { return null; }
        wh.ncalled++;
        _hook(self, 'eachBefore', wh, params);

        return self.__co(fn, params);
      });

    } else if (wh.sync) {
      // Handler is sync function, but can
      // throw, return error or Promise.
      p = p.then(function () {
        if (errored && !wh.ensure) { return null; }
        wh.ncalled++;
        _hook(self, 'eachBefore', wh, params);

        var val = fn(params);

        if (val) {
          if (isPromise(val)) { return val; }
          throw val;
        }
      });
    } else {
      // Handler is async function
      p = p.then(function () {
        if (errored && !wh.ensure) { return null; }
        wh.ncalled++;
        _hook(self, 'eachBefore', wh, params);

        return new self.__p(function (resolve, reject) {
          fn(params, function (err) {
            if (!err) {
              resolve();
            } else {
              reject (err);
            }
          });
        });
      });
    }

    // Finalize handlker exec - should care about errors and post-hooks.
    p =  p.catch(storeErrOnce)
          .then(function () {
            if (errored && !wh.ensure) { return null; }
            _hook(self, 'eachAfter', wh, params);
          })
          .catch(storeErrOnce);
  });

  // We combined full chain of calls, now restore
  // the first error if happened, and return as promise.
  return p.then(function () {
    if (errored) { throw err; }
  });
};

/**
 *  Wire#emit(channels [, params, callback]) -> Void
 *  - channel (String):
 *  - params (Mixed):
 *  - callback (Function):
 *
 *  Sends message with `params` into the `channel`. Once all sync and ascync
 *  handlers finished, optional `callback(err)` (if specified) fired.
 **/
Wire.prototype.emit = function (channel, params, callback) {
  if (!callback && isFunction(params)) {
    callback = params;
    params = null;
  }

  var p = this.__p.resolve();

  if (!isString(channel)) {
    p = p.then(function () {
      throw new Error('Channel name should be a string: ' + channel);
    });
  }
  if (channel.indexOf('*') >= 0) {
    p = p.then(function () {
      throw new Error("Bad channel name '" + channel + "'. Wildard `*` not allowed in emitter");
    });
  }

  var self = this;
  p = p.then(function () { return self.__emitOne(channel, params); });

  // No callback - return promise
  if (!callback) {
    return p;
  }

  // Callback magic
  p.then(function () {
      nextTick(callback.bind(null));
    })
    .catch(function (err) {
      nextTick(callback.bind(null, err));
    });
};


/**
 *  Wire#on(channels[, options], handler) -> Void
 *  - channels (String | Array):
 *  - options (Object):
 *  - handler (Function):
 *
 *  Registers `handler` to be executed upon messages in the a single channel
 *  or a sequence of channels stored in `channels` parameter. Handler can be
 *  either sync function:
 *
 *      wire.on('foobar', function () {
 *        // do stuff here
 *      });
 *
 *      wire.on('foobar', function (params) {
 *        // do stuff here
 *      });
 *
 *  Or it might be an async function with `callback(err)` second argument:
 *
 *      wire.on('foobar', function (params, callback) {
 *        // do stuff here
 *        callback(null);
 *      });
 *
 *
 *  ##### Options
 *
 *  - `priority` (Number, Default: 0)
 *  - `ensure` (Boolean, Default: false)
 *    If `true`, will run handler even if one of previous fired error.
 **/
Wire.prototype.on = function (channels, options, handler) {
  if (!channels) {
    throw new Error('Channel name required. Use `*` if you want "any channel".');
  }

  if (!Array.isArray(channels)) {
    channels = [ channels ];
  }

  if (!handler) {
    handler = options;
    options = null;
  }

  options = options || {};

  if (!isFunction(handler)) {
    throw new Error('Listener should be the function');
  }

  if (handler.length !== 0 && handler.length !== 1 && handler.length !== 2) {
    throw new Error('Function must accept exactly 0 (sync), 1 (sync), or 2 (async) arguments');
  }

  channels.forEach(function (channelName) {
    var wh = new WireHandler(channelName, options, handler);

    // Count main channel handler (no wildcards, zero-priority)
    if (wh.priority === 0) {
      this.__knownChannels[channelName] = (this.__knownChannels[channelName] || 0) + 1;
    }

    this.__handlers.push(wh);
  }, this);

  // TODO: Move to separate method
  this.__sortedCache = [];
};


/**
 *  Wire#once(channel[, options], handler) -> Void
 *  - channel (String):
 *  - options (Object):
 *  - handler (Function):
 *
 *  Same as [[Wire#on]] but runs handler one time only.
 **/
Wire.prototype.once = function (channel, options, handler) {
  if (!handler) {
    handler = options;
    options = {};
  }

  options = options || {};
  options.once = true;

  this.on(channel, options, handler);
};


/**
 *  Wire#before(channel[, options], handler) -> Void
 *  - channel (String):
 *  - options (Object):
 *  - handler (Function):
 *
 *  Same as [[Wire#on]] but with 'fixed' priority of `-10`
 **/
Wire.prototype.before = function (channel, options, handler) {
  if (!handler) {
    handler = options;
    options = {};
  }

  options = options || {};
  options.priority = options.priority || -10;

  if (options.priority >= 0) {
    throw new Error('.before() requires priority lower than 0');
  }

  return this.on(channel, options, handler);
};


/**
 *  Wire#after(channel[, options], handler) -> Void
 *  - channel (String):
 *  - options (Object):
 *  - handler (Function):
 *
 *  Same as [[Wire#on]] but with default priority of `10`
 **/
Wire.prototype.after = function (channel, options, handler) {
  if (!handler) {
    handler = options;
    options = {};
  }

  options = options || {};
  options.priority = options.priority || 10;

  if (options.priority <= 0) {
    throw new Error('.after() requires priority greater than 0');
  }

  return this.on(channel, options, handler);
};


/**
 *  Wire#off(channel[, handler]) -> Void
 *  - channel (String):
 *  - handler (Function):
 *
 *  Removes `handler` of a channel, or removes ALL handlers of a channel if
 *  `handler` is not given.
 **/
Wire.prototype.off = function (channel, handler) {

  this.__handlers.forEach(function (wh) {
    if (channel !== wh.channel) {
      return; // continue
    }

    if (handler && (handler !== wh.func)) {
      return; // continue
    }

    // Uncount back zero-priority handler
    if (wh.priority === 0) {
      this.__knownChannels[channel]--;
    }

    wh.func = null;
  }, this);
};


/**
 *  Wire#skip(channel, skipList) -> Void
 *  - channel (String):
 *  - skipList (Array):
 *
 *  Exclude calling list of named handlers for given chennel:
 *
 *      wire.skip('server:static', [
 *        session_start,
 *        cookies_start
 *      ]);
 *
 **/
Wire.prototype.skip = function (channel, skipList) {

  if (channel.indexOf('*') !== -1 &&
      channel.indexOf('*') !== channel.length - 1) {
    throw new Error("Bad channel name '" + channel + "'. Wildard can be tailing only.");
  }

  if (isString(skipList)) {
    skipList = [ skipList ];
  }

  if (!Array.isArray(skipList)) {
    throw new Error('skipList must be String or Array of Strings');
  }

  this.__skips[channel] = this.__skips[channel] || {};

  skipList.forEach(function (name) {
    if (!this.__skips.hasOwnProperty(name)) {
      this.__skips[name] = [];
    }

    // Add channel name only if it not exists.
    if (this.__skips[name].indexOf(channel) === -1) {
      this.__skips[name].push(channel);
    }
  }, this);

  // TODO: Move to separate method
  this.__sortedCache = [];
};


/**
 *  Wire#has(channel) -> Boolean
 *  - channel (String):
 *
 *  Returns if `channel` has at least one subscriber
 *  with zero priority (main handler)
 **/
Wire.prototype.has = function (channel) {
  return Boolean(this.__knownChannels[channel]);
};


/**
 *  Wire#stat() -> Object
 *
 *  Returns Array of info about every channel. For debug purposes. For example,
 *  you can write dumper to check that all expected channels have required
 *  handlers. Or to track number of calls.
 **/
Wire.prototype.stat = function () {
  var result = [],
      known = [];

  // Scan all unique channels, ignore priorities
  this.__handlers.forEach(function (wh) {
    if (known.indexOf(wh.channel) === -1) {
      known.push(wh.channel);
    }
  });
  known = known.sort();

  // Extract info
  known.forEach(function (name) {
    result.push({ name : name, listeners: this.__getHandlers(name) });
  }, this);

  return result;
};

module.exports = Wire;
