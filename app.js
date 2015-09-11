/**
 *  Copyright 2013 Paul McLanahan
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var irc_channels = require('./irc_channels.json');
var nconf = require('nconf');
var IRC = require('irc');

nconf.defaults({
    PORT: 5000,
    nick: 'vectorvictor',
    dev: false
});
nconf.argv().env();

var config = nconf.get();

var app = express();
var irc = new IRC.Client('irc.mozilla.org', config.nick, {
    secure: true,
    port: 6697,
    userName: config.nick,
    realName: 'New Relic IRC Notification Bot',
    channels: getIRCChannelsList()
});
var mccroskey = [
  'sniffing glue',
  'smoking',
  'drinking',
  'amphetamines'
];
var app_channels = irc_channels['apps'];

function getMcCroskey() {
  var vice = mccroskey[Math.floor(Math.random() * mccroskey.length)];
  return 'Looks like I picked the wrong week to quit ' + vice + '!';
}

// via https://github.com/mythmon/standup-irc/blob/master/standup-irc.js
// Connected to IRC server
irc.on('registered', function(message) {
    console.info('Connected to IRC server.');

    // Store the nickname assigned by the server
    config.realNick = message.args[0];
    console.info('Using nickname: ' + config.realNick);
});

if (config.log_channel) {
    irc.on('join' + config.log_channel, function(nick, message){
        if (nick == config.realNick) {
            irc.say(config.log_channel, getMcCroskey());
        }
    });
}

// via https://github.com/mythmon/standup-irc/blob/master/standup-irc.js
// Handle errors by dumping them to logging.
irc.on('error', function(error) {
    // Error 421 comes up a lot on Mozilla servers, but isn't a problem.
    if (error.rawCommand !== '421') {
        return;
    }

    console.error(error);
    if (error.hasOwnProperty('stack')) {
        console.error(error.stack);
    }
    if (config.log_channel) {
        irc.say(config.log_channel, error);
    }
});

// React to users quitting the IRC server
irc.on('quit', function(user) {
    if (user == config.nick) {
        irc.send('NICK', config.nick);
    }
});

/* Receive, parse, and handle messages from IRC.
 * - `user`: The nick of the user that send the message.
 * - `channel`: The channel the message was received in. Note, this might not be
 * a real channel, because it could be a PM. But this function ignores
 * those messages anyways.
 * - `message`: The text of the message sent.
 */
irc.on('message', function(user, channel, message){
    var cmdRe = new RegExp('^' + config.realNick + '[:,]? +(.*)$', 'i');
    var match = cmdRe.exec(message);
    if (match) {
        var cmd = match[1].trim();
        switch (cmd) {
            case 'ping':
                irc.say(channel, user + ': roger roger');
                break;
            case 'help':
                irc.say(channel, user + ': see https://github.com/pmclanahan/newrelic-irc-notify#readme');
                break;
            default:
                irc.say(channel, user + ': ' + getMcCroskey());
        }

    }
});

app.use(bodyParser.urlencoded({extended: false}));

app.post('/', function(req, res) {
    var pingType = req.body.hasOwnProperty('alert') ? 'alert' : 'deployment';
    var data = JSON.parse(req.body[pingType]);
    tellIRC(pingType, data);
    res.send('<html><body><p>Got it. Thanks.</p></body></html>');
});

app.get('/', function(req, res) {
    res.send('<html><body><p>See <a href="https://github.com/pmclanahan/newrelic-irc-notify#readme">New Relic IRC Notify</a> for details.</p></body></html>');
});

function getIRCChannelsList() {
    var channels = [];
    if (config.dev) {
        channels.push(config.dev_channel);
    }
    else if (config.log_channel) {
        channels.push(config.log_channel);
    }
    for (var site in app_channels) {
        app_channels[site].channels.forEach(function(channel) {
            if (channels.indexOf(channel) === -1) {
                channels.push(channel);
            }
        })
    }
    channels = channels.concat(irc_channels['everything']);
    return channels;
}

function tellIRC(pingType, data) {
    var irc_color = pingType === 'alert' ? 'light_red' : 'light_green';
    var notified = false;
    var application_name = data.application_name;
    var description = data.long_description || data.short_description || data.description;
    if (application_name === undefined) {
        var re = /Apps currently involved:\s+([a-z0-9-_.]+)/i;
        var matches = re.exec(description);
        if (matches) {
            application_name = matches[1];
        }
    }
    if (application_name !== undefined) {
        for (var app_name in app_channels) {
            if (application_name.indexOf(app_name) !== -1 &&
                    app_channels[app_name].types.indexOf(pingType) !== -1) {
                notified = true;
                var message = IRC.colors.wrap(irc_color, 'NR_' + pingType.toUpperCase()) + ': ';
                if (pingType === 'deployment') {
                    message += '[' + application_name + '] ';
                }
                message += description;
                if (data[pingType + '_url']) {
                    message += '. ' + data[pingType + '_url'];
                }
                if (config.dev) {
                    irc.say(config.dev_channel, app_channels[app_name].channels.toString() + ' ' + message);
                }
                else {
                    app_channels[app_name].channels.forEach(function(channel) {
                        irc.say(channel, message);
                    });
                }

            }
        }
    }
    if (!notified) {
        var message = 'IGNORED: [' + application_name + '] ' + description;
        console.log(message);
        if (config.log_channel) {
            irc.say(config.log_channel, message);
        }
    }
    // tell the everything channels everything
    irc_channels['everything'].forEach(function (channel) {
        irc.say(channel, description);
    });
}

if (!module.parent) {
    app.listen(config.PORT);
    console.log('Express server listening on port ' + config.PORT);
}
