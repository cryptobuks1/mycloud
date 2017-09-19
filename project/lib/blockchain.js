const debug = require('debug')('tradle:sls:blockchain')
const { utils, protocol } = require('@tradle/engine')
const { co, promisify, typeforce } = require('./utils')
const { prettify } = require('./string-utils')
const adapters = require('./blockchain-adapter')
const ENV = require('./env')

function createWrapper (blockchainIdentifier) {
  typeforce({
    flavor: typeforce.String,
    networkName: typeforce.String,
    minBalance: typeforce.oneOf(typeforce.String, typeforce.Number)
  }, blockchainIdentifier)

  const { flavor, networkName } = blockchainIdentifier
  const defaultMinBalance = blockchainIdentifier.minBalance
  const createAdapter = adapters[flavor]
  if (!createAdapter) {
    throw new Error(`unsupported blockchain type: ${flavor}`)
  }

  const reader = createAdapter({ networkName })
  const Addresses = promisify(reader.blockchain.addresses)
  const getInfo = promisify(reader.blockchain.info)

  const { network } = reader
  const writerCache = {}

  const getWriter = function getWriter (key) {
    const { fingerprint, priv } = key
    if (!writerCache[fingerprint]) {
      const { transactor } = createAdapter({
        networkName,
        privateKey: priv
      })

      writerCache[fingerprint] = promisify(transactor)
    }

    return writerCache[fingerprint]
  }

  const wrapInStartStop = function wrapInStartStop (fn) {
    return co(function* (...args) {
      start()
      try {
        return yield fn(...args)
      } finally {
        stop()
      }
    })
  }

  const getBlockHeight = co(function* () {
    start()
    const { blockHeight } = yield getInfo()
    return blockHeight
  })

  const getTxsForAddresses = co(function* (addresses, blockHeight) {
    start()
    if (typeof blockHeight !== 'number') {
      blockHeight = yield getBlockHeight()
    }

    const txInfos = yield Addresses.transactions(addresses, blockHeight)
    txInfos.forEach(info => {
      if (!info.confirmations && typeof info.blockHeight === 'number') {
        info.confirmations = blockHeight - info.blockHeight
      }
    })

    debug(`fetched transactions for addresses: ${addresses.join(', ')}: ${prettify(txInfos)}`)
    return txInfos
  })

  // const sync = co(function* (addresses) {
  //   return getTxsForAddresses(addresses)
  // })

  const seal = co(function* ({ key, link, addresses }) {
    const writer = getWriter(key)
    start()
    debug(`sealing ${link}`)
    return yield writer.send({
      to: addresses.map(address => {
        return {
          address,
          amount: getTransactionAmount()
        }
      })
    })
  })

  const getTransactionAmount = () => network.minOutputAmount

  const sealPubKey = function sealPubKey ({ link, basePubKey }) {
    link = utils.linkToBuf(link)
    basePubKey = utils.toECKeyObj(basePubKey)
    return protocol.sealPubKey({ link, basePubKey })
  }

  const sealPrevPubKey = function sealPrevPubKey ({ link, basePubKey }) {
    link = utils.linkToBuf(link)
    basePubKey = utils.toECKeyObj(basePubKey)
    return protocol.sealPrevPubKey({ link, basePubKey })
  }

  const sealAddress = function sealAddress ({ link, basePubKey }) {
    const { pub } = sealPubKey({ link, basePubKey })
    return network.pubKeyToAddress(pub)
  }

  const sealPrevAddress = function sealPrevAddress ({ link, basePubKey }) {
    const { pub } = sealPrevPubKey({ link, basePubKey })
    return network.pubKeyToAddress(pub)
  }

  const startOrStop = co(function* startOrStop (method) {
    Object.keys(writerCache)
      .map(key => writerCache[key])
      .concat(reader)
      .forEach(client => {
        if (client[method]) {
          client[method]()
        }
      })
  })

  const start = startOrStop.bind(null, 'start')
  const stop = startOrStop.bind(null, 'stop')

  const getMyChainPub = () => require('./').provider.getMyChainKeyPub()
  const getMyChainAddress = () => getMyChainPub()
    .then(({ fingerprint }) => fingerprint)

  const recharge = co(function* (opts={}) {
    let { address, minBalance, force } = opts
    if (!address) {
      address = yield getMyChainAddress()
    }

    if (!minBalance) {
      minBalance = defaultMinBalance
    }

    const client = writerCache[address] || reader
    return client.recharge({ address, minBalance, force })
  })

  const getBalance = co(function* (opts={}) {
    let { address } = opts
    if (!address) {
      address = yield getMyChainAddress()
    }

    return Addresses.balance(address)
  })

  return {
    recharge,
    stop,
    start,
    balance: getBalance,
    pubKeyToAddress: network.pubKeyToAddress,
    flavor,
    networkName,
    // sync,
    seal,
    getTxsForAddresses,
    sealPubKey,
    sealPrevPubKey,
    sealAddress,
    sealPrevAddress,
    toString: () => `${network.blockchain}:${network.name}`,
    runOperation: wrapInStartStop,
    _adapter: reader
  }
}

exports = module.exports = createWrapper

// module.exports = createWrapper(ENV.BLOCKCHAIN)
