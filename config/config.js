var config = {};

// Mailman config
config.production = process.env.production === 'true'; //exists here only for
// reference hardcoded in template is the `process.env.production` variable
config.secret = process.env.secret;
config.domainSite = process.env.domainsite; // e.g. the.mailman.ninja
// for http://the.mailman.ninja/
config.domainMail = process.env.domainmail; // e.g. mailman.ninja
// for mailman@mailman.ninja

// Mailgun config
config.mailgun = {};
config.mailgun.apiKey = process.env.mailgun_api_key;

// Coinbase config
config.coinbase = {};
config.coinbase.accId = process.env.coinbase_acc_id;
config.coinbase.apiKey = process.env.coinbase_api_key;
config.coinbase.apiSec = process.env.coinbase_api_secret;
config.coinbase.apiUrl = process.env.coinbase_api_url;

// DB config
config.db = {};
config.db.host = process.env.db_host;
config.db.pass = process.env.db_pass;
config.db.user = process.env.db_user;
config.db.url = function () {
            return "mongodb://" + this.user + ":" + this.pass + "@" + this.host;
          };

module.exports = config;
