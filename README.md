Do the following things:

## Run the dev server & algorand-devnet (incl. local proxy)

In the `src` folder:

```
REACH_CONNECTOR_MODE=ALGO reach react
```

## Install our fork of AlgoSigner

Get our fork:

```
git clone https://github.com/reach-sh/algosigner
cd algosigner
git checkout localhost-3
```

(The following is simply abridged from the algosigner readme:)

Build it:

```
## XXX: using compiler from reach-lang commit 9313608b2b53db55fff0670c6ad1daf25a5bdee7

npm install    # only needed the first time
(cd src && ../reach compile) # whenever you change the .rsh
npm run build  # any time you rebuild
```

Install it:

First time:

* chrome://extensions
* toggle on "Developer mode"
* Click "Load unpacked"

On rebuild:

* just click the little refresh arrow after you've done `npm run build`


## Add Alice's account to AlgoSigner

See App.js for Alice's mnemonic.

* Click the AlgoSigner extension, click the top-right dropdown, select Localhost.
* Click Add account & add Alice's account by mnemonic


## Do the thing, in the browser

Open http://localhost:3000 in Chrome w/ AlgoSigner installed

Open the console, click the button, watch it go & sign the things.

If it says "no AlgoSigner" just try again.
