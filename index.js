/**
 *  class Wire
 **/
'use strict'


var nextTick = require('next-tick')


function _class (obj) { return Object.prototype.toString.call(obj) }

function isString (obj) { return _class(obj) === '[object String]' }
function isFunction (obj) { return _class(obj) === '[object Function]' }


//
// Simplified stable sort implementation from Lo-Dash (http://lodash.com/)
//

function compareAscending (a, b) {
  var ai = a.idx
  var bi = b.idx

  a = a.criteria
  b = b.criteria

  // ensure a stable sort in V8 and other engines
  // http://code.google.com/p/v8/issues/detail?id=90
  if (a !== b) {
    if (a > b || typeof a === 'undefined') {
      return 1
    }
    /* istanbul ignore next */
    if (a < b || typeof b === 'undefined') {
      return -1
    }
  }

  /* istanbul ignore next */
  return ai < bi ? -1 : 1
}

function stableSort (arr) {
  var idx
  var len = arr.length
  var result = new Array(len)

  for (idx = 0; idx < len; idx += 1) {
    result[idx] = {
      criteria: arr[idx].priority,
      idx:      idx,
      val:      arr[idx]
    }
  }

  result.sort(compareAscending)

  for (idx = 0; idx < len; idx += 1) {
    result[idx] = result[idx].val
  }

  return result
}


function isGeneratorFunction (obj) {
  var constructor = obj.constructor
  /* istanbul ignore if */
  if (!constructor) {
    return false
  }
  if (constructor.name === 'GeneratorFunction' ||
      constructor.displayName === 'GeneratorFunction') {
    return true
  }
  return false
}


function isAsyncFunction (obj) {
  var constructor = obj.constructor
  /* istanbul ignore if */
  if (!constructor) {
    return false
  }
  if (constructor.name === 'AsyncFunction' ||
      constructor.displayName === 'AsyncFunction') {
    return true
  }
  return false
}


function isPromise (obj) {
  return typeof obj.then === 'function'
}


// Structure to hold handler data
function HandlerInfo (channel, options, func) {
  if (channel.indexOf('*') !== -1 &&
      channel.indexOf('*') !== channel.length - 1) {
    throw new Error("Bad channel name '" + channel + "'. Broadcast symbol (*) must " +
                    'be the last character.')
  }

  this.channel   = channel
  this.func      = func
  this.name      = func.name || options.name || '<anonymous>'
  this.gen       = isGeneratorFunction(func)
  this.async     = isAsyncFunction(func)
  this.sync      = func.length === 0 || func.length === 1
  this.once      = Boolean(options.once)
  this.ensure    = Boolean(options.ensure)
  this.parallel  = Boolean(options.parallel)
  this.priority  = Number(options.priority || 0)
  this.ncalled   = 0

  // Use channel name of this handler only as a prefix to match or not.
  this.isBroadcast = (channel.charAt(channel.length - 1) === '*')

  // Used to match this handler.
  this.lookupString = this.isBroadcast ? channel.slice(0, -1) : channel

  // Wrapper cache for unified handler call
  this.func_wrapped = null
}


function Wire (options) {
  if (!(this instanceof Wire)) return new Wire(options)

  var opts = options || {}

  this.__co = opts.co
  this.__p = opts.p || Promise

  this.__hooks          = {}
  this.__handlers       = []
  this.__sortedCache    = []
  this.__knownChannels  = {}
  this.__skips          = {}
}


// Add hook.
//
Wire.prototype.hook = function (eventName, handler) {
  this.__hooks[eventName] = this.__hooks[eventName] || []
  this.__hooks[eventName].push(handler)
}


// Returns true if `handlerName` must be skipped on `channelName`.
//
Wire.prototype.__checkSkip = function (handlerName, channelName) {

  return !!(this.__skips[handlerName] || []).some(function (skip) {
    var wcard = skip.charAt(skip.length - 1) === '*'

    if (!wcard && skip === channelName) return true
    if (wcard && (channelName.indexOf(skip.slice(0, -1)) === 0)) return true

    return false
  })
}


Wire.prototype.__getHandlers = function (channel) {
  var self = this
  var result

  if (!this.__sortedCache[channel]) {
    result = []

    this.__handlers.forEach(function (handler) {

      // Respect skips.
      if (self.__checkSkip(handler.name, channel)) {
        return
      }

      // Non-broadcast handler - do exact match.
      if (!handler.isBroadcast && (channel !== handler.lookupString)) {
        return
      }

      // Broadcast handler - match as a prefix.
      if (handler.isBroadcast && (channel.indexOf(handler.lookupString)) !== 0) {
        return
      }

      result.push(handler)
    })

    // We must use stable sort here to be sure, that handlers in the resulting
    // list will be placed exactly in the order they are declared.
    this.__sortedCache[channel] = stableSort(result)
  }

  return this.__sortedCache[channel]
}


// Helper to run hooks
//
function _hook (slf, name, handlerInfo, params) {
  if (!slf.__hooks[name]) return

  slf.__hooks[name].forEach(function (hook) {
    hook(handlerInfo, params)
  })
}


// Wrap generator handler
function wrap_gen (fn, co) {
  return function (params) { return co(fn, params) }
}

function wrap_async (fn) {
  return fn // No wrapper needed
}


// Wrap sync function handler, it can:
// - return nothing
// - throw
// - return Promise.
function wrap_sync (fn) {
  return function (params) {
    var val = fn(params)
    if (val && !isPromise(val)) throw val
    return val
  }
}

// Wrap handler with callback
function wrap_cb (fn, P) {
  return function (params) {
    return new P(function (resolve, reject) {
      fn(params, function (err) { return !err ? resolve() : reject(err) })
    })
  }
}


function runHandler (slf, hInfo, params, hasError) {
  // Check if handler removed (null)
  if (!hInfo.func) return

  // Lazy wrapper init
  if (!hInfo.func_wrapped) {
    if (hInfo.gen) {
      hInfo.func_wrapped = wrap_gen(hInfo.func, slf.__co)
    } else if (hInfo.async) {
      hInfo.func_wrapped = wrap_async(hInfo.func)
    } else if (hInfo.sync) {
      hInfo.func_wrapped = wrap_sync(hInfo.func)
    } else {
      hInfo.func_wrapped = wrap_cb(hInfo.func, slf.__p)
    }
  }

  if (hInfo.once) { slf.off(hInfo.channel, hInfo.func) }

  return slf.__p.resolve().then(function () {
    if (hasError && !hInfo.ensure) return null
    hInfo.ncalled++
    _hook(slf, 'eachBefore', hInfo, params)

    var func_wrapped = hInfo.func_wrapped

    // ref cleanup
    if (!hInfo.func) hInfo.func_wrapped = null

    return func_wrapped(params)
  })
}


// Run all listeners for specific channel
//
Wire.prototype.__emit = function (ch, params) {
  var p = this.__p.resolve()
  var self = this
  var errored = false
  var err

  function storeErrOnce (e) {
    if (errored) return
    errored = true
    err = e
  }

  // Finalize handler exec - should care about errors and post-hooks.
  function finalizeHandler (p, hInfo) {
    if (!p) return

    return p
      .catch(storeErrOnce)
      .then(function () {
        if (errored && !hInfo.ensure) return null
        _hook(self, 'eachAfter', hInfo, params)
      })
      .catch(storeErrOnce)
  }


  var handlers = this.__getHandlers(ch).slice()
  var lastIdx = 0

  handlers.forEach(function (hInfo, i) {
    if (i < lastIdx) return
    if (!hInfo.func) return

    if (!hInfo.parallel) {
      p = p.then(function () {
        return finalizeHandler(runHandler(self, hInfo, params, errored), hInfo)
      })

      return
    }

    var arr = [hInfo]
    var j

    for (j = i + 1; j < handlers.length; j++) {
      var h = handlers[j]

      if (!h.func || !h.parallel || h.priority !== hInfo.priority) break

      arr.push(h)
    }

    // skip all forEach iterations up until the next handler
    lastIdx = j

    p = p.then(function () {
      return self.__p.all(arr.map(function (hInfo) {
        return finalizeHandler(runHandler(self, hInfo, params, errored), hInfo)
      }))
    })
  })

  // We combined full chain of calls, now restore
  // the first error if happened, and return as promise.
  return p.then(function () {
    if (errored) { throw err }
  })
}


Wire.prototype.__emit_with_check = function (channel, params) {
  if (!isString(channel)) {
    return this.__p.reject(new Error('Channel name should be a string: ' + channel))
  }

  if (channel.indexOf('*') >= 0) {
    return this.__p.reject(new Error("Bad channel name '" + channel + "'. Wildard `*` not allowed in emitter"))
  }

  return this.__emit(channel, params)
}


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
    callback = params
    params = null
  }

  // No callback - return promise
  if (!callback) return this.__emit_with_check(channel, params)

  // Callback magic
  this.__emit_with_check(channel, params)
    .then(function () { nextTick(callback.bind(null)) })
    .catch(function (err) { nextTick(callback.bind(null, err)) })
}


/**
 *  Wire#on(channels[, options], handler) -> Void
 *  - channels (String | Array):
 *  - options (Object):
 *  - handler (Function):
 *
 *  Registers `handler` to be executed upon messages in the a single channel
 *  or a sequence of channels stored in `channels` parameter. Handler can be
 *  generator, sync or async function:
 *
 *      wire.on('foobar', function* () {
 *        // do stuff here
 *      })
 *
 *      wire.on('foobar', function* (params) {
 *        // do stuff here
 *      })
 *
 *      wire.on('foobar', function () {
 *        // do stuff here
 *      })
 *
 *      wire.on('foobar', function (params) {
 *        // do stuff here
 *      })
 *
 *      wire.on('foobar', function (params, callback) {
 *        // do stuff here
 *        callback(null)
 *      })
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
    throw new Error('Channel name required. Use `*` if you want "any channel".')
  }

  if (!Array.isArray(channels)) {
    channels = [channels]
  }

  if (!handler) {
    handler = options
    options = null
  }

  options = options || {}

  if (!isFunction(handler) &&
      !isGeneratorFunction(handler) &&
      !isAsyncFunction(handler)) {
    throw new Error('Listener should be the function, generator function or async function')
  }

  if (handler.length !== 0 && handler.length !== 1 && handler.length !== 2) {
    throw new Error('Function must accept exactly 0 (sync), 1 (sync), or 2 (async) arguments')
  }

  channels.forEach(function (channelName) {
    var hInfo = new HandlerInfo(channelName, options, handler)

    // Count main channel handler (no wildcards, zero-priority)
    if (hInfo.priority === 0) {
      this.__knownChannels[channelName] = (this.__knownChannels[channelName] || 0) + 1
    }

    this.__handlers.push(hInfo)
  }, this)

  // TODO: Move to separate method
  this.__sortedCache = []
}


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
    handler = options
    options = {}
  }

  options = options || {}
  options.once = true

  this.on(channel, options, handler)
}


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
    handler = options
    options = {}
  }

  options = options || {}
  options.priority = options.priority || -10

  if (options.priority >= 0) {
    throw new Error('.before() requires priority lower than 0')
  }

  return this.on(channel, options, handler)
}


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
    handler = options
    options = {}
  }

  options = options || {}
  options.priority = options.priority || 10

  if (options.priority <= 0) {
    throw new Error('.after() requires priority greater than 0')
  }

  return this.on(channel, options, handler)
}


/**
 *  Wire#off(channel[, handler]) -> Void
 *  - channel (String):
 *  - handler (Function):
 *
 *  Removes `handler` of a channel, or removes ALL handlers of a channel if
 *  `handler` is not given.
 **/
Wire.prototype.off = function (channel, handler) {

  this.__handlers.forEach(function (hInfo) {
    if (channel !== hInfo.channel) return // continue
    if (handler && (handler !== hInfo.func)) return // continue

    // Uncount back zero-priority handler
    if (hInfo.priority === 0) this.__knownChannels[channel]--

    hInfo.func = null
  }, this)
}


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
 *      ])
 *
 **/
Wire.prototype.skip = function (channel, skipList) {

  if (channel.indexOf('*') !== -1 &&
      channel.indexOf('*') !== channel.length - 1) {
    throw new Error("Bad channel name '" + channel + "'. Wildard can be tailing only.")
  }

  if (isString(skipList)) {
    skipList = [skipList]
  }

  if (!Array.isArray(skipList)) {
    throw new Error('skipList must be String or Array of Strings')
  }

  this.__skips[channel] = this.__skips[channel] || {}

  skipList.forEach(function (name) {
    /* eslint-disable no-prototype-builtins */
    if (!this.__skips.hasOwnProperty(name)) {
      this.__skips[name] = []
    }

    // Add channel name only if it not exists.
    if (this.__skips[name].indexOf(channel) === -1) {
      this.__skips[name].push(channel)
    }
  }, this)

  // TODO: Move to separate method
  this.__sortedCache = []
}


/**
 *  Wire#has(channel) -> Boolean
 *  - channel (String):
 *
 *  Returns if `channel` has at least one subscriber
 *  with zero priority (main handler)
 **/
Wire.prototype.has = function (channel) {
  return Boolean(this.__knownChannels[channel])
}


/**
 *  Wire#stat() -> Object
 *
 *  Returns Array of info about every channel. For debug purposes. For example,
 *  you can write dumper to check that all expected channels have required
 *  handlers. Or to track number of calls.
 **/
Wire.prototype.stat = function () {
  var result = []
  var known = []

  // Scan all unique channels, ignore priorities
  this.__handlers.forEach(function (hInfo) {
    if (known.indexOf(hInfo.channel) === -1) {
      known.push(hInfo.channel)
    }
  })
  known = known.sort()

  // Extract info
  known.forEach(function (name) {
    result.push({ name : name, listeners: this.__getHandlers(name) })
  }, this)

  return result
}

module.exports = Wire
