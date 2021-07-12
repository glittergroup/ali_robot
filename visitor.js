const alibaba = require('./alibaba')
const fs = require('fs')


let target_url = 'https://data.alibaba.com/marketing/visitor';
const products = {};
const product_groups = {}
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

function load_recommendations(ctx) {

    if (!(ctx.market in recommendations)) {
        recommendations[ctx.market] = {}
    }

    for (let [pid, product] of Object.entries(products[ctx.market])) {
        let model = product['model']

        if (!model.endsWith('789')) {
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
                // console.log(a.group[0], b.group[0])
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

    await ctx.page.click('#J-condition-mailable')
    await loading(ctx)
}

async function loading(ctx) {
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
        if (pid && pids.indexOf(pid) === -1) {
            pids.push(pid)
        }
        if (gid && gids.indexOf(gid) === -1) {
            gids.push(gid)
        }
    }

    let groups = gids.map(gid => product_groups[ctx.market][gid].name)

    // console.log(pids, gids, groups ? groups : [])
    // for (let pid of pids) {
    //     console.log(pid, products[ctx.market][pid].group)
    // }

    let recommended = []

    for (let pid of pids) {

        let product = products[ctx.market][pid]

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

    while (groups.length > 0 && recommended.length < 5) {
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


    while (groups.length === 0 && recommended.length < 5) {
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
            await iframe.waitForFunction(() => !document.querySelector('#container .next-loading-tip'))

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
                await iframe.waitForTimeout(300)
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


let occupied_vids = []

async function mail(ctx, visitor) {

    //todo
    try {

        // business logic


    } catch (err) {
        //todo: print err info to console
        //todo: remove vid from occupied_vids
        let idx = occupied_vids.indexOf(visitor.id)
        if (idx != -1) {
            occupied_vids.splice(idx, 1)
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

    if (!(ctx.market in recommendations)) {
        load_recommendations(ctx)
    }

    await loading(ctx)
    await filter(ctx)
    await loading(ctx)

    while (true) {

        // if there is no mailable visitor, exit
        if (await ctx.page.$eval('#J-visitors-tip-no-data', el => el.offsetParent !== null)) {
            break
        }

        let visitors = await find_visitors(ctx);

        for (let visitor of visitors) {
            console.log(visitor)

            if (visitor.id in occupied_vids) {
                continue
            }

            occupied_vids.push(visitor.id)

            await mail(ctx, visitor)
        }

        // for test
        break

        if (visitors.length == 0) {
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
(async () => {
    ctx = (await alibaba.getContexts(userName = "Jessica"))[0]
})();

(async () => {

    if (!(ctx.market in products)) {
        load_products(ctx);
    }
    if (!(ctx.market in product_groups)) {
        load_product_groups(ctx);
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
    // await ctx.page.goto(
    //     target_url,
    //     { waitUntil: 'networkidle2' }
    // );
    await alibaba.login(ctx);
})();

(async () => { await alibaba.login(ctx); })();

(async () => { await run(ctx); })();


(async () => {

})();


(async () => { })();


(async () => {
    async function mail(ctx, visitor) {

        let recommended = await find_recommended(ctx, visitor)

        try {
            await ctx.page.click(`#J-visitors-tbl-tbody tr.J-visitors-table-tr:nth-child(${visitor.idx}) span.mailable`)
            // business logic
            await ctx.page.waitForFunction(() => {
                let result = false
                for (let btn of document.querySelectorAll('.ui-window input[type="button"]:first-child')) {
                    console.log('===', btn.offsetParent)
                    if (btn.offsetParent !== 0) {
                        btn.click()
                        result = true
                        break
                    }
                }
                return result
            })
            await ctx.page.click('.ui-window input[type="button"]:first-child')[1]


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

        } catch (err) {
            //todo: print err info to console
            //todo: remove vid from occupied_vids
            console.log(err)
            let pages = await ctx.browser.pages()
            if (pages.length === 2) {
                await pages[1].close()
            }
            let idx = occupied_vids.indexOf(visitor.id)
            if (idx != -1) {
                occupied_vids.splice(idx, 1)
            }
        }
    }

    let visitors = await find_visitors(ctx)

    let visitor = visitors[3]
    console.log(visitor)
    await mail(ctx, visitor)

})();

// choose products
(async () => {
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
                await iframe.waitForFunction(() => !document.querySelector('#container .next-loading-tip'))

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
                    await iframe.waitForTimeout(300)
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



(async () => {
    let page = (await ctx.browser.pages())[1]
    let recommended = []
    recommended.push(products[ctx.market]['62592058203'])
    recommended.push(products[ctx.market]['1600239313005'])
    recommended.push(products[ctx.market]['60799648950'])
    recommended.push(products[ctx.market]['62590927575'])
    recommended.push(products[ctx.market]['60615788902'])



    await iframe.waitForFunction(() => !document.querySelector('#container .next-loading-tip'))

})();

(async () => {
    let page = (await ctx.browser.pages())[1]
    let recommended = []
    recommended.push(products[ctx.market]['62592058203'])
    recommended.push(products[ctx.market]['1600239313005'])
    recommended.push(products[ctx.market]['60799648950'])
    recommended.push(products[ctx.market]['62590927575'])
    recommended.push(products[ctx.market]['60615788902'])



})();

(async () => {

    let page = (await ctx.browser.pages())[1]
    let elementHandle = await page.$('iframe.simple-content-iframe');
    let iframe = await elementHandle.contentFrame();



})();