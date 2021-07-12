const alibaba = require('./alibaba')

let target_url = 'https://message.alibaba.com/message/default.htm';

async function run(ctx) {

}


exports.name = __filename.substring(__filename.lastIndexOf('\\') + 1);
exports.url = target_url;
exports.run = run;

/********************************************************************** */

return;

let ctx = {
    browser: undefined,
    page: undefined,
    occupied: false,
    market: 'tools',
    user: { name: "Jessica", id: "glittertools@glittergroupcn.com", pwd: "Songjianwei68970747" }

    // market: 'beauty',
    // user: { name: "Carrie", id: "eyelash@glittergroupcn.com", pwd: "Xujinna68970747" }
};

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
