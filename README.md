# homebridge-open-sesame

Homebridge plugin for SESAME3.  

## Install

This plugin depends on [aws-iot-device-sdk-js-v2](https://github.com/aws/aws-iot-device-sdk-js-v2).  
Some libraries are required before install this plugin.  

_NOTE: Installing this plugin may take long on Raspberry Pi._

### Install the required libraries using apt

```
sudo apt-get install cmake
sudo apt-get install libssl-dev
```

### Install the required libraries using yum

```
sudo yum install cmake
sudo yum install openssl-devel
```

### Install plugin

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
          "name": "Sesame device name",
          "uuid": "UUID from Sesame.app",
          "secret": "Key Secret"
        }
      ],
      "updateInterval": 60
    }
  ]
}
```

- `updateInterval`: 鍵の状態の更新間隔(秒)

## Credits

- Cognito integration code based on [pysesame3](https://github.com/mochipon/pysesame3).
