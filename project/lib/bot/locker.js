const debug = require('debug')('tradle:sls:bot:locker')
const locker = require('promise-locker')

module.exports = function createLocker (opts={}) {
  const { name='' } = opts
  const lock = locker(opts)
  const unlocks = {}
  const lDebug = (...args) => {
    if (name) args.unshift(name)

    return debug(...args)
  }

  return {
    lock: id => {
      debug(name, `locking ${id}`)
      return lock(id).then(unlock => unlocks[id] = unlock)
    },
    unlock: id => {
      if (unlocks[id]) {
        debug(name, `unlocking ${id}`)
        unlocks[id]()
        return true
      }
    }
  }
}
