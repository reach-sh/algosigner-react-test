import React from 'react';
import AppViews from './views/AppViews';
import DeployerViews from './views/DeployerViews';
import AttacherViews from './views/AttacherViews';
import {renderDOM, renderView} from './views/render';
import './index.css';
import * as backend from './build/index.main.mjs';
import * as reach from './lib/ALGO';

const handToInt = {'ROCK': 0, 'PAPER': 1, 'SCISSORS': 2};
const intToOutcome = ['Bob wins!', 'Draw!', 'Alice wins!'];
const {standardUnit} = reach;
const defaults = {defaultFundAmt: '10', defaultWager: '3', standardUnit};

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {view: 'ConnectAccount', ...defaults};
  }
  async componentDidMount() {
    // const addrAlice = '0x425425f9FF88Ec1759D012b37a878C885d064A55';
    // const addrBob = '0x39320aBE6dAE42d053bE46A4664f33a5aEa6E72B';

    const AlgoSigner = window.AlgoSigner;

    if (!AlgoSigner) {
      alert('Sorry, no AlgoSigner detected.');
      return;
      // throw Error(`no AlgoSigner`);
    }
    await AlgoSigner.connect();
    reach.setDEBUG(true);
    reach.setWaitPort(false);
    const ledger = 'Localhost';
    // const mnemonic_alice = 'april oblige hair cup vendor glove lazy stumble exclude fever milk badge select witness seat true cruise paddle weird visa oak retire elite able shy';
    const addrAlice = 'FG344FZMR5ZGHSJIPGB2XBMPZLSBZJFBQY63Z5FQ44VGZ44WK3OPBVN7ZI';
    const alice = await reach.newAccountFromAlgoSigner(addrAlice, AlgoSigner, ledger); //, mnemonic_alice);
    const addrBob = '574TXHFNAFMS7KPHCBJL6TVYXZCEXF6PVGA2GRB3SQO3HPCWDNW44VKJR4';
    const bob = await reach.newAccountFromAlgoSigner(addrBob, AlgoSigner, ledger);

    this.setState({addrAlice, addrBob, alice, bob});

    try {
      const faucet = await reach.getFaucet();
      this.setState({view: 'FundAccount', faucet});
    } catch (e) {
      this.setState({view: 'DeployerOrAttacher'});
    }
  }
  async fundAccount(fundAmount) {
    const {alice, bob, faucet} = this.state;
    const amt = reach.parseCurrency(fundAmount);
    await reach.transfer(faucet, alice, amt);
    await reach.transfer(faucet, bob,  amt);
    this.setState({view: 'DeployerOrAttacher'});
  }
  async skipFundAccount() { this.setState({view: 'DeployerOrAttacher'}); }
  async selectAttacher() {
    // XXX
    const acc = this.state.bob; // await reach.getDefaultAccount();
    this.setState({acc, view: 'Wrapper', ContentView: Attacher});
  }
  async selectDeployer() {
    // XXX
    const acc = this.state.alice; // await reach.getDefaultAccount();
    this.setState({acc, view: 'Wrapper', ContentView: Deployer});
  }
  render() { return renderView(this, AppViews); }
}

class Player extends React.Component {
  random() { return reach.hasRandom.random(); }
  async getHand() { // Fun([], UInt)
    const hand = await new Promise(resolveHandP => {
      this.setState({view: 'GetHand', playable: true, resolveHandP});
    });
    this.setState({view: 'WaitingForResults', hand});
    return handToInt[hand];
  }
  seeOutcome(i) { this.setState({view: 'Done', outcome: intToOutcome[i]}); }
  informTimeout() { this.setState({view: 'Timeout'}); }
  playHand(hand) { this.state.resolveHandP(hand); }
}

class Deployer extends Player {
  constructor(props) {
    super(props);
    this.state = {view: 'SetWager'};
  }
  setWager(wager) { this.setState({view: 'Deploy', wager}); }
  async deploy() {
    const ctc = this.props.acc.deploy(backend);
    this.setState({view: 'Deploying', ctc});
    this.wager = reach.parseCurrency(this.state.wager); // UInt
    backend.Alice(reach, ctc, this);
    const ctcInfoStr = JSON.stringify(await ctc.getInfo(), null, 2);
    this.setState({view: 'WaitingForAttacher', ctcInfoStr});
  }
  render() { return renderView(this, DeployerViews); }
}

class Attacher extends Player {
  constructor(props) {
    super(props);
    this.state = {view: 'Attach'};
  }
  attach(ctcInfoStr) {
    const ctc = this.props.acc.attach(backend, JSON.parse(ctcInfoStr));
    this.setState({view: 'Attaching'});
    backend.Bob(reach, ctc, this);
  }
  async acceptWager(wagerAtomic) { // Fun([UInt], Null)
    const wager = reach.formatCurrency(wagerAtomic, 4);
    return await new Promise(resolveAcceptedP => {
      this.setState({view: 'AcceptTerms', wager, resolveAcceptedP});
    });
  }
  termsAccepted() {
    this.state.resolveAcceptedP();
    this.setState({view: 'WaitingForTurn'});
  }
  render() { return renderView(this, AttacherViews); }
}

renderDOM(<App />);
