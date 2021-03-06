/* REQUIREMENTS */
//////////////////
// Config
var config = require('../config/config.js'),
  secret = config.secret,
  domainSite = config.domainSite,
  domainMail = config.domainMail,
  // Express
  express = require('express'),
  router = express.Router(),
  // Models
  Mail = require('../models/email.js'), // Mail model
  User = require('../models/user.js'), // Mail model
  Transaction = require('../models/transaction.js'), // Transaction model
  // Coinbase
  fee = 1 / 2, //mailman keeps half of the money TODO find a better fee rate
  Client = require('coinbase').Client,
  client = new Client({
    'apiKey': config.coinbase.apiKey,
    'apiSecret': config.coinbase.apiSec,
    'baseApiUri': config.coinbase.apiUrl
  }),
  Account = require('coinbase').model.Account,
  btcAccount = new Account(client, {
    'id': config.coinbase.accId
  }),
  // Mailgun
  Mailgun = require('mailgun').Mailgun,
  mg = new Mailgun(config.mailgun.apiKey),

  // JSON Web Tokens
  jwt = require('jsonwebtoken'),

  // async
  async = require('async'),

  // Deposit Account
  depositAccount = "deposit", //that's 1337DEP
  withdrawalAccount = "withdrawal", //that's 1337WIT
  mailmanAccount = "mailman", //that's 1337COOL

  // Mailman
  mailmanAddressReg = new RegExp("mailman@"+ domainMail.replace(/\./g, "\\."), "ig");
  mailmanAddress = "mailman@" + domainMail;


module.exports = function(app, passport) {

  /* API ROUTES */

  //welcome to the api
  app.get('/api', function(req, res) {
    res.send('Welcome to the API');
  });

  // `/mailman`
  app.post('/api/mailman', function(req, res) {

    res.json({
      success: true,
      message: 'recieved an object'
    });

    console.log('mailman recieved an email'); //debug

    var payout = /payout/gi; // the word payout in regex
    var btcRegex = /[13][a-km-zA-HJ-NP-Z0-9]{26,33}/ig; // BTC addresses in Regex

    if (mailmanAddressReg.test(req.body.to) && payout.test(req.body.subject)) {
      // proceed if mailman was directly emailed
      // and the subject contained the word payout

      var payoutAddress = req.body['body-plain'].match(btcRegex)[0];
      // find the userId
      userIdbyEmail(email, function(userId) {

        // find the user's balance
        userBalance(userId, function(err, balance) {



        });
      });


    } else if (mailmanAddressReg.test(req.body.Cc)) {
      // proceed if mailman was CCed into the mail.

      console.log('Mailman was addressed in the CC field'); //debug



      // Regex expression to for "re:", "fw:" "fwd:", etc.
      var junkRegex = /([\[\(] *)?(RE|FWD?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/igm;
      var subjectStripped = req.body.subject.replace(junkRegex, "");

      console.log('the original subject was "' + req.body.subject + '"' +
        ' but Mailman stripped it to "' + subjectStripped + '"'); //debug

      Mail.findOne({
        'subjectStripped': subjectStripped
      }, function(err, mail) {
        if (err) {
          console.log(err);
        } else if (mail && (mail.to === req.body.From &&
            mail.from === req.body.To)) {
          // if the mail exists and is being sent back from the original sender
          console.log('Recieved confirmation of a reply from original ' +
            'recepient of mail: ' + mail.id); //debug

          User.findOne({
            'local.email': mail.to
          }, function(err, user) {
            if (err) {
              console.log(err);
            } else {

              rewardByMailId(mail.id, function(reward) {

                console.log("Mail " + mail.id + " has reward " + reward);

                userIdbyEmail(mail.to, function(err, userId) {
                  if (err) console.log(err);

                  // transfer the balance into the recepient's account
                  var rewardTransaction = {
                    "from": mailmanAccount,
                    "to": userId, // the recepient of the original mail
                    "amount": reward
                  };

                  transferBalance(rewardTransaction, function(err) {
                    if (err) console.log(err);

                    userBalance(userId, function(balance) {
//                      var payoutTransaction = {
//                        "to": mail.to.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]*/gi)[0],
//                        "amount": balance,
//                        "notes": "Your reward -Mailman"
//                      };

//                      btcAccount.sendMoney(payoutTransaction, function(err, txn) {
//                        if (err) console.log(err);
//                        console.log('my txn id is: ' + txn.id);
//                      });
                        console.log(balance);
                    });
                  });
                });

              });

              mg.sendText('Mailman <' + mailmanAddress + '>', [mail.to],
                'RE: ' + mail.subject,
                'Reply confirmed!\n' +
                'Wonderful, I\'ll deliver your reward in a just a moment',
                'noreply@' + domainMail + '', {},
                function(err) {
                  if (err) {
                    console.log('Saved mail ' + mail.id +
                      ' but unable to deliver invoice for mail ' +
                      mail.id + '\nerror: ' + err);
                  } else {
                    console.log('Saved mail ' + mail.id +
                      ' and sent reward mail');
                  }
                });

            }

          });
        } else if (!mail) {
          // if no such mail exists
          console.log('Mailman classified it as a new email'); //debug

          // save the metadata
          mail = new Mail();
          mail.type = "reward";
          mail.to = req.body.To;
          mail.recipient = req.body.recipient;
          mail.date = req.body.Date;
          mail.cc = req.body.Cc;
          mail.sender = req.body.sender;
          mail.from = req.body.from;
          mail.subject = req.body.subject;

          // check if the sender and reciever have accounts

          User.findOne({
            'local.email': mail.to.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]*/gi)[0]
          }, function(err, user) {
            if (err) console.log(err);
            if (user) {
              console.log(user.id);
            } else if (!user) {
              var newUser = new User();
              newUser.local.email = mail.to.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]*/gi)[0];
              newUser.save(
                console.log('Saving new user ' + newUser.id +
                  ' for email address ' + newUser.local.email)
              );
            }
          });

          User.findOne({
            'local.email': mail.from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]*/gi)[0]
          }, function(err, user) {
            if (err) console.log(err);
            if (user) {
              console.log(user.id);
            } else if (!user) {
              var newUser = new User();
              newUser.local.email = mail.from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]*/gi)[0];
              newUser.save(
                console.log('Saving new user ' + newUser.id +
                  ' for email address ' + newUser.local.email)
              );
            }
          });


          // strip all re, and fwd from subject before saving as the stripped subject
          mail.subjectStripped = req.body.subject.replace(junkRegex, "");

          //create the address

          var callbackToken = jwt.sign({
            'mail_id': mail.id,
          }, secret);

          btcAccount.createAddress({
            "callback_url": 'http://' + domainSite + '/api/payment/' +
              mail.id + '?token=' + callbackToken,
            "label": ""
          }, function(err, address) {
            if (err) {
              // output error and save mail
              console.log(err);
              mail.save(
                console.log("Couldn't create address, but saved mail")
              );
            } else {
              // save the address and save the mail
              console.log('Created address ' + address.address); //debug
              mail.btcAddress = address.address;
              mail.save(
                // send an invoice to the sender
                mg.sendText('Mailman <mailman@' + domainMail + '>', [mail.sender],
                  'RE: ' + mail.subject,
                  'Hi, pay the reward here: ' + mail.btcAddress,
                  'noreply@' + domainMail + '>', {},
                  function(err) {
                    if (err) {
                      console.log('Saved mail ' + mail.id +
                        ' but unable to deliver invoice for mail ' +
                        mail.id + '\nerror: ' + err);
                    } else {
                      console.log('Saved mail ' + mail.id +
                        ' and sent invoice for reward mail');
                    }
                  })
              );
            }

          });
        }
      });
    } else {
      console.log('mailman was not in the CC field');
    }
  });

  // When a callback is recieved for a payment made.
  // '/payment/:mail_id'
  app.post('/api/payment/:mail_id', function(req, res) {

    /* Example object to be recieved

      {
      "address": "1AmB4bxKGvozGcZnSSVJoM6Q56EBhzMiQ5",
      "amount": 1.23456,
      "transaction": {
        "hash": "7b95769dce68b9aa84e4aeda8d448e6cc17695a63cc2d361318eb0f6efdf8f82"
      }
    */
    console.log('Recieved a payment notification with the following token\n' +
      req.query.token); //debug


    jwt.verify(req.query.token, secret, function(err, decoded) {
      if (err) {
        console.log(err);
        console.log('the token was invalid'); //debug

        return res.status(403).json({
          success: false,
          message: 'Invalid token'
        });
      } else if (decoded.mail_id !== req.params.mail_id) {

        console.log('Token mismatch');
        console.log('Mail ID : ' + mail_id);
        console.log('Token ID : ' + decoded.mail_id);

        return res.status(403).json({
          success: false,
          message: 'Token mismatch'
        });

      } else if (decoded) {
        req.decoded = decoded;

        console.log('Token was valid');

        res.status(200).json({
          success: true,
          message: 'Payment acknowledged'
        });

        // find the mail with this id
        Mail.findById(req.params.mail_id, function(err, mail) {
          if (err) {
            console.log(err);
          } else {

            console.log('found mail: ' + mail.id + ' by sender ' + mail.sender); //debug

            //find the User
            User.findOne({
              "local.email": mail.sender
            }, function(err, user) {

              if (err) {
                console.log(err);
              }

              if (user) {
                console.log("Email belongs to user " + user.id);
              }

              // deposit the amount in the User's account
              var depositTransaction = {
                "from": depositAccount,
                "to": user.id,
                "amount": req.body.amount,
                "address": req.body.address,
                "tx": req.body.transaction.hash,
                "mailId": mail.id
              };

              transferBalance(depositTransaction, function(err, transaction) {
                if (err) {
                  console.log(err);
                } else {
                  // append the transaction.id to the mail
                  Mail.findByIdAndUpdate(mail._id, {
                      $push: {
                        'transaction': transaction.id
                      }
                    }, {
                      safe: true,
                      upsert: true
                    },
                    function(err, model) {
                      if (err) {
                        console.log(err);
                      }
                    }
                  );
                }
              });

              var mailmanTransaction = {
                "from": user.id,
                "to": mailmanAccount,
                "amount": req.body.amount,
                "mailId": mail.id
              };

              // transfer deposit to Mailman
              transferBalance(mailmanTransaction, function(err, transaction) {
                if (err) {
                  console.log(err);
                }
              });
            });


            //determine what sort of mail this was
            if (mail.type === 'reward') {
              var originalRecipient = mail.to;
              console.log("sending mail reward notification to " +
                originalRecipient);
              // mail the person saying there is a reward available

              mg.sendText('Mailman <mailman@' + domainMail + '>', [originalRecipient],
                'RE: ' + mail.subject,
                'Hi, there\'s a new ' + req.body.amount + ' BTC reward ' +
                'for replying to the email above.\n' +
                'Just keep me in the CC field so that I ' +
                'know you\'ve replied!',
                'noreply@' + domainMail + '', {},
                function(err) {
                  if (err) {
                    console.log(err + '\n' +
                      'Could not send reward notifcation for mail' + mail.id);
                  } else {
                    console.log('Success');
                  }
                });


              // if the mail is an incoming mail sent to a user
            } else if (mail.type === 'incoming') {

              // TODO the code below has yet to be checked
              // infact, i don't think i've added the relevent schema changes
              User.findOne({
                'local.username': mail.username
              }, function(err, user) {

                mg.sendText('Mailman <mailman@' + domainMail + '>', [mail.to],
                  'RE: ' + mail.subject,
                  'Hi, there\'s a ' + req.body.amount + ' BTC ' +
                  'reward on replying to this email.\n ' +
                  'Just keep `mailman@' + domainMail + '` in the CC field so ' +
                  'that I know you\'ve replied!',
                  'noreply@' + domainMail + '', {},
                  function(err) {
                    if (err) console.log('Unable to deliver invoice for mail ' +
                      mail.id + '\nerror: ' + err);
                    else console.log('Successfully sent reward notification');
                  });
              });

              // pay the recepient their share of the fee

            }
          }
        });
      }
    });
  });

  // new mail to specifc user
  app.post('/api/mail/:user_id', function(req, res) {
    console.log(req.body.lol);
    res.send(req.body['lol-hello']);

    var mail = new Mail();

    mail.type = "incoming";
    mail.incomingEmail = req.params.user.id;
    mail.to = req.body.to;
    mail.date = req.body.Date;
    mail.cc = req.body.Cc;
    mail.recipient = req.body.recipient;
    mail.sender = req.body.sender;
    mail.from = req.body.from;
    mail.subject = req.body.subject;
    mail.bodyPlain = req.body['body-plain'];
    mail.strippedText = req.body['stripped-text'];
    mail.strippedSignature = req.body['stripped-signature'];
    mail.bodyHtml = req.body['body-html'];
    mail.strippedHtml = req.body['stripped-html'];
    mail.attachmentCount = req.body['attachment-count'];
    mail.attachmentx = req.body['attachment-x'];
    mail.messageHeaders = req.body['message-headers'];
    mail.contentIdMap = req.body['content-id-map'];

    var callbackToken = jwt.sign({
      'mail_id': mail.id,
    }, secret);

    var addressArgs = {
      'callback_url': 'http://' + domainSite + '/api/payment/' + mail.id +
        '?token=' + callbackToken,
      'label': mail.id
    };

    btcAccount.createAddress(addressArgs, function(err, address) {
      if (err) {
        // output error and save mail
        console.log(err);
        mail.save();
      } else {
        // save the address and save the mail
        mail.btcAddress = address.address;
        mail.save();

        // send an invoice to the sender
        mg.sendText('Mailman <mailman@' + domainMail + '>', [mail.sender],
          'RE: ' + mail.subject,
          'Hi, your email will only be delivered if you pay for its delivery.\n' +
          'Please pay at this address: ' + mail.btcAddress,
          'noreply@' + domainMail + '', {},
          function(err) {
            if (err) console.log('Unable to deliver invoice for mail ' +
              mail.id + '\nerror: ' + err);
            else console.log('Success');
          });
      }
    });

  });

  // User authorization (login)
  app.post('/api/user/auth', passport.authenticate('local-login', {
    successRedirect: '/user', // redirect to the user
    failureRedirect: '/', // redirect back to the home page on error
    failureFlash: true // allow flash messages
  }));

  // User signup
  app.post('/api/user/new', passport.authenticate('local-signup', {
    successRedirect: '/profile', // redirect to the secure profile section
    failureRedirect: '/signup', // redirect back to the signup page if there is an error
    failureFlash: true // allow flash messages
  }));

  // User logout
  app.get('/api/user/logout', function(req, res) {
    req.logout();
    res.redirect('/');
  });

};

function transferBalance(transactionObject, acallback) {

  /*
  // dummy transactionObject
    demTrans = {
      "from" : 1,
      "to" : 2,
      "amount" : 2,
      "address": "thisIsNotAValidAddress",
      "tx" : "thisIsNotAValidTx"
      "mailId" : "thisIsNotAValidMailId"
    };

  */

  async.series([
      /*function(callback) {
          userBalance(transactionObject.from);
          userBalance(transactionObject.to);
          callback(null);
        },*/
      function(callback) {
        transaction = new Transaction();
        if (transactionObject.address) {
          transaction.address = transactionObject.address;
        }
        if (transactionObject.tx) {
          transaction.tx = transactionObject.tx;
        }
        if (transactionObject.mailId) {
          transaction.mailId = transactionObject.mailId;
        }
        transaction.debitAccount = transactionObject.from; // with reference to the reciever
        transaction.creditAccount = transactionObject.to; // in the account of the sender
        transaction.amount = transactionObject.amount; // of the given amount
        transaction.save(function(err, transaction) {
          callback(err, transaction);
        });
      },
      function(callback) {
        console.log("Credited User " + transactionObject.to +
          " and debited User " + transactionObject.from + " by amount " +
          transaction.amount + " BTC");
        callback(null);
      }
      /*,
            function(callback) {
              userBalance(transactionObject.from);
              userBalance(transactionObject.to);
              callback(null);
            }*/
    ],
    acallback
  );
}

function rewardByMailId(mailId, callback) {
  Transaction.aggregate()
    .match({
      "$and": [{
        "mailId": mailId
      }, {
        "$or": [{
          "debitAccount": mailmanAccount
        }, {
          "creditAccount": mailmanAccount
        }]
      }]
    })

  .project({
      "balance": {
        "$cond": [{
            "$eq": ["$debitAccount", mailmanAccount]
          }, {
            "$multiply": [-1, "$amount"]
          },
          "$amount"
        ]
      }
    })
    .group({
      "_id": mailId,
      "total": {
        "$sum": "$balance"
      }
    })
    .exec(function(err, object) {
      if (err) console.log(err);
      callback(object[0].total);
    });
}

function userBalance(user, callback) {
  Transaction.aggregate()
    .match({
      "$or": [{
        "debitAccount": user
      }, {
        "creditAccount": user
      }]
    })
    .project({
      "balance": {
        "$cond": [{
            "$eq": ["$debitAccount", user]
          }, {
            "$multiply": [-1, "$amount"]
          },
          "$amount"
        ]
      }
    })
    .group({
      "_id": user,
      "total": {
        "$sum": "$balance"
      }
    })
    .exec(function(err, object) {
      if (err) console.log(err);
      callback(object[0].total);
    });
}

function userIdbyEmail(email, callback) {
  var emailAddress = email.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]*/gi);
  User.findOne({
    'local.email': emailAddress
  }, function(err, user) {
    if (err) console.log(err);
    callback(user.id);
  });
}
