
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

function schedule(task, user_name, start = "00:00:00", end = "23:59:59", interval = 3600000) {

    let date = moment().format().split('T')[0]
    let start_time = moment(`${date}T${start}+08:00`)
    let end_time = moment(`${date}T${end}+08:00`)
    let now = moment()

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

(async () => {
    await alibaba.run(p4p, 'Carrie');
})();

(async () => {
    await alibaba.run(p4p, 'Jessica');
})();

(async () => {

})();



schedule(visitor, 'Jessica', start = "09:55:00", end = "12:06:00", interval = 2 * 60000);
schedule(visitor, 'Robin', start = "09:57:30", end = "12:03:00", interval = 2 * 60000);

schedule(visitor, 'Carrie', start = "09:20:30", end = "23:59:59", interval = 2 * 60000);