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
var irc_channels = require('./irc_channels.json');
var nconf = require('nconf');
var IRC = require('irc');

nconf.argv().env(['PORT', 'nick']);
nconf.file({ file: 'local.json' });
nconf.defaults({
    PORT: 3000,
    nick: 'vectorvictor',
    dev: false
});

var config = nconf.get();

var app = express();
var irc = new IRC.Client('irc.mozilla.org', config.nick, {
    secure: true,
    port: 6697,
    userName: config.nick,
    realName: 'New Relic IRC Notification Bot',
    channels: getIRCChannelsList()
});

// via https://github.com/mythmon/standup-irc/blob/master/standup-irc.js
// Connected to IRC server
irc.on('registered', function(message) {
    console.info('Connected to IRC server.');

    // Store the nickname assigned by the server
    config.realNick = message.args[0];
    console.info('Using nickname: ' + config.realNick);
});

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
});

/* Receive, parse, and handle messages from IRC.
 * - `user`: The nick of the user that send the message.
 * - `channel`: The channel the message was received in. Note, this might not be
 * a real channel, because it could be a PM. But this function ignores
 * those messages anyways.
 * - `message`: The text of the message sent.
 */
irc.on('message', function(user, channel, message){
    var pingRe = new RegExp('^' + config.realNick + '[:,]? +ping$', 'i');
    if (pingRe.test(message)) {
        irc.say(channel, user + ': roger roger.');
    }
});

app.use(express.bodyParser());

app.post('/', function(req, res) {
    var pingType = req.body.hasOwnProperty('alert') ? 'alert' : 'deployment';
    var data = JSON.parse(req.body[pingType]);
    tellIRC(pingType, data);
    res.send('Got it. Thanks.');
});

app.get('/', function(req, res) {
    res.send('Nothing to see here. Move along.');
});

function getIRCChannelsList() {
    var channels = [];
    if (config.dev) {
        channels.push(config.dev_channel);
    }
    for (var site in irc_channels) {
        irc_channels[site].channels.forEach(function(channel) {
            if (channels.indexOf(channel) === -1) {
                channels.push(channel)
            }
        })
    }
    return channels;
}

function tellIRC(pingType, data) {
    var irc_color = pingType === 'alert' ? 'light_red' : 'light_green';
    var notified = false;
    for (var app_name in irc_channels) {
        if (data.application_name.indexOf(app_name) !== -1 &&
                irc_channels[app_name].types.indexOf(pingType) !== -1) {
            notified = true;
            var message = IRC.colors.wrap(irc_color, 'NR ' + pingType.toUpperCase()) + ': ';
            if (data.description) {
                message += data.description;
            }
            else if (data.long_description) {
                message += data.long_description;
            }
            if (data.alert_url) {
                message += '. ' + data.alert_url;
            }
            if (config.dev) {
                irc.say(config.dev_channel, irc_channels[app_name].channels.toString() + ' ' + message);
            }
            else {
                irc_channels[app_name].channels.forEach(function(channel) {
                    irc.say(channel, message);
                });
            }

        }
    }
    if (!notified) {
        console.log('IGNORED: ' + data.application_name);
    }
}

if (!module.parent) {
    app.listen(config.PORT);
    console.log('Express server listening on port ' + config.PORT);
}
