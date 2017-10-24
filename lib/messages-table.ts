import clone = require('clone')
import { createTable, utils } from '@tradle/dynamodb'
const definitions = require('./definitions')

export function createMessagesTable ({ models, tables }: {
  models,
  tables
}) {
  const model = models['tradle.Message']
  const inbox = createTable(definitions.InboxTable.TableName, {
    models,
    model,
    exclusive: true,
    forbidScan: true,
    readOnly: true,
    tableDefinition: utils.toDynogelTableDefinition(definitions.InboxTable)
  })

  const outbox = createTable(definitions.OutboxTable.TableName, {
    models,
    model,
    exclusive: true,
    forbidScan: true,
    readOnly: true,
    tableDefinition: utils.toDynogelTableDefinition(definitions.OutboxTable)
  })

  const getBoxFromFilter = query => {
    const { filter={} } = query
    const { EQ={} } = filter
    if (typeof EQ._inbound !== 'boolean') {
      throw new Error('expected "_inbound" property in "EQ"')
    }

    return EQ._inbound ? inbox : outbox
  }

  const sanitizeQuery = (query) => {
    query = clone(query)
    delete query.filter.EQ._inbound
    return query
  }

  const execQuery = async (method:string, query:any) => {
    const box = getBoxFromFilter(query)
    return box[method](sanitizeQuery(query))
  }

  const find = query => execQuery('find', query)
  const findOne = query => execQuery('findOne', query)
  const get =  async ({ _inbound, ...query }) => {
    const box = _inbound ? inbox : outbox
    return box.get(query)
  }

  const table = {
    exclusive: true,
    get,
    search: find,
    find,
    findOne
  }

  ;['put', 'del', 'update', 'batchPut', 'latest'].forEach(method => {
    table[method] = async () => {
      throw new Error(`"${method}" is not supported on tradle.Message table`)
    }
  })

  return table
}
