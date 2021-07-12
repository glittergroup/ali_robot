const alibaba = require('./alibaba')

let target_url = 'https://www2.alibaba.com/manage_ad_keyword.htm';

async function loading(ctx) {
    await ctx.page.waitForFunction(
        (selector) => {
            let loadingMasks = document.querySelectorAll(selector)
            if (loadingMasks.length == 0) {
                return false
            }
            for (let loadingMask of loadingMasks) {
                if (loadingMask.offsetParent !== null) {
                    return false
                }
            }
            return true
        },
        {
            polling: 300,
        },
        'i.bp-loading-mask'
    );
}

async function updatePrices(ctx, maxPrice, offset) {
    let statusList = await ctx.page.$$eval(
        '.bp-table-main-wraper>table.bp-table-main tr.selectable',
        trs => {
            return trs.map(tr => [
                tr.querySelector('td.bp-cell-status i').classList.value.split('-')[2],
                tr.querySelector('td:nth-child(5) a').classList.contains('disabled'),
                tr.querySelector('td:nth-child(3) span.keyword-cell').textContent.trim()
            ])
        }
    )
    for (let [idx, status] of statusList.entries()) {
        console.log('[P4P]:', idx + 1, status)
        if (status[0] === 'stop' || status[1]) {
            continue
        }

        let tr_idx = idx + 1

        // if (!(tr_idx == 3 || tr_idx == 4)) {
        //     continue
        // }

        // console.log('[P4P]:', tr_idx, status)

        await ctx.page.click(`.bp-table-main-wraper>table.bp-table-main tr.selectable:nth-child(${tr_idx}) td:nth-child(5) a`);
        await loading(ctx);

        await ctx.page.evaluate((maxPrice, offset) => {

            let keyword = document.querySelector('span[data-role="span-keyword"]').textContent.trim()
            let minPrice = parseFloat(document.querySelector('span[data-role="span-baseprice"]').textContent.trim())
            let price = NaN
            let price_idx = 6

            if (document.querySelector('div[data-role="rank-infos"]').textContent.includes('相关度不足')) {
                btn = document.querySelector('.ui2-dialog input[data-role="cancel"]')
                btn.click()
                return
            }

            while (isNaN(price)) {
                price = parseFloat(document.querySelector(`.ui2-dialog table tbody td:nth-child(${price_idx})`).textContent.trim())
                price_idx--
            }

            if (price_idx != 5) {
                price = minPrice
            } else {
                price = price - offset
                if (price < minPrice) {
                    price = minPrice
                }
            }

            if (price > maxPrice) {
                price = maxPrice
            }

            // console.log('[P4P]:', keyword, maxPrice, price_idx, price)
            document.querySelector('.ui2-dialog input').value = price.toFixed(1)

            btn = document.querySelector('.ui2-dialog input[data-role="confirm"]')
            btn.click()

        }, maxPrice, offset)

        await ctx.page.waitForFunction(
            (selector) => {
                let btn_confirm = document.querySelector(selector)
                return btn_confirm.offsetParent === null
            },
            {
                polling: 200,
            },
            '.ui2-dialog input[data-role="confirm"]'
        );

    }
}

async function run(ctx) {
    await loading(ctx);
    let keyword_groups = await ctx.page.$$eval(
        'div.keyword-group .group-list li',
        lis => lis.map(li => li.querySelector('span.name').textContent.trim())
    )

    // loop through all keyword groups
    for (let [idx, group] of keyword_groups.entries()) {
        let children_idx = idx + 1
        let name = group.substring(0, group.lastIndexOf('M') == -1 ? group.lastIndexOf('(') : group.lastIndexOf('M'))
        let keywords_count = parseInt(group.substring(group.lastIndexOf('(') + 1, group.lastIndexOf(')')))

        if (keywords_count == 0) {
            continue
        }

        if (group.lastIndexOf('M') == -1 && group.lastIndexOf('J') == -1) {
            continue
        }
        // let maxPrice = 10
        let maxPrice = parseFloat(group.substring(group.lastIndexOf('M') + 1, group.lastIndexOf('J'))) / 10
        let offset = parseFloat(group.substring(group.lastIndexOf('J') + 1, group.lastIndexOf('('))) / 10

        console.log('[P4P]:', children_idx, name, keywords_count, maxPrice.toFixed(1), offset.toFixed(1))

        // /* test some keyword groups */
        // if ([1].indexOf(children_idx) == -1) {
        //     continue
        // }

        await ctx.page.click(`div.keyword-group .group-list li:nth-child(${children_idx})`);
        await loading(ctx);

        // loop through all pages
        while (true) {

            await updatePrices(ctx, maxPrice, offset)

            // next page
            next_page_selector = 'div.bp-table-footer .next:not(.disable)'
            let btn_next = await ctx.page.$(next_page_selector)
            if (btn_next) {
                current_page_number = await ctx.page.$eval('.ui2-pagination .current', el => el.textContent.trim())

                await ctx.page.click(next_page_selector)

                await ctx.page.waitForFunction(
                    (selector, current_page_number) => {
                        return current_page_number != document.querySelector(selector).textContent.trim()
                    },
                    {
                        polling: 200,
                    },
                    '.ui2-pagination .current', current_page_number
                );

            } else {
                break
            }
        }

        // await ctx.page.waitForTimeout(200)
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

(async () => { await run(ctx); })();

(async () => { })();

(async () => {

})();
