const alibaba = require('./alibaba')
const fs = require('fs')

let target_url = 'https://hz-productposting.alibaba.com/product/products_manage.htm';

async function loading(ctx) {
    await ctx.page.waitForFunction(() => {
        return !document.querySelector('.next-loading-wrap .next-loading-tip')
    });
}

async function nextPage(ctx) {
    return await ctx.page.evaluate(() => {
        let btn_next = document.querySelector('.next-pagination.next-normal button.next-next')
        if (btn_next.hasAttribute('disabled')) {
            return false
        } else {
            btn_next.click()
            return true
        }
    });
}


async function findAllProducts(ctx) {
    await ctx.page.click('.next-pagination-size-selector-filter button:last-child')
    await loading(ctx)

    let products = {}
    while (true) {

        let results = await ctx.page.evaluate(() => {
            let products = []
            for (let div of document.querySelectorAll('div[data-component="list"] div.list-item')) {
                let product = {}
                product['title'] = div.querySelector('div.product-subject a').getAttribute('title')
                product['href'] = div.querySelector('div.product-subject a').getAttribute('href')
                let span = div.querySelector('span.product-model')
                product['model'] = span ? span.textContent.trim() : ''
                product['group'] = div.querySelector('span.group-name').textContent.split(':')[1].trim().split('>')
                product['id'] = div.querySelector('div.product-id').textContent.split(':')[1].trim()
                product['price'] = div.querySelector('div.next-col:nth-child(4)').textContent.split(' - ')
                product['price'][0] = product['price'][0].substring(product['price'][0].indexOf('$') + 1).trim()
                product['price'][1] = product['price'][1].substring(0, product['price'][1].indexOf('/')).trim()

                product['owner'] = div.querySelector('span.product-owner').textContent.trim()
                product['update time'] = div.querySelector('div.next-col:nth-child(6) span').textContent.trim()
                product['status'] = div.querySelector('div.product-status span').textContent.trim()
                // console.log(product)
                products.push(product)
            }
            return products
        })

        for (let product of results) {
            for (let [idx, group] of product.group.entries()) {
                let parts = group.split('-')
                product.group[idx] = parts.length === 2 ? parts[1].trim() : parts[0].trim()
            }
            products[product.id] = product
        }
        // break
        if (await nextPage(ctx)) {
            await loading(ctx)
        } else {
            break
        }
    }
    console.log(`${Object.keys(products).length} products were found!`)
    return products
}


async function findAllProductGroups(ctx) {
    await ctx.page.goto(
        'https://hz-productposting.alibaba.com/product/manage_products_group.htm',
        { waitUntil: 'networkidle2' }
    )

    await ctx.page.waitForFunction(() => {
        return document.querySelectorAll('#tableGroup>.level-1').length > 1
    })
    await ctx.page.waitForTimeout(1000)

    let results = await ctx.page.evaluate(() => {
        let results = []
        for (let div of document.querySelectorAll('#tableGroup>.level-1')) {
            if (div.style.display === 'none') {
                continue
            }
            results.push([Array.prototype.indexOf.call(div.parentNode.children, div) + 1,
            !div.querySelector('.group-name-level-1').classList.contains('group-name-level-1-no-children')])
        }
        return results
    })

    for (let [idx, hasChildren] of results) {
        if (!hasChildren) {
            continue
        }
        while (true) {
            try {
                // console.log(`#tableGroup>.level-1:nth-child(${idx}) .group-name-level-1`)
                await ctx.page.click(`#tableGroup>.level-1:nth-child(${idx}) .group-name-level-1`)
                await ctx.page.waitForTimeout(200)
                await ctx.page.waitForFunction((selector) => {
                    // console.log(selector)
                    let el = document.querySelector(selector)
                    return el && (el.classList.contains('AE-sub-datatable-show') || el.classList.contains('group-name-level-1-no-children'))
                }, { timeout: 2000 }, `#tableGroup>.level-1:nth-child(${idx}) .group-name-level-1`)
                break
            } catch (err) {
                continue
            }
        }

        let results2 = await ctx.page.evaluate((selector) => {
            let results = []
            for (let div of document.querySelectorAll(selector)) {
                if (div.style.display === 'none') {
                    continue
                }
                results.push([Array.prototype.indexOf.call(div.parentNode.children, div) + 1,
                !div.querySelector('.group-name-level-2').classList.contains('group-name-level-2-no-children')])
            }
            return results
        }, `#tableGroup>.level-1:nth-child(${idx}) .level-2`)

        for (let [idx2, hasChildren2] of results2) {
            if (!hasChildren2) {
                continue
            }
            while (true) {
                try {
                    let selector = `#tableGroup>.level-1:nth-child(${idx}) .level-2:nth-child(${idx2}) .group-name-level-2`
                    await ctx.page.click(selector)
                    await ctx.page.waitForTimeout(200)
                    await ctx.page.waitForFunction((selector) => {
                        let el = document.querySelector(selector)
                        return el && (el.classList.contains('AE-sub-datatable-show') || el.classList.contains('group-name-level-1-no-children'))
                    }, { timeout: 2000 }, selector)
                    break
                } catch (err) {
                    continue
                }
            }
        }

    }

    return await ctx.page.evaluate(() => {
        let groups = {}
        for (let div1 of document.querySelectorAll('#tableGroup>.level-1')) {
            if (div1.style.display === 'none') {
                continue
            }

            let group1 = { 'level': 1, 'children': [], 'ancestor': [] }
            group1['name'] = div1.querySelector('td.col-group-name').getAttribute('title')
            if (group1['name'].includes('-')) {
                group1['name'] = group1['name'].split('-')[1].trim()
            }
            group1['id'] = div1.querySelector('span.product-count').getAttribute('id').match(/\d+/)[0]
            groups[group1.id] = group1
            groups[group1.name] = group1
            console.log(group1.id, group1.name)
            if (div1.querySelector('.group-name-level-1-no-children')) {
                continue
            }
            for (let div2 of div1.querySelectorAll('.level-2')) {
                if (div2.style.display === 'none') {
                    continue
                }

                let group2 = { 'level': 2, 'children': [], 'ancestor': [group1.id] }
                group2['name'] = div2.querySelector('td.col-group-name').getAttribute('title')
                if (group2['name'].includes('-')) {
                    group2['name'] = group2['name'].split('-')[1].trim()
                }

                group2['id'] = div2.querySelector('span.product-count').getAttribute('id').match(/\d+/)[0]
                groups[group2.id] = group2
                group1.children.push(group2)
                console.log('\t', group2.id, group2.name)
                if (div2.querySelector('.group-name-level-1-no-children')) {
                    continue
                }

                for (let div3 of div2.querySelectorAll('.level-3')) {
                    if (div3.style.display === 'none') {
                        continue
                    }

                    let group3 = { 'level': 3, 'children': [], 'ancestor': [group1.id, group2.id] }
                    group3['name'] = div3.querySelector('td.col-group-name').getAttribute('title')
                    if (group3['name'].includes('-')) {
                        group3['name'] = group3['name'].split('-')[1].trim()
                    }
                    group3['id'] = div3.querySelector('span.product-count').getAttribute('id').match(/\d+/)[0]
                    groups[group3.id] = group3
                    group2.children.push(group3)

                    console.log('\t\t', group3.id, group3.name)
                }
            }
        }
        return groups
    })
}


async function run(ctx) {

}


exports.name = __filename.substring(__filename.lastIndexOf('\\') + 1);
exports.url = target_url;
exports.run = run;

/********************************************************************** */

return;

let ctx = undefined;
(async () => {
    ctx = (await alibaba.getContexts(userName = "Carrie"))[0]
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

(async () => { })();

(async () => {
    let products = await findAllProducts(ctx);
    fs.writeFileSync(`./storage/${ctx.market}/products.json`, JSON.stringify(products, null, 2))
    // console.log(products.length)
})();



(async () => {
    let productGroups = await findAllProductGroups(ctx);
    fs.writeFileSync(`./storage/${ctx.market}/product_groups.json`, JSON.stringify(productGroups, null, 2))
    console.log(productGroups)
})();
