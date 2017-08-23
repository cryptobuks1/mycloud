// // const Cache = require('lru-cache')
// const { EventEmitter } = require('events')
// const { co, pick, omit, extend } = require('../utils')
// const { getUpdateParams } = require('../db-utils')
// const Errors = require('../errors')
// const PRIMARY_KEY = 'id'

// module.exports = function createUsers ({ table, oncreate }) {
//   const ee = new EventEmitter()

//   // const cache = new Cache({ max: 200 })
//   const save = user => table.update(user).then(() => user)
//   const merge = save
//   const del = primaryKey => table.del({ [PRIMARY_KEY]: primaryKey })
//   const list = table.search
//   const createIfNotExists = co(function* (user) {
//     try {
//       return yield table.get({
//         Key: getKey(user)
//       })
//     } catch (err) {
//       if (err instanceof Errors.NotFound) {
//         yield save(user)
//         yield oncreate(user)
//         return user
//       }

//       throw err
//     }
//   })

//   const get = primaryKey => table.get({
//     Key: { [PRIMARY_KEY]: primaryKey }
//   })

//   return extend(ee, {
//     get,
//     createIfNotExists,
//     save,
//     del,
//     merge,
//     list
//   })
// }

// function getKey (user) {
//   return pick(user, PRIMARY_KEY)
// }

// function getProps (user) {
//   return omit(user, PRIMARY_KEY)
// }
