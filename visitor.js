const alibaba = require('./alibaba')
const fs = require('fs')
const markets = JSON.parse(fs.readFileSync('./storage/markets.json'))


let target_url = 'https://data.alibaba.com/marketing/visitor';
let occupied_vids = []

const products = {};
const product_groups = {}
const templates = {}
const recommendations = {}

function load_products(ctx) {
    if (!(ctx.market in products)) {
        products[ctx.market] = JSON.parse(fs.readFileSync(`./storage/${ctx.market}/products.json`))
    }
}

function load_product_groups(ctx) {
    if (!(ctx.market in product_groups)) {
        product_groups[ctx.market] = JSON.parse(fs.readFileSync(`./storage/${ctx.market}/product_groups.json`))
    }
}

function load_templates(ctx) {
    if (!(ctx.market in templates)) {
        templates[ctx.market] = fs.readFileSync(`./storage/${ctx.market}/visitor.templ`, 'utf8')
    }
}

function load_recommendations(ctx) {

    if (!(ctx.market in recommendations)) {
        recommendations[ctx.market] = {}
    }

    for (let [pid, product] of Object.entries(products[ctx.market])) {

        if (product.status.includes('已下架')) {
            continue
        }

        if (!product.model.endsWith('789') && ctx.user.name !== 'Jessica') {
            continue
        } else if (!product.model.endsWith('123') && ctx.user.name === 'Jessica') {
            continue
        }

        let owner = product['owner'].split(' ')[0]
        if (!(owner in recommendations[ctx.market])) {
            recommendations[ctx.market][owner] = {}
        }
        if (product.group[0].includes('未分組') && product.group.length > 1) {
            product.group.shift()
        }

        if (!(product.group[0] in recommendations[ctx.market][owner])) {
            recommendations[ctx.market][owner][product.group[0]] = []
        }
        recommendations[ctx.market][owner][product.group[0]].push(product)
    }

    for (let owner in recommendations[ctx.market]) {
        // console.log('------------->>>:', owner)
        for (let g in recommendations[ctx.market][owner]) {
            // console.log('\t', g)

            recommendations[ctx.market][owner][g].sort((a, b) => {
                // console.log(product_groups[ctx.market].keys(), a.group[0], b.group[0])
                let groups = product_groups[ctx.market][a.group[0]].children.map(x => x.name)

                let idx_a = groups.indexOf(a.group[1])
                let idx_b = groups.indexOf(b.group[1])
                return idx_a - idx_b
            })
            for (let p of recommendations[ctx.market][owner][g]) {
                // console.log('\t\t', p.id, products[ctx.market][p.id].group)
            }
        }
    }
}

async function filter(ctx) {
    await ctx.page.click('#J-common-state-date .ui-dropdown-trigger')
    await ctx.page.waitForFunction((selector) => {
        let el = document.querySelector(selector)
        return el && el.offsetParent != null
    }, {}, '#J-common-state-options li:nth-child(2)')

    await ctx.page.click('#J-common-state-options li:nth-child(2)')
    await ctx.page.waitForFunction((selector) => {
        return document.querySelector(selector).offsetParent == null
    }, {}, '#J-common-state-options li:nth-child(2)')

    await loading(ctx)

    if (!await ctx.page.evaluate(() => document.querySelector('#J-condition-mailable').checked)) {
        await ctx.page.click('#J-condition-mailable')
    }

}

async function loading(ctx) {
    await ctx.page.waitForTimeout(500)
    await ctx.page.waitForFunction((selector) => {
        let el = document.querySelector(selector)
        return el && el.offsetParent == null
    }, {}, '#J-visitors-tip-loading')
}

async function find_visitors(ctx) {
    return await ctx.page.$$eval(
        '#J-visitors-tbl-tbody tr.J-visitors-table-tr',
        trs => {
            let visitors = []
            for (let tr of trs) {
                if (tr.offsetParent === null) {
                    break
                }
                let visitor = {}
                visitor['idx'] = Array.prototype.indexOf.call(tr.parentNode.children, tr) + 1
                visitor['id'] = tr.querySelector('td.td-visitor a').textContent.trim()
                visitor['region'] = tr.querySelector('td.td-region span').getAttribute('title').trim()
                visitor['stay'] = tr.querySelector('td.td-stay-duration').textContent.trim()
                visitor['searched-keywords'] = []
                for (let div of tr.querySelectorAll('div.search-keywords div')) {
                    visitor['searched-keywords'].push(div.textContent.trim())
                }
                visitors.push(visitor)
            }
            return visitors
        }
    )
}

async function pv_dialog_open(ctx) {
    await ctx.page.waitForFunction(() => {
        let el = document.querySelector('#J-vistor-detail-close')
        return el && el.offsetParent !== null
    })
}

async function pv_dialog_close(ctx) {
    await ctx.page.waitForFunction(() => {
        let el = document.querySelector('#J-vistor-detail-close')
        return !el || el.offsetParent === null
    })
}

async function pv_dialog_loading(ctx) {
    await ctx.page.waitForFunction(() => {
        let el = document.querySelector('#J-tip-loading-visitor-detail')
        return !el || el.offsetParent === null
    })
}

async function find_page_views(ctx, visitor) {

    let pvcount = await ctx.page.$eval(
        `#J-visitors-tbl-tbody tr:nth-child(${visitor.idx}) td.td-pv span`,
        el => parseInt(el.getAttribute('visitpv'))
    )
    if (pvcount === 0) {
        return []
    }

    // await ctx.page.evaluate((selector) => {
    //     let el = document.querySelector(selector)
    //     el.scrollIntoView()
    // }, `#J-visitors-tbl-tbody tr:nth-child(${visitor.idx}) td.td-pv`)

    await ctx.page.click(`#J-visitors-tbl-tbody tr:nth-child(${visitor.idx}) td.td-pv`)
    await pv_dialog_open(ctx)

    let pvs = []

    while (true) {
        await pv_dialog_loading(ctx)

        // await ctx.page.waitForTimeout(1000)

        let pageViews = await ctx.page.evaluate(() => {
            let products = []
            for (let vtr of document.querySelectorAll('#J-visitor-detail-tbl-tbody tr')) {
                let product = {}
                product['title'] = vtr.querySelector('td.visitor-detail-page a').textContent.trim()
                product['href'] = vtr.querySelector('td.visitor-detail-page a').getAttribute('href')
                product['stay-duration'] = vtr.querySelector('td.visitor-detail-stay').textContent.trim()
                // console.log(product['stay-duration'], product['title'])
                products.push(product)
            }
            return products;
        })

        for (let pv of pageViews) {
            pvs.push(pv)
        }

        // swith to next page
        let result = await ctx.page.evaluate(() => {
            let el = document.querySelector('#J-pagination-visitor-detail a.ui-pagination-next')
            if (el) {
                el.click();
                return true
            } else {
                return false
            }
        });

        if (result) {
            await loading(ctx)
        } else {
            break
        }
    }

    await ctx.page.click('#J-vistor-detail-close')
    await pv_dialog_close(ctx)

    return pvs
}

async function find_recommended(ctx, visitor) {

    let pageViews = await find_page_views(ctx, visitor)

    pageViews.sort((a, b) => {
        let ad = 0
        if (a['stay-duration'].endsWith('s')) {
            ad = parseInt(a['stay-duration'].split('s')[0].trim())
        }

        let bd = 0
        if (b['stay-duration'].endsWith('s')) {
            bd = parseInt(b['stay-duration'].split('s')[0].trim())
        }
        return bd - ad;
    })

    // console.log(pageViews)
    let pids = []
    let gids = []
    for (let pv of pageViews) {
        let pid_regexps = [
            /product-detail\/.+[_-](\d+)\.html/,
            /product\/(\d+)\.html/,
            /product\/(\d+)\/[^\/]+\.html/,
            /p-detail\/.+[_-](\d+)\.html/
        ]

        let pid = undefined
        for (let regexp of pid_regexps) {
            pid = pv.href.match(regexp)
            if (pid) {
                pid = pid[1]
                break
            }
        }

        let gid_regexps = [
            /productgrouplist-(\d+)/
        ]
        let gid = undefined
        for (let regexp of gid_regexps) {
            gid = pv.href.match(regexp)
            if (gid) {
                gid = gid[1]
                break
            }
        }

        for (let regexp of pid_regexps) {
            pid = pv.href.match(regexp)
            if (pid) {
                pid = pid[1]
                break
            }
        }

        // console.log(pv.href)
        // console.log(pid, gid)
        if (pid && pid in products[ctx.market] && pids.indexOf(pid) === -1) {
            pids.push(pid)
        }
        if (gid && gids.indexOf(gid) === -1) {
            gids.push(gid)
        }
    }

    let groups = gids.map(gid => product_groups[ctx.market][gid].name)

    console.log(pids, gids, groups ? groups : [])
    for (let pid of pids) {
        console.log(pid, products[ctx.market][pid].group)
    }

    let recommended = []

    for (let pid of pids) {

        let product = products[ctx.market][pid]

        if (!(product.group[0] in recommendations[ctx.market][ctx.user.name])) {
            recommended.push(product)
            continue
        }

        for (let p of recommendations[ctx.market][ctx.user.name][product.group[0]]) {
            if (p.group[1] === product.group[1]) {
                recommended.push(p)
                if (groups.indexOf(p.group[0]) === -1) {
                    groups.push(p.group[0])
                }
                break
            }
        }
    }

    let loopCount = 100
    while (groups.length > 0 && recommended.length < 5) {
        if (loopCount > 0) {
            loopCount--
        } else {
            break
        }
        for (let group of groups) {
            for (let p of recommendations[ctx.market][ctx.user.name][group]) {
                if (recommended.indexOf(p) === -1) {
                    recommended.push(p)
                    break
                }
            }
            if (recommended.length >= 5) {
                break
            }
        }
    }

    loopCount = 100
    while (groups.length === 0 && recommended.length < 5) {
        if (loopCount > 0) {
            loopCount--
        } else {
            break
        }
        for (let group in recommendations[ctx.market][ctx.user.name]) {
            for (let p of recommendations[ctx.market][ctx.user.name][group]) {
                if (recommended.indexOf(p) === -1) {
                    recommended.push(p)
                    break
                }
            }
            if (recommended.length >= 5) {
                break
            }
        }
    }

    // console.log('------------------\n')
    // for (let p of recommended) {
    //     console.log(p.id, p.group)
    // }
    // console.log('------------------\n')

    return recommended
}

async function selectProducts(page, recommended) {

    for (let product of recommended) {

        await page.click('.trigger-container a[data-role="chooseProduct"]')
        await page.waitForSelector('iframe.simple-content-iframe')

        let elementHandle = await page.$('iframe.simple-content-iframe');
        let iframe = await elementHandle.contentFrame();
        await iframe.waitForFunction(() => !document.querySelector('#container .next-loading-tip'))

        await iframe.waitForSelector('input[role="searchbox"]', { visible: true })

        let input_search = await iframe.$('input[role="searchbox"]')
        await input_search.type(product.title)
        await iframe.click('i[role="button"]')

        // select the product
        while (true) {
            await page.waitForFunction(() => {
                let iframe = document.querySelector('.simple-content-iframe')
                if (!iframe) {
                    return false
                }
                return !iframe.contentDocument.body.querySelector('#container .next-loading-tip')
            })
            await iframe.waitForTimeout(300)
            let idx = await iframe.evaluate((product) => {
                for (let [idx, div] of document.querySelectorAll('.basic div[role="gridcell"]').entries()) {
                    let href = div.querySelector('.popup-item-description a').getAttribute('href')
                    if (href.includes(product.id)) {
                        // div.querySelector('.popup-item-img-wrapper').click()
                        return idx + 1
                    }
                }
                return null
            }, product)

            if (idx) {
                await iframe.waitForTimeout(400)
                await iframe.click(`.basic div[role="gridcell"]:nth-child(${idx}) img`)
                await iframe.waitForFunction(() => {
                    return !document.querySelector('button#confirm').hasAttribute('disabled')
                })
                await iframe.click('button#confirm')
                break
            }

            let has_next_page = await iframe.evaluate(() => {
                let btn_next = document.querySelector('button.next-next')
                return !btn_next.hasAttribute('disabled')
            })

            if (has_next_page) {
                await iframe.click('button.next-next')
            } else {
                await page.click('a.ui-window-close')
                await page.waitForFunction(() => {
                    return !document.querySelector('iframe.simple-content-iframe')
                })
                break
            }
        }

        await page.evaluate((product) => {
            for (let div of document.querySelectorAll('.product-item')) {
                let href = div.querySelector('.product-info a').getAttribute('href')

                if (!href.includes(product.id)) {
                    continue
                }

                div.querySelector('input.quantity-input').value = '1'
                div.querySelector('input[name="unitPrice"]').value = product.price[0]
            }
        }, product)
    }
}

async function mail(ctx, visitor) {

    let recommended = await find_recommended(ctx, visitor)

    try {
        await ctx.page.click(`#J-visitors-tbl-tbody tr.J-visitors-table-tr:nth-child(${visitor.idx}) span.mailable`)
        // business logic
        await ctx.page.waitForFunction(() => {
            for (let btn of document.querySelectorAll('.ui-window input[type="button"]:first-child')) {
                if (btn.offsetParent) {
                    btn.click()
                    return true
                }
            }
            return false
        })

        let page = (await ctx.browser.pages())[1]
        // remove the useless row
        await page.waitForFunction(() => {
            let el = document.querySelector('.product-item .remove-item a')
            return el && el.offsetParent !== null
        })
        await page.click('.product-item .remove-item a')

        // set the title
        await page.click('.promotion .ui2-combobox-trigger i')
        await page.waitForFunction(() => {
            for (let li of document.querySelectorAll('.ui2-popup-menu-list li a')) {
                if (li.offsetParent !== null && li.textContent == "Hot products with competitive prices") {
                    li.click()
                    return true
                }
            }
            return false
        })

        // chose the product
        await selectProducts(page, recommended)

        // fill reply message
        let param = {}
        let group = []
        for (let product of recommended) {
            if (group.indexOf(product.group[0]) === -1) {
                group.push(product.group[0])
            }
        }
        if (group.length === 1) {
            group = group[0].toLowerCase()
        } else {
            group = 'default'
        }
        group = markets[ctx.market].product_groups[group]
        param.product_group = group.fullName
        param.product_lineup = group.lineup.map(x => ` - ${x}`).join('\r\n')

        param.user_name = ctx.user.fullName.split(' ')[0]
        param.whatsapp = ctx.user.mobile
        param.email = ctx.user.id

        let msg = eval('`' + templates[ctx.market] + '`')

        await page.evaluate((message) => {
            let textarea = document.querySelector('textarea.inquiry-content')
            // console.log(textarea)
            textarea.value = message
        }, msg)

        await page.click('div[data-role="leads-form-footer"] a[data-trigger="send-leads"]')
        await page.waitForFunction(() => !!document.querySelector('i.ui2-icon-success'))

    } catch (err) {
        //todo: print err info to console
        //todo: remove vid from occupied_vids
        console.log(err)
        let idx = occupied_vids.indexOf(visitor.id)
        if (idx != -1) {
            occupied_vids.splice(idx, 1)
        }
    } finally {
        let pages = await ctx.browser.pages()
        if (pages.length === 2) {
            await pages[1].close()
        }
    }
}


async function run(ctx) {
    if (!(ctx.market in products)) {
        load_products(ctx);
    }
    if (!(ctx.market in product_groups)) {
        load_product_groups(ctx);
    }
    if (!(ctx.market in templates)) {
        load_templates(ctx);
    }
    if (!(ctx.market in recommendations)) {
        load_recommendations(ctx)
    }

    await loading(ctx)
    await filter(ctx)
    await loading(ctx)

    let count = await ctx.page.evaluate(() => {
        let el = document.querySelector('span.overview-total')
        if (el && el.offsetParent !== null) {
            return parseInt(el.textContent)
        } else {
            return -1
        }
    })

    if (count <= 0) {
        return
    }

    while (true) {
        await ctx.page.waitForTimeout(500)
        // if there is no mailable visitor, exit
        if (await ctx.page.$eval('#J-visitors-tip-no-data', el => el.offsetParent !== null)) {
            break
        }

        await ctx.page.waitForFunction(() => {
            for (let span of document.querySelectorAll('td.td-operate>span:first-child')) {
                if (!span.classList.contains('mailable')) {
                    return false
                }
            }
            return true
        })

        let visitors = await find_visitors(ctx);

        for (let [_, visitor] of visitors.entries()) {
            console.log(visitor)
            if (count === 0) {
                break
            }

            if (occupied_vids.indexOf(visitor.id) !== -1) {
                continue
            }

            occupied_vids.push(visitor.id)

            await mail(ctx, visitor)

            console.log(occupied_vids)
            count--

            // for test
            // break
        }

        // for test
        // break

        if (count === 0) {
            break
        }

        if (visitors.length - occupied_vids.length <= 0) {
            break
        } else {
            await ctx.page.click('#J-condition-mailable')
            await loading(ctx)

            await ctx.page.click('#J-condition-mailable')
            await loading(ctx)
        }

        // // swith to next page
        // let result = await ctx.page.evaluate(() => {
        //     let el = document.querySelector('#J-pagination-visitors a.ui-pagination-next')
        //     if (el) {
        //         el.click();
        //         return true
        //     } else {
        //         return false
        //     }
        // });

        // if (result) {
        //     await loading(ctx)
        // } else {
        //     break
        // }
    }
}


exports.name = __filename.substring(__filename.lastIndexOf('\\') + 1);
exports.url = target_url;
exports.run = run;

/********************************************************************** */

return;

let ctx = undefined;
let ctx_carrie = undefined;
let ctx_jessica = undefined;
let ctx_candy = undefined;
(async () => {
    ctx_carrie = (await alibaba.getContexts(userName = "Carrie"))[0]
    ctx_jessica = (await alibaba.getContexts(userName = "Jessica"))[0]
    ctx_candy = (await alibaba.getContexts(userName = "Candy"))[0]
})();

(async () => {

    if (!(ctx.market in products)) {
        load_products(ctx);
    }
    if (!(ctx.market in product_groups)) {
        load_product_groups(ctx);
    }
    if (!(ctx.market in templates)) {
        load_templates(ctx);
    }
    load_recommendations(ctx)

})();

// .editor
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
    // await alibaba.login(ctx);
})();

(async () => { await alibaba.login(ctx); })();

(async () => { await filter(ctx) })();

(async () => { await run(ctx_carrie); })();
(async () => { await run(ctx_jessica); })();

(async () => { })();


// choose products
(async () => {


    // product?
    let page = (await ctx.browser.pages())[1]

    let ps = []
    for (let user in recommendations[ctx.market]) {
        for (let group in recommendations[ctx.market][user]) {
            for (let product of recommendations[ctx.market][ctx.user.name][group]) {
                ps.push(product)
            }
        }
    }
    let recommended = []
    while (recommended.length < 5) {
        let random = Math.floor(Math.random() * ps.length);
        let p = ps[random]
        if (recommended.indexOf(p) === -1) {
            recommended.push(p)
        }
    }

    for (let p of recommended) {
        console.log(p.id, p.title)
    }

    await selectProducts(page, recommended)
})();


//.editor
(async () => {
    async function filter(ctx) {
        await ctx.page.click('#J-common-state-date .ui-dropdown-trigger')
        await ctx.page.waitForFunction((selector) => {
            let el = document.querySelector(selector)
            return el && el.offsetParent != null
        }, {}, '#J-common-state-options li:nth-child(2)')

        await ctx.page.click('#J-common-state-options li:nth-child(2)')
        await ctx.page.waitForFunction((selector) => {
            return document.querySelector(selector).offsetParent == null
        }, {}, '#J-common-state-options li:nth-child(2)')

        await loading(ctx)

        if (!await ctx.page.evaluate(() => document.querySelector('#J-condition-mailable').checked)) {
            await ctx.page.click('#J-condition-mailable')
        }

    }

    await filter(ctx)
})();





//.editor
(async () => {

    let visitors = await find_visitors(ctx)
    let visitor = visitors[6]

    let recommended = await find_recommended(ctx, visitor)
    console.log('-------------')

    let group = []
    for (let product of recommended) {
        if (group.indexOf(product.group[0]) === -1) {
            group.push(product.group[0])
        }
    }

})();


//.editor
(async () => {

    let groups = []
    for (let pid in products[ctx.market]) {
        let p = products[ctx.market][pid]
        if (groups.indexOf(p.group[0]) === -1) {
            groups.push(p.group[0])
        }
    }

    group = groups.slice(1, 2)
    console.log(groups, group)

    let param = {}
    param.user_name = ctx.user.fullName.split(' ')[0]
    param.whatsapp = ctx.user.mobile
    param.email = ctx.user.id

    if (group.length === 1) {
        group = group[0].toLowerCase()
    } else {
        group = 'default'
    }
    group = markets[ctx.market].product_groups[group]
    param.product_group = group.fullName
    param.product_lineup = group.lineup.map(x => ` - ${x}`).join('\r\n')

    console.log(param)

    message = eval('`' + templates[ctx.market] + '`')
    console.log(message)
})();



(async () => {
    // await ctx.page.mouse.move(350,500);
    await ctx.page.mouse.click(575, 250)
})();

(() => {
    function load_templates(ctx) {
        if (!(ctx.market in templates)) {
            templates[ctx.market] = fs.readFileSync(`./storage/${ctx.market}/visitor.templ`, 'utf8')
        }
    }
    load_templates(ctx)


})();