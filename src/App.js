import React from 'react';
import './App.css';
import AlgoSignerClient from './AlgoSignerClient';
import algosdk from 'algosdk';

const AlgoSigner = window.AlgoSigner;

class App extends React.Component {
  async doTheThing() {
    if (!AlgoSigner) {
      alert('Sorry, no AlgoSigner detected.');
      throw Error(`no AlgoSigner`);
    }

    AlgoSigner.connect();
    const c = new AlgoSignerClient(AlgoSigner, 'TestNet', 'algod', {debug: true});
    const algodClient = new algosdk.Algodv2(c);
    // const indexerClient = new AlgoSignerClient(AlgoSigner, 'TestNet', 'indexer');

    const res = await algodClient.getTransactionParams().do()
    const params = JSON.stringify(res, undefined, 2);
    const res2 = await algodClient.compile('int 0').do();
    const compiled = JSON.stringify(res2, undefined, 2);
    this.setState({params, compiled});
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
            onClick={() => this.doTheThing(this)}
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
