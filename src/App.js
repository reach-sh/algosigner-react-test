import React from 'react';
import './App.css';
import AlgoSignerClient from './AlgoSignerClient';
import * as reach from './lib/ALGO';
import algosdk from 'algosdk';

const AlgoSigner = window.AlgoSigner;

class App extends React.Component {
  async doTheThing() {
    if (!AlgoSigner) {
      alert('Sorry, no AlgoSigner detected.');
      throw Error(`no AlgoSigner`);
    }

    AlgoSigner.connect();
    const ledger = 'TestNet';
    const c = new AlgoSignerClient(AlgoSigner, ledger, 'algod', {debug: true});
    const algodClient = new algosdk.Algodv2(c);

    const ic = new AlgoSignerClient(AlgoSigner, ledger, 'indexer');
    const indexer = new algosdk.Indexer(ic);

    const res = await algodClient.getTransactionParams().do()
    const params = JSON.stringify(res, undefined, 2);
    const res2 = await algodClient.compile('int 0').do();
    const compiled = JSON.stringify(res2, undefined, 2);
    this.setState({params, compiled});

    reach.setAlgodClient(algodClient);
    reach.setIndexer(indexer);
    const mnemonic_test1 = 'valley amazing tonight circle horse much exclude speak fog bomb jeans secret false legal other actor clerk smile egg identify rocket remind fire ability genius';
    const test1 = await reach.newAccountFromMnemonic(mnemonic_test1);
    console.log({acc: test1});

    const mnemonic_alice = 'april oblige hair cup vendor glove lazy stumble exclude fever milk badge select witness seat true cruise paddle weird visa oak retire elite able shy';
    const alice = await reach.newAccountFromMnemonic(mnemonic_alice);

    // XXX make AlgoSigner not an arg here.
    console.log('attempting to transfer...');
    await reach.transfer(test1, alice, reach.parseCurrency(22), AlgoSigner, ledger);
    console.log('...transfer successful');
    // const faucet = await reach.getFaucet();
    // console.log({faucet});
    // await reach.transfer(faucet, test1, reach.parseCurrency(101));

    const bal = await reach.balanceOf(test1);
    console.log(`balance:`)
    console.log(reach.formatCurrency(bal, 4));
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
