var tb = require('timebucket')
   , minimist = require('minimist')
   , n = require('numbro')
   , fs = require('fs')
   , path = require('path')
   , moment = require('moment')
   , colors = require('colors')
   , _ = require('lodash')

module.exports = function container (get, set, clear) {
   var c = get('conf')
   return function (program) {
      program
         .command('arbitrage')
         .allowUnknownOption()
         .description('arbitrage')
         .action(function (cmd) {
           // Build a map of exchange to list of products
            const allProducts = {};
            get('exchanges.list').forEach(function (x) {
               if (x.listenOrderbook !== undefined) {
                  allProducts[x.name] = x.getProducts().map(p => {
                    const n = p;
                    n.exchange = x.name;
                    return n;
                  })
               }
            })

            function intersection(a, b) {
              function inner(c, d) {
                return c.filter(e => {
                  return d.find(i => {
                    return (
                      (e.currency == i.currency && e.asset == i.asset) ||
                      (e.asset == i.currency && e.currency == i.asset)
                    )
                  })
                })
              }

              return inner(a, b).concat(inner(b, a));
            }

            const sharedProducts = Object.values(allProducts).reduce(intersection);
            const exchanges = Array.from(new Set(sharedProducts.map(p => p.exchange)));

            let prices = [];
            let spreads = {};
            exchanges.forEach(function (x) {
              get('exchanges.' + x).listenOrderbook({
                selectors: sharedProducts.filter(p => p.exchange == x).map(p => {
                  return p.exchange + '.' + p.asset + '-' + p.currency;
                })
              }, (selector, bid, ask) => {
                const arr = selector.split('.');
                const exchange = arr[0];
                const pair = arr[1].split('-');
                const id = pair[0] > pair[1] ? pair[0] + pair[1] : pair[1] + pair[0];

                prices = prices.filter(p => {
                  return (new Date()).getTime() - p.time < 60 * 1000
                    && p.selector != selector;
                });

                prices.push({
                  id: id,
                  selector: selector,
                  exchange: exchange,
                  pair: arr[1],
                  bid: bid,
                  ask: ask,
                  time: (new Date()).getTime()
                });

                calcSpreads();
              })
            })

            function calcSpreads() {
              console.log('\n---Calculating spreads on ' + prices.map(e => e.selector) + ' ---');
              const grouped = _.groupBy(prices, 'id');

              Object.keys(grouped).forEach(p => {
                function inner(x, xs, acc) {
                  if (!xs.length) return acc;

                  return inner(xs[0],
                               xs.slice(1),
                               acc.concat(_.flatten(xs.map(e => {
                                   return [
                                     {
                                       buy_price: x,
                                       sell_price: e,
                                       spread: (e.ask - x.bid) / x.bid,
                                       id: e.id
                                     },
                                     {
                                       buy_price: e,
                                       sell_price: x,
                                       spread: (x.ask - e.bid) / e.bid,
                                       id: e.id
                                     },
                                   ];
                                 }))
                               )
                              );
                }

                if (grouped[p].length >= 2) {
                  grouped[p] = inner(grouped[p][0], grouped[p].slice(1), []);
                } else {
                  delete grouped[p];
                }
              });

              const sorted = _.sortBy(_.flatten(Object.values(grouped)), e => -e.spread);
              const logs = sorted.filter(e => e.spread >= 0.001).map(e => {
                return `${e.spread} on buy ${e.buy_price.selector} (${e.buy_price.bid}) and sell ${e.sell_price.selector} (${e.sell_price.ask})`;
              });
              console.log(logs.join('\n'));
            }

         })
   }
}
