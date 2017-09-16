var tb = require('timebucket')
   , minimist = require('minimist')
   , n = require('numbro')
   , fs = require('fs')
   , path = require('path')
   , moment = require('moment')
   , colors = require('colors')

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

            exchanges.forEach(function (x) {
              get('exchanges.' + x).listenOrderbook({
                selectors: sharedProducts.filter(p => p.exchange == x).map(p => {
                  return p.exchange + '.' + p.asset + '-' + p.currency;
                })
              }, (selector, bid, ask) => {
                console.log(selector);
                console.log(bid);
                console.log(ask);
              })
            })
         })
   }
}
