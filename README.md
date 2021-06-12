# homebridge-open-sesame

Homebridge plugin for SESAME3.  

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
      "name": "Open Sesame",
      "apiKey": "Api key from candyhouse developer site",
      "locks": [
        {
          "name": "Sesame device name",
          "uuid": "UUID from Sesame.app",
          "secret": "Key Secret"
        }
      ],
      "updateInterval": 60,
      "platform": "OpenSesame"
    }
  ]
}
```

- `updateInterval`: 鍵の状態の更新間隔(秒)
