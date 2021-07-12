
const alibaba = require('./alibaba');
const p4p = require('./p4p');
const fs = require('fs')

const markets = JSON.parse(fs.readFileSync('./storage/markets.json'))
for (let name in markets) {
    for (let [idx, account] of markets[name].accounts.entries()) {
        account.name = account.fullName.split(' ')[0]
        alibaba.addContext({
            browser: undefined,
            page: undefined,
            occupied: false,
            market: name,
            user: account,
            userDataDir: `.//storage//${account.browserDataDir}//${idx}`
        })
    }
}

//==================================================

(async () => {
    await alibaba.run(p4p, 'Carrie');
})();

(async () => {
    await alibaba.run(p4p, 'Jessica');
})();

(async () => {

})();

setInterval(() => {
    console.log('[MAIN]: ----------------------');
    (async () => {
        await run(p4p, 'Jessica');
    })();

}, 60 * 60000);

