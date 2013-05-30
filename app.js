'use strict';

var express = require('express');
var irc_channels = require('./irc_channels.json');
var ircb = require('ircb');

var config = {
    port: process.env.PORT || 3000
};

var app = express();
var irc = ircb({
    host: 'irc.mozilla.org',
    secure: true,
    nick: 'vectorvictor',
    username: 'vectorvictor',
    realName: 'New Relic IRC Notification Bot',
    channels: getIRCChannelsList()
});

app.use(express.bodyParser());

app.post('/', function(req, res) {
    var pingType = req.body.hasOwnProperty('alert') ? 'alert' : 'deployment';
    var data = JSON.parse(req.body[pingType]);
    tellIRC(data);
    res.send('Got it. Thanks.');
});

app.get('/', function(req, res) {
    res.send('Nothing to see here. Move along.');
});

function getIRCChannelsList() {
    var channels = ['#pmac-bot-test'];
    for (var site in irc_channels) {
        irc_channels[site].channels.forEach(function(channel) {
            if (channels.indexOf(channel) === -1) {
                channels.push(channel)
            }
        })
    }
    return channels;
}

function tellIRC(data) {
    for (var name_re in irc_channels) {
        var name_rex = new RegExp(name_re);
        if (name_rex.test(data.application_name)) {
            var message = '';
            if (data.description) {
                message += data.description;
            }
            else if (data.long_description) {
                message += data.long_description;
            }
            if (data.alert_url) {
                message += ': ' + data.alert_url;
            }
            irc_channels[name_re].channels.forEach(function(channel) {
                irc.say(channel, message);
            });
        }
        else {
            console.log('IGNORED: ' + data.application_name);
        }
    }
}

if (!module.parent) {
    app.listen(config.port);
    console.log('Express server listening on port ' + config.port);
}
