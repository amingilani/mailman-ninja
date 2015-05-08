/* REQUIREMENTS */
//////////////////
// Config
var config = require('../config/config.js'),
  secret = config.secret,
  // Express
  express = require('express'),
  router = express.Router(),
  // Models
  Mail = require('../models/email.js'), // Mail model
  Transaction = require('../models/transaction.js'), // Transaction model
  // Coinbase
  Client = require('coinbase').Client,
  client = new Client({
    'apiKey': config.coinbase.testnet.key,
    'apiSecret': config.coinbase.testnet.secret,
    'baseApiUri': 'https://api.sandbox.coinbase.com/v1/'
  }),
  Account = require('coinbase').model.Account,
  btcAccount = new Account(client, {
    'id': '55335c04fb9854796c00000c'
  }),
  // Mailgun
  Mailgun = require('mailgun').Mailgun,
  mg = new Mailgun(config.mailgun),

  // JSON Web Tokens
  jwt = require('jsonwebtoken');


module.exports = function(app, passport) {

  /* API ROUTES */

  //welcome to the api
  app.get('/api', function(req, res) {
    res.send('Welcome to the API');
  });

  // `/mailman`
  app.post('/api/mailman', function(req, res) {

    res.json({
      success : true,
      message : 'recieved an object'
    });

    console.log('mailman recieved the following email'); //debug
    console.log(req.body); //debug

    var mailmanAddress = /\bmailman@mailman\.ninja\b/i; // mailman's email address in regex

    if ( mailmanAddress.test(req.body.Cc)) {
      // proceed if mailman was CCed into the mail.

      console.log('Mailman was addressed in the CC field'); //debug

      console.log('the original subject was ' + req.body.subject); //debug

      // Regex expression to for "re:", "fw:" "fwd:", etc.
      var junkRegex = /([\[\(] *)?(RE|FWD?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/igm;
      var subjectStripped = req.body.subject.replace(junkRegex, "");

      console.log('Mailman stripped the subject to ' + subjectStripped); //debug

      Mail.findOne({
        'subjectStripped' : subjectStripped
      }, function(err, mail) {
        if (err) {
          console.log(err);
        } else if (mail && (mail.to === req.body.from &&
            mail.from === req.body.to)) {
          // if the mail exists and is being sent back from the original sender
          console.log('Recieved confirmation of a reply from original sender for mail:' + mail.id); //debug

          // TODO pay the recepient
          // LOTSA CODE


        } else if (!mail) {
          // if no such mail exists
          console.log('Mailman classified it as a new email'); //debug

          // save the metadata
          mail = new Mail();
          mail.type = "reward";
          mail.to = req.body.to;
          mail.date = req.body.Date;
          mail.cc = req.body.Cc;
          mail.sender = req.body.sender;
          mail.from = req.body.from;
          mail.subject = req.body.subject;

          // strip all re, and fwd from subject before saving as the stripped subject
          mail.subjectStripped = req.body.subject.replace(junkRegex, "");

          //create the address

          var callbackToken = jwt.sign({
            'mail_id': mail.id,
          }, secret);

          btcAccount.createAddress({
            "callback_url": 'http://the.mailman.ninja/api/payment/' +
            mail.id + '?token=' + callbackToken,
            "label": ""
          }, function(err, address) {
            if (err) {
              // output error and save mail
              console.log(err);
              mail.save();
            } else {
              // save the address and save the mail
              console.log('Created address' + address.address); //debug
              mail.btcAddress = address.address;
              mail.save(
                console.log('New mail saved') //debug
              );

              // send an invoice to the sender
              mg.sendText('Mailman <mailman@mailman.ninja>', [mail.sender],
                'RE: ' + mail.subject,
                'Hi, pay the reward here: ' + mail.btcAddress,
                'noreply@mailman.ninja', {},
                function(err) {
                  if (err) {
                    console.log('Unable to deliver invoice for mail ' +
                      mail.id + '\nerror: ' + err);
                  } else {
                    console.log('sent invoice for reward mail');
                  }
                });
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
    console.log('Recieved a payment notification with the following token'); //debug
    console.log(req.query.token); //debug


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

            console.log('found mail: ' + mail.id); //debug

            // save the callback object in the db
            // save the transaction
            var transaction = new Transaction();
            transaction.address = req.body.address;
            transaction.amount = req.body.amount;
            transaction.tx = req.body.transaction.hash;
            transaction.save(
              // append the transaction to the mail
              Mail.findByIdAndUpdate(mail._id, {
                  $push: {
                    'transaction': transaction
                  }
                }, {
                  safe: true,
                  upsert: true
                },
                function(err, model) {
                  console.log(err);
                }
              )
            );

            //determine what sort of mail this was
            if (mail.type === 'reward') {
              var originalRecipient = mail.to;
              console.log("sending mail reward notification to " + originalRecipient);
              // mail the person saying there is a reward available
              mg.sendText('Mailman <mailman@mailman.ninja>', [originalRecipient],
                'RE: ' + mail.subject,
                'Hi, there\'s a ' + req.body.amount + ' BTC ' +
                'reward on replying to this email.\n ' +
                'Just keep `mailman@mailman.ninja` in the CC field so that I ' +
                'know you\'ve replied!',
                'noreply@mailman.ninja', {},
                function(err) {
                  if (err) {
                    console.log(err + '\n' +
                      'Could not send reward notifcation for mail' + mail.id );
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

                mg.sendText('Mailman <mailman@mailman.ninja>', [mail.to],
                  'RE: ' + mail.subject,
                  'Hi, there\'s a ' + req.body.amount + ' BTC ' +
                  'reward on replying to this email.\n ' +
                  'Just keep `mailman@mailman.ninja` in the CC field so that I ' +
                  'know you\'ve replied!',
                  'noreply@mailman.ninja', {},
                  function(err) {
                    if (err) console.log('Unable to deliver invoice for mail ' +
                      mail.id + '\nerror: ' + err);
                    else console.log('Success');
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
      'callback_url': 'http://the.mailman.ninja/api/payment/' + mail.id +
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
        mg.sendText('Mailman <mailman@mailman.ninja>', [mail.sender],
          'RE: ' + mail.subject,
          'Hi, your email will only be delivered if you pay for its delivery.\n' +
          'Please pay at this address: ' + mail.btcAddress,
          'noreply@mailman.ninja', {},
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
