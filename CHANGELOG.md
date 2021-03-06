4.0.0 / WIP
------------------

- Drop generators support by default.
- Drop `next-tick` use in `.emit()` callback.
- Deps bump.


3.4.0 / 2017-03-29
------------------

- Added async/await support.


3.3.1 / 2016-12-29
------------------

- Simplify handler wrapping code.


3.3.0 / 2016-12-29
------------------

- Deps bump.
- Code refactoring.
- Don't use `bluebird-co` anymore.


3.2.2 / 2016-07-12
------------------

- Fixed possible race condition after `.off()` call.


3.2.1 / 2016-04-29
------------------

- Fixed node.js 6.+ support.


3.2.0 / 2016-04-21
------------------

- Added support for concurrent handler execution.


3.1.1 / 2016-03-24
------------------

- Fixed `bluebird-co` support & added tests.


3.1.0 / 2016-01-28
------------------

- Pass full handler info to hooks.
- Optimized `.once()` / `.off()` logic.


3.0.0 / 2016-01-27
------------------

- Rewrite internals from callbacks to promises. Now much
  more friendly to exceptions.
- Sync handlers now can return promise & throw.
- Dropped arrays support in `.emit()`.


2.0.3 / 2016-01-13
------------------

- Make sure `.emit()` always returns promise.
- Added `.hook()` method to inject monitoring functions.


2.0.2 / 2016-01-10
------------------

- `.emit()` without callback now returns `Promise`.


2.0.1 / 2016-01-09
------------------

- Fixed duplicated callback on throw.


2.0.0 / 2016-01-09
------------------

- Added generators support.
- Removed custom module wrapper.


1.0.1 / 2016-01-09
------------------

- Fixed .emit(channel, callback) signature.


1.0.0 / 2015-05-04
------------------

- First release (moved from nodeca to separate package).
