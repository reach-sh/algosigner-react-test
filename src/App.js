import React from 'react';
import './App.css';
// import AlgoSignerClient from './AlgoSignerClient';
// import algosdk from 'algosdk';
import * as reach from './lib/ALGO';
import * as backend from './build/index.main.mjs';

const AlgoSigner = window.AlgoSigner;

let didMutateWaitPort = false;

class App extends React.Component {
  async doTheThing() {
    if (!AlgoSigner) {
      alert('Sorry, no AlgoSigner detected.');
      return;
      // throw Error(`no AlgoSigner`);
    }

    await AlgoSigner.connect();
    // const ledger = 'TestNet';
    // const c = new AlgoSignerClient(AlgoSigner, ledger, 'algod', {debug: true});
    // const algodClient = new algosdk.Algodv2(c);
    // const token = {'X-API-Key': 'REDACTED'};
    // const baseServer = 'https://testnet-algorand.api.purestake.io/ps2';
    // const port = '';
    // const algodClient = new algosdk.Algodv2(token, baseServer, port);

    // const baseServerI = 'https://testnet-algorand.api.purestake.io/idx2';
    // const portI = '';
    // const indexer = new algosdk.Indexer(token, baseServerI, portI);
    // const ic = new AlgoSignerClient(AlgoSigner, ledger, 'indexer');
    // const indexer = new algosdk.Indexer(ic);

    // const res = await algodClient.getTransactionParams().do()
    // const params = JSON.stringify(res, undefined, 2);
    // const res2 = await algodClient.compile('int 0').do();
    // const compiled = JSON.stringify(res2, undefined, 2);
    // this.setState({params, compiled});

    // reach.setAlgodClient(algodClient);
    // reach.setIndexer(indexer);
    reach.setDEBUG(true);
    if (!didMutateWaitPort) {
      reach.setWaitPort(false);
      didMutateWaitPort = true;
    }
    const ledger = 'Localhost';

    // const mnemonic_test1 = 'valley amazing tonight circle horse much exclude speak fog bomb jeans secret false legal other actor clerk smile egg identify rocket remind fire ability genius';
    // const test1 = await reach.newAccountFromMnemonic(mnemonic_test1);
    // console.log({acc: test1});

    const addr_alice = 'FG344FZMR5ZGHSJIPGB2XBMPZLSBZJFBQY63Z5FQ44VGZ44WK3OPBVN7ZI';
    const mnemonic_alice = 'april oblige hair cup vendor glove lazy stumble exclude fever milk badge select witness seat true cruise paddle weird visa oak retire elite able shy';
    const alice = await reach.newAccountFromAlgoSigner(addr_alice, AlgoSigner, ledger, mnemonic_alice);
    // const alice = await reach.newAccountFromMnemonic(mnemonic_alice);

    const mnemonic_bob = 'night salon gesture claw thing marine route dust bubble stand hungry morning teach section bulk daughter taste guide health gasp secret swap leave able marble';
    const bob = await reach.newAccountFromMnemonic(mnemonic_bob);

    // XXX make AlgoSigner not an arg here.
    // console.log('attempting to transfer...');
    // await reach.transfer(test1, alice, reach.parseCurrency(22), AlgoSigner, ledger);
    // console.log('...transfer successful');
    const faucet = await reach.getFaucet();
    console.log({faucet});
    console.log('attempting to transfer...');
    await reach.transfer(faucet, alice, reach.parseCurrency(101));
    await reach.transfer(faucet, bob, reach.parseCurrency(101));
    // await reach.transfer(faucet, alice, reach.parseCurrency(101), AlgoSigner, ledger);
    // await reach.transfer(faucet, bob, reach.parseCurrency(101), AlgoSigner, ledger);
    console.log('...transfer successful');

    const bal_a = await reach.balanceOf(alice);
    const bal_b = await reach.balanceOf(bob);
    console.log(`balance:`)
    console.log(reach.formatCurrency(bal_a, 4));
    console.log(reach.formatCurrency(bal_b, 4));

    console.log(`deploying...`);
    const ctcAlice = alice.deploy(backend);
    console.log(`attaching...`)
    const ctcBob = bob.attach(backend, ctcAlice.getInfo());
    console.log(`running...`)
    await Promise.all([
      backend.Alice(reach, ctcAlice, {
        request: reach.parseCurrency(2),
        info: 'the cake is a lie',
      }),
      backend.Bob(reach, ctcBob, {
        want: (req) => console.log(`Alice wants ${reach.formatCurrency(req, 4)}`),
        got: (info) => console.log(`Alice's secret was: ${info}`),
      }),
    ])
    console.log(`...done`);
  }
  render() {
    const {
      params = '<<awaiting params>>',
      compiled = '<<awaiting compilation>>',
    } = this.state || {};
    return (
      <div className="App">
        <header className="App-header">
          The page.
          <button
            onClick={() => this.doTheThing()}
          >Do the thing</button>
          <p>
            Transaction params:
          </p>
          <pre style={{fontSize: '14px'}}>{params}</pre>
          <p>
            Compiled code:
          </p>
          <pre style={{fontSize: '14px'}}>{compiled}</pre>
        </header>
      </div>
    );
  }
}

export default App;
