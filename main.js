
const alibaba = require('./alibaba');
const p4p = require('./p4p');
const visitor = require('./visitor');
const fs = require('fs')
const moment = require('moment')
const markets = JSON.parse(fs.readFileSync('./storage/markets.json'))

for (let name in markets) {
    for (let account of markets[name].accounts) {
        account.name = account.fullName.split(' ')[0]
        for (let browserDataDir of account.browserDataDirs) {
            alibaba.addContext({
                browser: undefined,
                page: undefined,
                occupied: false,
                market: name,
                user: account,
                userDataDir: `.//storage//${browserDataDir}`
            })
        }
    }
}

function schedule(task, user_name, start_offset = 5, interval = 3600000) {

    let now = moment()
    let start_time = moment(now + start_offset * 1000)
    let end_time = moment(now + moment.duration(1410, 'minutes'))

    setTimeout(() => {

        let iv = setInterval(() => {
            (async () => {
                await alibaba.run(task, user_name);
            })();
        }, interval);

        setTimeout(() => {
            clearInterval(iv)
        }, Math.max(0, end_time - moment()));

        (async () => {
            await alibaba.run(task, user_name);
        })();

    }, Math.max(0, start_time - now));
}

//==================================================

// (async () => {
//     await alibaba.run(p4p, 'Carrie');
// })();

// (async () => {
//     await alibaba.run(p4p, 'Jessica');
// })();

// (async () => {

// })();



schedule(visitor, 'Jessica', start_offset = 0, interval = 10 * 60000);
schedule(visitor, 'Robin', start_offset = 180, interval = 10 * 60000);
schedule(visitor, 'Carrie', start_offset = 360, interval = 10 * 60000);

schedule(p4p, 'Jessica', start_offset = 240, interval = 8 * 60 * 60000);
schedule(p4p, 'Carrie', start_offset = 540, interval = 8 * 60 * 60000);