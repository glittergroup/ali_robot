const fs = require('fs');
const moment = require('moment');
const alibaba = require('./alibaba');
const p4p = require('./p4p');
const visitor = require('./visitor');
const inquiry = require('./inquiry');
const markets = JSON.parse(fs.readFileSync('./storage/markets.json'));

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

// catalog will be send with only within given time regions
inquiry.add_catalog_sending_time_region(['00:00', '08:00'])
inquiry.add_catalog_sending_time_region(['19:00', '24:00'])

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
schedule(inquiry, 'Jessica', start_offset = 40, interval = 10 * 60000);
schedule(visitor, 'Robin', start_offset = 120, interval = 10 * 60000);
schedule(inquiry, 'Robin', start_offset = 160, interval = 10 * 60000);
schedule(visitor, 'Candy', start_offset = 240, interval = 10 * 60000);
schedule(inquiry, 'Candy', start_offset = 280, interval = 10 * 60000);
schedule(visitor, 'Carrie', start_offset = 360, interval = 10 * 60000);
schedule(inquiry, 'Carrie', start_offset = 400, interval = 10 * 60000);

schedule(p4p, 'Jessica', start_offset = 100, interval = 8 * 60 * 60000);
schedule(p4p, 'Carrie', start_offset = 460, interval = 8 * 60 * 60000);