<p align="center">
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

<span align="center">

# homebridge-open-sesame

[![GitHub Release](https://flat.badgen.net/github/release/yasuoza/homebridge-open-sesame/master?icon=github)](https://github.com/yasuoza/homebridge-open-sesame/releases) [![npm Release](https://flat.badgen.net/npm/v/homebridge-open-sesame?icon=npm)](https://www.npmjs.com/package/homebridge-open-sesame)

[![Lint & Build](https://flat.badgen.net/github/checks/yasuoza/homebridge-open-sesame?icon=github&label=lint%20%26%20build)](https://github.com/yasuoza/homebridge-open-sesame/actions) [![npm Download Total](https://flat.badgen.net/npm/dt/homebridge-open-sesame?icon=npm)](https://www.npmjs.com/package/homebridge-open-sesame)

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for SESAME3 and SESAME BOT.

</span>

## Features

- Real time status update support(even when manual lock/unlock).
- No status polling(`Limit Exceeded` avoidance)
- SESAME bot support.

## Install

```
npm install -g homebridge-open-sesame
```

## Configuration

### Configure with UI

Configure with [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x#readme) is recommended.

![config-ui](images/config-ui.png)

### Configure with config.json

```json
{
  "platforms": [
    {
      "platform": "OpenSesame",
      "name": "Open Sesame",
      "apiKey": "API_KEY from candyhouse developer site",
      "clientID": "CLIENT_ID from candyhouse developer site",
      "locks": [
        {
          "name": "SESAME3 name",
          "uuid": "UUID from Sesame.app",
          "secret": "Key Secret"
        }
      ],
      "bots": [
        {
          "name": "SESAME BOT name",
          "uuid": "UUID from Sesame.app",
          "secret": "Key Secret"
        }
      ]
    }
  ]
}
```

## Credits

- Cognito integration code based on [pysesame3](https://github.com/mochipon/pysesame3).
