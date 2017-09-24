var Bitstamp = require('bitstamp')
  , path = require('path') , Pusher = require('pusher-js/node')
  , colors = require('colors')
  , n = require('numbro')

var args = process.argv


args.forEach(function(value) {
  if (value.toLowerCase().match(/bitstamp/)) {
    selectorToPair(value);
  }
})

function selectorToPair(selector) {
  const  p = selector.split('.')[1];
  const prod = p.split('-')[0] + p.split('-')[1];
  const pair = prod.toLowerCase();
  return pair;
}

function joinProduct (product_id) {
  return product_id.split('-')[0] + product_id.split('-')[1]
}


module.exports = function container (get, set, clear) {
  var c = get('conf')

  function authedClient () {
    if (c.bitstamp.key && c.bitstamp.key !== 'YOUR-API-KEY') {
      return new Bitstamp(c.bitstamp.key, c.bitstamp.secret, c.bitstamp.client_id)
    }
    throw new Error('\nPlease configure your Bitstamp credentials in ' + path.resolve(__dirname, 'conf.js'))
  }

  //-----------------------------------------------------
  //  The websocket functions
  //
  const BITSTAMP_PUSHER_KEY = 'de504dc5763aeef9ff52'

  var Bitstamp_WS = function(opts) {
    this.opts = {
      encrypted: true,
      currencyPair: 'btcusd',
      trades: {evType: 'trade', channel: 'live_trades'},
      quotes: {evType: 'data', channel: 'order_book'}
    }
    Object.assign(this.opts, opts);

    this.client = new Pusher(BITSTAMP_PUSHER_KEY, {
      encrypted: this.opts.encrypted
    })

    // bitstamp publishes all data over just 2 channels
    // make sure we only subscribe to each channel once
    this.bound = {
      trade: false,
      data: false
    }

    this.subscribe = function() {
      this.client.subscribe(this.opts.trades.channel)
      this.client.bind(this.opts.trades.evType, this.broadcast(this.opts.trades.evType))
      this.client.subscribe(this.opts.quotes.channel)
      this.client.bind(this.opts.quotes.evType, this.broadcast(this.opts.quotes.evType))
    }

    this.broadcast = function(name) {
      if(this.bound[name])
        return function noop() {}
      this.bound[name] = true
      return function(e) {
        this.emit(name, e)
      }.bind(this)
    }

    this.subscribe()

  }

  Bitstamp.prototype.tradeDaily = function(direction, market, amount, price, callback) {
    this._post(market, direction, callback, {
      amount: amount,
      price: price,
      daily_order: true
    });
  }

  Bitstamp.prototype.tradeMarket = function(direction, market, amount, callback) {
    this._post(market, direction + '/market', callback, {
      amount: amount,
    });
  }

  var util = require('util')
  var EventEmitter = require('events').EventEmitter
  util.inherits(Bitstamp_WS, EventEmitter)


  // Placeholders
  var wsquotes = {bid: 0, ask: 0}
  var wstrades =
  [
    {
      trade_id: 0,
      time:1000,
      size: 0,
      price: 0,
      side: ''
    }
  ]

  var wsTrades = new Bitstamp_WS({trades: {
    channel: 'live_trades',
    evType: 'trade'
  }})

  var wsQuotes = new Bitstamp_WS({quotes: {
    channel: 'order_book',
    evType: 'data'
  }})

  wsQuotes.on('data', function(data) {
    wsquotes = {
      bid: data.bids[0][0],
      ask: data.asks[0][0]
    }
  })

  wsTrades.on('trade', function(data) {
    wstrades.push( {
      trade_id: data.id,
      time: Number(data.timestamp) * 1000,
      size: data.amount,
      price: data.price,
      side: data.type === 0 ? 'buy' : 'sell'
    })
    if (wstrades.length > 30) wstrades.splice(0,10)
  })
  //-----------------------------------------------------
  
  function statusErr (err, body) {
    if (typeof body === 'undefined') {
      var ret = {}
      var res = err.toString().split(':',2)
      ret.status = res[1]
      return new Error(ret.status)
    } else {
      if (body.error) {
        return new Error('\nError: ' + body.error)
      } else {
        return body
      }
    }
  }

  function retry (method, args) {
    var to = args.wait
    if (method !== 'getTrades') {
      console.error(('\nBitstamp API is not answering! unable to call ' + method + ', retrying in ' + to + 's').red)
    }
    setTimeout(function () {
      exchange[method].apply(exchange, args)
    }, to * 1000)
  }

  var lastBalance = {asset: 0, currency: 0}
  var orders = {}

  var exchange = {
    name: 'bitstamp',
    historyScan: false,
    makerFee: 0.25,
    takerFee: 0.25,

    getProducts: function () {
      return require('./products.json')
    },

    //-----------------------------------------------------
    // Public API functions
    // getQuote() and getTrades() are using Bitstamp websockets
    // The data is not done by calling the interface function,
    // but rather pulled from the "wstrades" and "wsquotes" JSOM objects
    // Those objects are populated by the websockets event handlers

    getTrades: function (opts, cb) {
      var args = {
        wait: 2   // Seconds
      }
      if (typeof wstrades.time == undefined) return retry('getTrades', args)
      cb(null, wstrades)
    },

    getQuote: function (opts, cb) {
      var args = {
        wait: 2   // Seconds
      }
      if (typeof wsquotes.bid == undefined) return retry('getQuote', args )
      cb(null, wsquotes)
    },

    //-----------------------------------------------------
    // Private (authenticated) functions
    //

    getBalance: function (opts, cb) {
      var args = {
              currency: opts.currency.toLowerCase(),
              asset: opts.asset.toLowerCase(),
              wait: 10
        }
      var client = authedClient()
      client.balance(null, function (err, body) {
        body = statusErr(err,body)
        if (body.status === 'error') {
          return retry('getBalance', args)
        }
        var balance = {asset: 0, currency: 0}
        // Dirty hack to avoid engine.js bailing out when balance has 0 value
        // The added amount is small enough to not have any significant effect
        balance.currency = n(body[opts.currency.toLowerCase() + '_available']) + 0.000001
        balance.asset = n(body[opts.asset.toLowerCase() + '_available']) + 0.000001
        balance.currency_hold = 0
        balance.asset_hold = 0
        if (typeof balance.asset == undefined || typeof balance.currency == undefined ) {
          console.log('Communication delay, fallback to previous balance')
          balance = lastBalance
        } else {
          lastBalance = balance
        }
        cb(null, balance)
      })
    },

    cancelOrder: function (opts, cb) {
      var func_args = [].slice.call(arguments)
      var client = authedClient()
      client.cancel_order(opts.order_id, function (err, body) {
        body = statusErr(err,body)
        if (body.status === 'error') {
          return retry('cancelOrder', func_args, err)
        }
        cb()
      })
    },

    trade: function (type,opts, cb) {
      var client = authedClient()
      var currencyPair = joinProduct(opts.product_id).toLowerCase()
      if (typeof opts.order_type === 'undefined' ) {
        opts.order_type = 'maker'
      }
      // Bitstamp has no "post only" trade type
      opts.post_only = false
      if (opts.order_type === 'maker') {
        client.tradeDaily(type, currencyPair, opts.size, opts.price, function (err, body) {
          body = statusErr(err,body)
          if (body.status === 'error') {
            var order = { status: 'rejected', reject_reason: 'balance' }
            return cb(null, order)
          } else { 
            // Statuses:
            // 'In Queue', 'Open', 'Finished'
            body.status = 'done'
          }
          orders['~' + body.id] = body
          cb(null, body)
        })
      } else { // order_type === taker
        client.tradeMarket(type, currencyPair, opts.size, function (err, body) {
          body = statusErr(err,body)
          if (body.status === 'error') {
            var order = { status: 'rejected', reject_reason: 'balance' }
            return cb(null, order)
          } else {
            body.status = 'done'
          }
          orders['~' + body.id] = body
          cb(null, body)
        })
      }
    },

    buy: function (opts, cb) {
      exchange.trade('buy', opts, cb)
    },

    sell: function (opts, cb) {
      exchange.trade('sell', opts, cb)
    },

    getOrder: function (opts, cb) {
      var func_args = [].slice.call(arguments)
      var client = authedClient()
      client.order_status(opts.order_id, function (err, body) {
        body = statusErr(err,body)
        if (body.status === 'error') {
          body = orders['~' + opts.order_id]
          body.status = 'done'
          body.done_reason = 'canceled'
        }
        cb(null, body)
      })
    },

    listenOrderbook: function(opts, cb) {
      console.log('Listening for ' + opts.selectors);
      const wss = opts.selectors.map(s => {
          ws = new Bitstamp_WS({quotes: {
            channel: 'order_book_' + selectorToPair(s),
            evType: 'data'
          }});
          ws.selector = s;
          return ws;
      });

      wss.forEach(w => {
        w.on('data', data => {
          cb(w.selector, data.bids[0][0], data.asks[0][0]);
        })
      });
    },

    listenTicker: function(opts, cb) {
      console.log('Listening for ' + opts.selectors);
        const wss = opts.selectors.map(s => {
          ws = new Bitstamp_WS({trades: {
            channel: 'live_trades_' + selectorToPair(s),
            evType: 'trade'
          }});
          ws.selector = s;
          return ws;
      });

      wss.forEach(w => {
        w.on('trade', data => {
          cb(w.selector, data.price, data.price);
        })
      });
    },

    // return the property used for range querying.
    getCursor: function (trade) {
      return trade.trade_id
    }
  }
  return exchange
}
