# New Relic to IRC notifier

Notify of New Relic events via their webhooks and IRC.

## Installation

Clone the repo then:

1. `npm install`
2. `cp local.json-dist local.json`
3. edit local.json with your own values.
4. `node app.js`

For my fellow mozillians, all you really need to do is send me a PR with edits
to `irc_channels.json`. The setup on our New Relic account is already done.

`irc_channels.json` is a mapping of a string to a list of IRC channels. For example:

```json
{
    "www.mozilla.org": {
        "channels": ["#www"],
        "types": ["alert", "deployment"]
    }
}
```

That tells the bot to look for posts from New Relic with an application name that
includes the string (e.g. "www.mozilla.org-python"), and to send the info to #www
if the type of message is an "alert" or a "deployment".

The bot's name by default is `vectorvictor`, and he'll join any room in any
`channels` list in this file.
