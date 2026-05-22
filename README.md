# Sol's Stat Tracker Feed
Connect to Sol's Stat Tracker to post global messages through one or more Discord webhooks.

## Setup
1. Download the latest release of [Sol's Stat Tracker Feed](https://github.com/solsstattracker/sols-stat-tracker-feed/releases) and unzip it.
2. Inside the unzipped folder, create a new file named `config.json`.
   > `config.json` is not included in the release because it holds your webhook URLs. You need to create it yourself by copying the template below.
3. Copy the template below into your new `config.json` file:
   ```json
   {
     "webhooks": [
       {
         "url": "PLACE YOUR WEBHOOK URL HERE",
         "active": true
       }
     ],
     "websocket": {
       "url": "wss://stream.solsstattracker.com/global-messages/embed",
       "initialReconnectDelayMillis": 1000,
       "maxReconnectDelayMillis": 30000
     }
   }
   ```
4. Create a Discord webhook and copy its URL.
5. In `config.json`, replace `PLACE YOUR WEBHOOK URL HERE` with the webhook URL you just copied. Make sure `"active"` stays set to `true`.
   > You can list multiple webhooks in the `webhooks` array. Only entries with `"active": true` will receive messages, so you can keep inactive webhooks in the file without having to delete them.
6. Install [Node.js](https://nodejs.org/en).
7. Open a terminal in the Sol's Stat Tracker Feed folder and run `npm install` to install the dependencies.
8. In the same terminal, run `npm start` to start  Sol's Stat Tracker Feed.
   > Sol's Stat Tracker Feed only sends webhook messages while the terminal stays open. If you close the terminal, the webhook messages stops being sent.
   >
   > If you'd rather not keep a terminal window open, we recommend running Sol's Stat Tracker Feed under [PM2](https://www.npmjs.com/package/pm2). PM2 is a Node.js process manager that runs your app in the background, restarts it if it crashes, and can launch it automatically on system startup (Windows, macOS, and Linux), so the relay keeps going even after you log out or reboot.

## For developers
If you want to the raw JSON data for global messages instead of pre-formatted Discord embeds, connect to the alternative `wss://stream.solsstattracker.com/global-messages/raw` endpoint.
