const fs = require('fs');
const moment = require('moment');
const mailer = require('nodemailer');
const alibaba = require('./alibaba');
const markets = JSON.parse(fs.readFileSync('./storage/markets.json'))

let target_url = 'https://message.alibaba.com/message/default.htm';

const products = {};
const templates = {};
const catalog_sending_time_region = []
const sent_emails = []


function add_catalog_sending_time_region(time_region) {
    catalog_sending_time_region.push(time_region)
}

function load_products(ctx) {
    if (!(ctx.market in products)) {
        products[ctx.market] = JSON.parse(fs.readFileSync(`./storage/${ctx.market}/products.json`))
    }
}

function load_templates(ctx) {
    if (!(ctx.market in templates)) {
        templates[ctx.market] = {
            inquiry: fs.readFileSync(`./storage/${ctx.market}/inquiry.templ`, 'utf8'),
            email: fs.readFileSync(`./storage/${ctx.market}/email.templ`, 'utf8')
        }
    }
}

async function find_related_product_categories(ctx, page) {
    let group = undefined;

    // try to find out the inquired products
    let result = await page.evaluate(() => {
        let result = []
        for (let card of document.querySelectorAll('.item-content-left .inquiry-card-item')) {
            let query = JSON.parse(card.getAttribute('data-query'))
            console.log(query)
            if (!query.productList) {
                continue
            }
            for (let product of query.productList) {
                result.push(product.id + '')
            }
        }
        for (let div of document.querySelectorAll('.item-content-left .session-rich-content>div:first-child[data-expinfo]')) {
            info = JSON.parse(div.getAttribute('data-expinfo'))
            if (info.name == "product_card") {
                let _substr = info.cardUrl.match(/id%3D(\d+)%26/)
                if (_substr && _substr.length == 2) {
                    if (result.indexOf(_substr[1]) === -1) {
                        result.push(_substr[1])
                    }
                }
            }
        }
        console.log(result)
        return result
    })

    if (result.length > 0) {
        group = products[ctx.market][result[0]].group[0].toLowerCase()
        group = markets[ctx.market].product_groups[group]

    } else {
        let inquiry_messages = await page.evaluate(() => {
            let messages = []
            for (let div of document.querySelectorAll('.item-content-left .description-container')) {
                messages.push(div.textContent.trim())
            }
            return messages
        })

        console.log(inquiry_messages)

        let results = []
        for (let gname in markets[ctx.market].product_groups) {
            let g = markets[ctx.market].product_groups[gname]

            if (gname === 'default' || g.regexps.length === 0) {
                continue
            }

            let regexp = new RegExp(g.regexps.join('|'));

            for (let msg of inquiry_messages) {
                if (regexp.test(msg)) {
                    results.push(g)
                }
            }
        }
        console.log(results)
        if (results.length === 1) {
            group = results[0]
        }
    }


    if (!group) {
        group = markets[ctx.market].product_groups.default
    }

    return group
}

async function find_buyer(page) {
    return await page.evaluate(() => {
        let buyer = {
            name: document.querySelector('a.name-text').textContent.trim(),
            email: undefined
        }
        for (let div of document.querySelectorAll('.base-information-form-item')) {
            let label = div.querySelector('.base-information-form-item-label').textContent.trim();
            let content = div.querySelector('.base-information-form-item-content').textContent.trim();
            if (label == '邮箱' && content) {
                buyer.email = content;
                break
            }
        }

        return buyer
    })
}

async function fill_message(ctx, page, buyer, product_group) {
    let param = {}
    param.buyer = buyer.name.split(' ')[0]
    param.user_name = ctx.user.name
    param.user_full_name = ctx.user.fullName
    param.product_group = product_group.fullName
    param.product_lineup = `  ${product_group.lineup.map(x => `<li>${x}</li>`).join('\r\n  ')}`
    param.whatsapp = ctx.user.mobile
    param.email = ctx.user.id
    // console.log(param)

    let reply_message = eval('`' + templates[ctx.market].inquiry + '`')
    // console.log(reply_message)

    await page.click('div.mock-reply div.holder')
    await page.waitForSelector('iframe#normal-im-send_ifr')

    let elementHandle = await page.$('iframe#normal-im-send_ifr');
    let iframe = await elementHandle.contentFrame();
    await iframe.evaluate((message) => {
        document.querySelector('body').innerHTML = message
    }, reply_message)

    await page.waitForTimeout(600)
    let rect = await page.evaluate(() => {
        let rect = document.querySelector('iframe#normal-im-send_ifr').getBoundingClientRect()
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        }
    })
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await page.waitForTimeout(1000)
}

async function attach_catalog(ctx, page, product_group) {

    let catalog_file = `./storage/${ctx.market}/catalogs/${product_group.catalogs[0]}`

    console.log(catalog_file)

    const elementHandle = await page.$('.next-upload input[type="file"]');
    await elementHandle.uploadFile(catalog_file);
    await page.waitForTimeout(1000)
    await page.waitForFunction(() => {
        return !document.querySelector('.im-next-upload-list-item-progress')
    }, { polling: 500 })

    // console.log('catalog upload finished!')
}

function send_email(ctx, buyer, product_group) {
    let param = {}
    param.buyer = buyer.name.split(' ')[0]
    param.user_name = ctx.user.name
    param.user_full_name = ctx.user.fullName
    param.product_group = product_group.fullName
    param.product_lineup = `${product_group.lineup.map(x => `<li>${x}</li>`).join('\r\n  ')}`
    param.whatsapp = ctx.user.mobile
    param.email = ctx.user.id
    param.homepage = markets[ctx.market].homepage
    // console.log(param)

    let email_content = eval('`' + templates[ctx.market].email + '`')
    // console.log(reply_message)

    let transporter = mailer.createTransport({
        "host": "smtp.qiye.aliyun.com",
        "secureConnection": true, // use SSL, the port is 465
        "port": 465,
        // "port": 25,
        "auth": {
            "user": ctx.user.id,
            "pass": ctx.user.email_pwd
        }
    });

    let options = {
        from: ctx.user.id,
        to: buyer.email,
        subject: ctx.market === 'Tools' ? 'Tanks for your inquiry on Alibaba.com' : 'Eyelash Product Catalog',
        html: email_content
    }

    transporter.sendMail(options, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            sent_emails.push(buyer.email)
            console.log('Email sent: ' + info.response);
        }
    });

}

async function reply(ctx, inquiry_id, with_catalog) {
    await ctx.page.click(`a.inquiry-item[data-trade-id="${inquiry_id}"]`);

    try {
        while ((await ctx.browser.pages()).length !== 2) {
            await ctx.page.waitForTimeout(500)
        }

        let page = (await ctx.browser.pages())[1]

        // wait until the conversation is loaded
        await page.waitForFunction(() => {
            return !!document.querySelectorAll('.item-content-left').length
        }, { polling: 500 })


        let buyer = await find_buyer(page)
        // console.log(buyer)

        let product_group = await find_related_product_categories(ctx, page)
        // console.log(product_group)

        await fill_message(ctx, page, buyer, product_group)

        if (with_catalog) {
            await attach_catalog(ctx, page, product_group)

        }

        // prevent duplicate email sending
        if (buyer.email && sent_emails.indexOf(buyer.email) !== -1) {
            send_email(ctx, buyer, product_group)
        }

        await page.click('div.reply-wrapper div.send')
        await page.waitForTimeout(1000)


    } catch (err) {
        console.log(err)
    } finally {
        let pages = await ctx.browser.pages()
        if (pages.length > 1) {
            await pages[1].close()
        }
    }
}

async function run(ctx) {
    if (!(ctx.market in products)) {
        load_products(ctx);
    }

    if (!(ctx.market in templates)) {
        load_templates(ctx);
    }

    let result = await ctx.page.waitForFunction((selector) => {
        let items = document.querySelectorAll(selector)
        return items.length === 0 ? false : items
    }, { "polling": 500 }, '.main-content .inquiry-item')

    let inquiries = await result.evaluate((items) => {
        let results = []
        for (let item of items) {
            let inquiry = {}
            inquiry.id = item.getAttribute('data-trade-id')
            inquiry.owner = item.querySelector('td.aui2-grid-owner-col').textContent.trim()
            inquiry.times = item.querySelector('.aui2-grid-header>div:nth-child(3)').textContent.trim().split('\n').map(e => e.split('： ')[1].trim())
            inquiry.sender = item.querySelector('.aui2-grid-name').textContent.trim()
            inquiry.status = item.querySelector('.aui2-grid-quo-status-col').textContent.trim()

            results.push(inquiry)
        }
        return results
    })

    let with_catalog = false
    let now = moment()
    for (let time_region of catalog_sending_time_region) {
        start = moment(`${now.format('YYYY-MM-DD')}T${time_region[0]}:00+08:00`)
        end = moment(`${now.format('YYYY-MM-DD')}T${time_region[1]}:00+08:00`)
        if (now >= start && now <= end) {
            with_catalog = true
            break
        }
    }

    for (let inquiry of inquiries) {
        if (inquiry.status === '新询盘' && inquiry.owner == ctx.user.fullName) {
            await reply(ctx, inquiry.id, with_catalog)
        }
    }
}


exports.name = __filename.substring(__filename.lastIndexOf('\\') + 1);
exports.url = target_url;
exports.add_catalog_sending_time_region = add_catalog_sending_time_region;
exports.run = run;

/********************************************************************** */

return;

let ctx = undefined;
let ctx_jessica = undefined;
let ctx_candy = undefined;
let ctx_robin = undefined;
(async () => {
    ctx_jessica = (await alibaba.getContexts(userName = "Jessica"))[0];
    ctx_candy = (await alibaba.getContexts(userName = "Candy"))[0];
    ctx_robin = (await alibaba.getContexts(userName = "Robin"))[0];
    ctx = ctx_jessica;
})();

(async () => {

    if (!(ctx.market in products)) {
        load_products(ctx);
    }

    if (!(ctx.market in templates)) {
        load_templates(ctx);
    }

})();

(async () => {
    await alibaba.openBrowser(ctx);
    await ctx.page.goto(
        target_url,
        { waitUntil: 'networkidle2' }
    );
    await alibaba.login(ctx);
})();

(async () => {
    await ctx.page.goto(
        target_url,
        { waitUntil: 'networkidle2' }
    );
})();

(async () => {
    await alibaba.login(ctx)
})();

// .editor
(async () => {
    await ctx.page.goto(
        target_url,
        { waitUntil: 'networkidle2' }
    );

    await run(ctx);
})();

// .editor
(async () => {

})();

// .editor
(async () => {

})();


// .editor
(async () => {


})();


