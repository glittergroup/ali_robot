const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const moment = require('moment')


puppeteer.use(StealthPlugin());

let queue = {}
let contexts = {}

async function addContext(ctx) {
    if (!(ctx.user.name in contexts)) {
        contexts[ctx.user.name] = []
    }
    contexts[ctx.user.name].push(ctx)
}

async function getContexts(userName = undefined) {
    if (!userName) {
        return contexts
    }
    if (userName in contexts) {
        return contexts[userName]
    } else {
        return null
    }
}

async function openBrowser(ctx) {
    ctx.browser = await puppeteer.launch({
        headless: false,
        // slowMo: 250,
        userDataDir: ctx.userDataDir,
        args: [`--window-size=1500,1024`]
    });
    ctx.page = (await ctx.browser.pages())[0]
}

async function login(ctx) {
    await ctx.page.waitForSelector('input#fm-login-id', { visible: true });
    await ctx.page.evaluate((account) => {
        document.querySelector('input#fm-login-id').value = account.id;
        document.querySelector('input#fm-login-password').value = account.pwd;
    }, ctx.user);

    await ctx.page.waitForTimeout(700);
    await ctx.page.click('#fm-login-submit');
}

async function run(task, userName) {
    let ctx = undefined
    for (let context of contexts[userName]) {
        if (context.occupied) {
            continue
        }
        ctx = context
        ctx.occupied = task
        break
    }

    if (!ctx) {
        console.log(`${moment().format('YYYY-MM-DD HH:mm:ss')} [ALIBABA]: No idle browsers, throw the task(${task.name}, ${userName}) in queue for later running!`)
        if (!(userName in queue)) {
            queue[userName] = []
        }
        queue[userName].push(task)
        return
    }

    try {
        console.log(`${moment().format('YYYY-MM-DD HH:mm:ss')} [ALIBABA]: run task(${task.name}, ${userName})`)
        if (!ctx.browser) {
            await openBrowser(ctx);
        }

        await ctx.page.goto(task.url, { waitUntil: 'networkidle2' });

        if (ctx.page.url().includes('passport.alibaba.com/icbu_login.htm')) {
            await login(ctx)
        }

        await task.run(ctx)

    } catch (err) {
        console.log(`${moment().format('YYYY - MM - DD HH: mm: ss')} [ALIBABA]: task failed:`, task.name, userName);
        console.error(err);

    } finally {
        ctx.occupied = undefined;

        if (userName in queue && queue[userName].length > 0) {
            task = queue[userName].shift();
            console.log(`${moment().format('YYYY-MM-DD HH:mm:ss')} [ALIBABA]: found waitting task(${task.name}, ${userName}), run it soon!`)
            await ctx.page.waitForTimeout(5000)
            await run(task, userName);
        }
    }
}


exports.addContext = addContext;
exports.getContexts = getContexts;
exports.openBrowser = openBrowser;
exports.login = login;
exports.run = run;

// ============================================================
return

const p4p = require('./p4p')

// (async () => {
//     await run(p4p, 'Jessica');
// })();


// (async () => {
// })();

// setInterval(() => {
//     console.log('[ALIBABA]: ----------------------');
//     (async () => {
//         await run(p4p, 'Jessica');
//     })();
// }, 60 * 60000);