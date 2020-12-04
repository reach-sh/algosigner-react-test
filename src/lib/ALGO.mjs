// XXX: do not import any types from algosdk; instead copy/paste them below
// XXX: can stop doing this workaround once @types/algosdk is shippable
import algosdk, { makeKeyRegistrationTxnWithSuggestedParams } from 'algosdk';
import msgpack from '@msgpack/msgpack';
import algosdk__src__transaction from 'algosdk/src/transaction';
import base32 from 'hi-base32';
import ethers from 'ethers';
import url from 'url';
import Timeout from 'await-timeout';
import { debug, getDEBUG, isBigNumber, bigNumberify, mkAddressEq, makeDigest, argsSlice, makeRandom } from './shared.mjs';
import * as CBR from './CBR.mjs';
import waitPort from 'wait-port';
import { labelMaps, replaceableThunk } from './shared_impl.mjs';
import buffer from 'buffer';
const {Buffer} = buffer;
export * from './shared.mjs';
const BigNumber = ethers.BigNumber;
export const UInt_max = BigNumber.from(2).pow(64).sub(1);
export const { randomUInt, hasRandom } = makeRandom(8);
export const digest = makeDigest((t, v) => t.toNet(v));
export const T_Null = {
  ...CBR.BT_Null,
  netSize: 0,
  toNet: (bv) => (void(bv), new Uint8Array([])),
  fromNet: (nv) => (void(nv), null),
};
export const T_Bool = {
  ...CBR.BT_Bool,
  netSize: 1,
  toNet: (bv) => new Uint8Array([bv ? 1 : 0]),
  fromNet: (nv) => nv[0] == 1,
};
export const T_UInt = {
  ...CBR.BT_UInt,
  netSize: 8,
  toNet: (bv) => (ethers.utils.zeroPad(ethers.utils.arrayify(bv), 8)),
  fromNet: (nv) => {
    // debug(`fromNet: UInt`);
    // if (getDEBUG()) console.log(nv);
    return ethers.BigNumber.from(nv);
  },
};
/** @description For arbitrary utf8 strings */
const stringyNet = {
  toNet: (bv) => (ethers.utils.toUtf8Bytes(bv)),
  fromNet: (nv) => (ethers.utils.toUtf8String(nv)),
};
/** @description For hex strings representing bytes */
const bytestringyNet = {
  toNet: (bv) => (ethers.utils.arrayify(bv)),
  fromNet: (nv) => (ethers.utils.hexlify(nv)),
};
export const T_Bytes = (len) => ({
  ...CBR.BT_Bytes(len),
  ...stringyNet,
  netSize: len,
});
export const T_Digest = {
  ...CBR.BT_Digest,
  ...bytestringyNet,
  netSize: 32,
};

function addressUnwrapper(x) {
  return (x && x.addr) ?
    '0x' + Buffer.from(algosdk.decodeAddress(x.addr).publicKey).toString('hex') :
    x;
}
export const T_Address = {
  ...CBR.BT_Address,
  ...bytestringyNet,
  netSize: 32,
  canonicalize: (uv) => {
    const val = addressUnwrapper(uv);
    return CBR.BT_Address.canonicalize(val || uv);
  },
};
export const T_Array = (co, size) => ({
  ...CBR.BT_Array(co, size),
  netSize: size * co.netSize,
  toNet: (bv) => {
    return ethers.utils.concat(bv.map((v) => co.toNet(v)));
  },
  fromNet: (nv) => {
    const chunks = new Array(size).fill(null);
    let rest = nv;
    for (const i in chunks) {
      chunks[i] = co.fromNet(rest.slice(0, co.netSize));
      rest = rest.slice(co.netSize);
    }
    // TODO: assert size of nv/rest is correct?
    return chunks;
  },
});
export const T_Tuple = (cos) => ({
  ...CBR.BT_Tuple(cos),
  netSize: (cos.reduce((acc, co) => acc + co.netSize, 0)),
  toNet: (bv) => {
    const val = cos.map((co, i) => co.toNet(bv[i]));
    return ethers.utils.concat(val);
  },
  // TODO: share more code w/ T_Array.fromNet
  fromNet: (nv) => {
    const chunks = new Array(cos.length).fill(null);
    let rest = nv;
    for (const i in cos) {
      const co = cos[i];
      chunks[i] = co.fromNet(rest.slice(0, co.netSize));
      rest = rest.slice(co.netSize);
    }
    return chunks;
  },
});
export const T_Object = (coMap) => {
  const cos = Object.values(coMap);
  const netSize = cos.reduce((acc, co) => acc + co.netSize, 0);
  const { ascLabels } = labelMaps(coMap);
  return {
    ...CBR.BT_Object(coMap),
    netSize,
    toNet: (bv) => {
      const chunks = ascLabels.map((label) => coMap[label].toNet(bv[label]));
      return ethers.utils.concat(chunks);
    },
    // TODO: share more code w/ T_Array.fromNet and T_Tuple.fromNet
    fromNet: (nv) => {
      const obj = {};
      let rest = nv;
      for (const iStr in ascLabels) {
        const i = parseInt(iStr);
        const label = ascLabels[i];
        const co = coMap[label];
        obj[label] = co.fromNet(rest.slice(0, co.netSize));
        rest = rest.slice(co.netSize);
      }
      return obj;
    },
  };
};
// 1 byte for the label
// the rest right-padded with zeroes
// up to the size of the largest variant
export const T_Data = (coMap) => {
  const cos = Object.values(coMap);
  const valSize = Math.max(...cos.map((co) => co.netSize));
  const netSize = valSize + 1;
  const { ascLabels, labelMap } = labelMaps(coMap);
  return {
    ...CBR.BT_Data(coMap),
    netSize,
    toNet: ([label, val]) => {
      const i = labelMap[label];
      const lab_nv = new Uint8Array([i]);
      const val_co = coMap[label];
      const val_nv = val_co.toNet(val);
      const padding = new Uint8Array(valSize - val_nv.length);
      return ethers.utils.concat([lab_nv, val_nv, padding]);
    },
    fromNet: (nv) => {
      const i = nv[0];
      const label = ascLabels[i];
      const val_co = coMap[label];
      const rest = nv.slice(1);
      const sliceTo = val_co.netSize;
      const val = val_co.fromNet(rest.slice(0, sliceTo));
      return [label, val];
    },
  };
};
// function strToUint8Array(b, enc='utf8') {
//   return new Uint8Array(Buffer.from(b, enc));
// }
function uint8ArrayToStr(a, enc='utf8') {
  return Buffer.from(a).toString(enc);
}
// Common interface exports
// TODO: read token from scripts/algorand-devnet/algorand_data/algod.token
const token = {'X-Algo-API-Token': process.env.ALGO_TOKEN || 'c87f5580d7a866317b4bfe9e8b8d1dda955636ccebfa88c12b414db208dd9705'};
// const token = process.env.ALGO_TOKEN || 'c87f5580d7a866317b4bfe9e8b8d1dda955636ccebfa88c12b414db208dd9705';
// const server = process.env.ALGO_SERVER || 'http://localhost';
// const port = process.env.ALGO_PORT || 4180;
const server = process.env.ALGO_SERVER || '/algod';
const port = '';
const [getAlgodClient, setAlgodClient] = replaceableThunk(async () => {
  console.log(`setting algodClient to default`);
  await wait1port(server, port);
  return new algosdk.Algodv2(token, server, port);
});
export { setAlgodClient };
const itoken = process.env.ALGO_INDEXER_TOKEN || 'reach-devnet';
// const iserver = process.env.ALGO_INDEXER_SERVER || 'http://localhost';
// const iport = process.env.ALGO_INDEXER_PORT || 8980;
const iserver = process.env.ALGO_INDEXER_SERVER || '/indexer';
const iport = '';
const [getIndexer, setIndexer] = replaceableThunk(async () => {
  console.log(`setting indexer to default`);
  await wait1port(iserver, iport);
  return new algosdk.Indexer(itoken, iserver, iport);
});
export { setIndexer };
// eslint-disable-next-line max-len
const FAUCET = algosdk.mnemonicToSecretKey((process.env.ALGO_FAUCET_PASSPHRASE || 'close year slice mind voice cousin brass goat anxiety drink tourist child stock amused rescue pitch exhibit guide occur wide barrel process type able please'));
const [getFaucet, setFaucet] = replaceableThunk(async () => {
  return await connectAccount(FAUCET);
});
export { getFaucet, setFaucet };
// Helpers
const [getWaitPort, setWaitPort] = replaceableThunk(() => true);
export { setWaitPort };
async function wait1port(theServer, thePort) {
  if (!getWaitPort()) return;
  thePort = typeof thePort === 'string' ? parseInt(thePort, 10) : thePort;
  const { hostname } = url.parse(theServer);
  const args = {
    host: hostname || undefined,
    port: thePort,
    output: 'silent',
    timeout: 1000 * 60 * 1,
  };
  debug('wait1port');
  if (getDEBUG()) {
    console.log(args);
  }
  debug('waitPort complete');
  return await waitPort(args);
}
const getLastRound = async () => (await (await getAlgodClient()).status().do())['last-round'];
const waitForConfirmation = async (txId, untilRound) => {
  const algodClient = await getAlgodClient();
  let lastRound = null;
  do {
    const lastRoundAfterCall = lastRound ?
      algodClient.statusAfterBlock(lastRound) :
      algodClient.status();
    lastRound = (await lastRoundAfterCall.do())['last-round'];
    const pendingInfo = await algodClient.pendingTransactionInformation(txId).do();
    const confirmedRound = pendingInfo['confirmed-round'];
    if (confirmedRound && confirmedRound > 0) {
      return pendingInfo;
    }
  } while (lastRound < untilRound);
  throw { type: 'waitForConfirmation', txId, untilRound, lastRound };
};
const sendAndConfirm_AlgoSigner = async (tx, txOrig, txID) => {
  console.log('tx_unsigned');
  console.log(txOrig);
  // Note: tx.txID does not match tx_unsigned.txID()
  // const txID = tx.txID; //  tx_unsigned.txID().toString();
  const untilRound = txOrig.lastRound;
  console.log('blob');
  console.log(tx.blob);
  const req = (await getAlgodClient()).sendRawTransaction(Buffer.from(tx.blob, 'base64'));
  try {
    console.log('attempting to send...');
    // const sendRes = await AlgoSigner.send({ledger, tx: tx.blob});
    const sendRes = await req.do();
    console.log('...sent');
    console.log(sendRes);
  } catch (e) {
    throw { type: 'AlgoSigner.send', e };
  }
  console.log('attempting to wait for confirmation');
  const ret = await waitForConfirmation(txID, untilRound);
  console.log('...got confirmation.')
  console.log(ret);
  return ret;
}
const sendAndConfirm = async (stx_or_stxs) => {
  console.log('sendAndConfirm');
  console.log(stx_or_stxs);
  let {lastRound, txID} = stx_or_stxs;
  let sendme = stx_or_stxs.tx;
  if (Array.isArray(stx_or_stxs)) {
    if (stx_or_stxs.length === 0) {
      console.log(`Sending nothing... why...?`);
      return;
    }
    console.log(`Sending multiple...`)
    lastRound = stx_or_stxs[0].lastRound;
    txID = stx_or_stxs[0].txID;
    sendme = stx_or_stxs.map((stx) => stx.tx);
  } else {
    console.log(`sending just one...`);
  }
  // const txID = txn.txID().toString();
  const untilRound = lastRound; // txn.lastRound;
  const req = (await getAlgodClient()).sendRawTransaction(sendme);
  // @ts-ignore XXX
  debug(`sendAndConfirm: ${base64ify(req.txnBytesToPost)}`);
  try {
    await req.do();
  } catch (e) {
    throw { type: 'sendRawTransaction', e };
  }
  return await waitForConfirmation(txID, untilRound);
};
// // Backend
const compileTEAL = async (label, code) => {
  debug(`compile ${label}`);
  let s, r;
  try {
    r = await (await getAlgodClient()).compile(code).do();
    s = 200;
  } catch (e) {
    s = typeof e === 'object' ? e.statusCode : 'not object';
    r = e;
  }
  if (s == 200) {
    debug(`compile ${label} succeeded: ${JSON.stringify(r)}`);
    r.src = code;
    r.result = new Uint8Array(Buffer.from(r.result, 'base64'));
    // debug(`compile transformed: ${JSON.stringify(r)}`);
    return r;
  } else {
    throw Error(`compile ${label} failed: ${s}: ${JSON.stringify(r)}`);
  }
};
const getTxnParams = async () => {
  debug(`fillTxn: getting params`);
  while (true) {
    const params = await (await getAlgodClient()).getTransactionParams().do();
    debug(`fillTxn: got params: ${JSON.stringify(params)}`);
    if (params.firstRound !== 0) {
      return params;
    }
    debug(`...but firstRound is 0, so let's wait and try again.`);
    // Assumption: firstRound will move past 0 on its own.
    await Timeout.set(1000);
  }
};

function regroup(thisAcc, txns) {
  // Sorry this is so dumb.
  // Basically, if these go thru AlgoSigner,
  // it will mangle them,
  //  so we need to recalculate the group hash.
  if (thisAcc.AlgoSigner) {
    const roundtrip_txns = txns
      .map(x => clean_for_AlgoSigner(x))
      .map(x => unclean_for_AlgoSigner(x));

    // console.log(`deployP: group`);
    // console.log(Buffer.from(txns[0].group, 'base64').toString('base64'));

    algosdk.assignGroupID(roundtrip_txns);
    // console.log(`deploy: roundtrip group`);
    // console.log(Buffer.from(roundtrip_txns[0].group, 'base64').toString('base64'));

    const group = roundtrip_txns[0].group;
    for (const txn of txns) {
      txn.group = group;
    }
    return roundtrip_txns;
  } else {
    return txns;
  }
}

// A copy/paste of some logic from AlgoSigner
// packages/extension/src/background/messaging/task.ts
function unclean_for_AlgoSigner(txnOrig) {
  // console.log({m: 'unclean', from: txnOrig.from});
  const txn = {...txnOrig};
  Object.keys({...txnOrig}).forEach(key => {
    if(txn[key] === undefined || txn[key] === null){
        delete txn[key];
    }
  });

  // Modify base64 encoded fields
  if ('note' in txn && txn.note !== undefined) {
      txn.note = new Uint8Array(Buffer.from(txn.note));
  }
  // Application transactions only
  if(txn && txn.type === 'appl'){
    if('appApprovalProgram' in txn){
      txn.appApprovalProgram = Uint8Array.from(Buffer.from(txn.appApprovalProgram,'base64'));
    }
    if('appClearProgram' in txn){
      txn.appClearProgram = Uint8Array.from(Buffer.from(txn.appClearProgram,'base64'));
    }
    if('appArgs' in txn){
      var tempArgs = [];
      txn.appArgs.forEach(element => {
          // logging.log(element);
          tempArgs.push(Uint8Array.from(Buffer.from(element,'base64')));
      });
      txn.appArgs = tempArgs;
    }
  }
  return txn;
}

// genesisHash, note_str are possibly optional
const clean_for_AlgoSigner = (txnOrig, genesisHash, note_str) => {
  // Make a copy with just the properties, because reasons
  const txn = {...txnOrig};
  // console.log('txn before:');
  // console.log({...txnOrig});
  // Weirdly, AlgoSigner *requires* the note to be a string
  if (note_str) {
    txn.note = note_str;
  } else if (txn.note) {
    txn.note = uint8ArrayToStr(txn.note, 'utf8');
  }
  // Also weirdly:
  // "Creation of PaymentTx has extra or invalid fields: name,tag,appArgs."
  delete txn.name;
  delete txn.tag;
  // "Creation of ApplTx has extra or invalid fields: name,tag."
  if (txn.type !== 'appl') {
    delete txn.appArgs;
  } else {
    if (txn.appArgs) {
      console.log('txn.appArgs before "cleaning:"');
      console.log(txn.appArgs);
      if (txn.appArgs.length === 0) {
        txn.appArgs = [];
      } else {
        txn.appArgs = [uint8ArrayToStr(txn.appArgs, 'base64')]; // XXX ?????
      }
      console.log('txn.appArgs after "cleaning":');
      console.log(txn.appArgs);
    }
  }

  // Validation failed for transaction because of invalid properties [from,to]
  if (txn.from && txn.from.publicKey) {
    txn.from = algosdk.encodeAddress(txn.from.publicKey);
  }
  if (txn.to && txn.to.publicKey) {
    txn.to = algosdk.encodeAddress(txn.to.publicKey);
  }
  // Uncaught (in promise) First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.
  // No idea what it's talking about, but probably GenesisHash?
  if (genesisHash) {
    txn.genesisHash = genesisHash; // replaces Uint8Array w/ string
  } else if (txn.genesisHash) {
    if (typeof txn.genesisHash !== 'string') {
      txn.genesisHash = uint8ArrayToStr(txn.genesisHash, 'base64');
    }
  }
  console.log({genesisHash: txn.genesisHash});
  // uncaught (in promise) lease must be a Uint8Array.
  delete txn.lease; // it is... but how about we just delete it instead

  // Some more uint8Array BS
  if (txn.appApprovalProgram) {
    txn.appApprovalProgram = uint8ArrayToStr(txn.appApprovalProgram, 'base64');
  }
  if (txn.appClearProgram) {
    txn.appClearProgram = uint8ArrayToStr(txn.appClearProgram, 'base64');
  }
  if (txn.group) {
    txn.group = uint8ArrayToStr(txn.group, 'base64');
  }

  // ???
  txn.flatFee = true;

  // console.log('txn after:');
  // console.log(txn);
  return txn;
  // const txn_s = await AlgoSigner.sign(txn);
}

// https://github.com/PureStake/algosigner/blob/5ccfafceaece07e6c8594711a4d543756f4ab0d3/docs/dApp-integration.md#algosignersigntxnobject
const sign_and_send_sync_AlgoSigner = async (AlgoSigner, ledger, txnParams, note_str, label, txnOrig) => {
  console.log(`XXX this should be dead code XXX`);
  const txn = clean_for_AlgoSigner(txnOrig, txnParams.genesisHash, note_str)
  const txn_s = await AlgoSigner.sign(txn);
  // const txn_s = await AlgoSigner.sign(txnOrig);
  console.log('signed txn:');
  console.log(txn_s);
  try {
    return await sendAndConfirm_AlgoSigner(AlgoSigner, ledger, txn_s, txnOrig);
  } catch (e) {
    console.log(e);
    throw Error(`${label} txn failed (AlgoSigner@${ledger}):\n${JSON.stringify(txn)}\nwith:\n${JSON.stringify(e)}`);
  }
}
const sign_and_send_sync = async (label, networkAccount, txn, genesisHash, note_str) => {
  const txn_s = await signTxn(networkAccount, txn, genesisHash, note_str);
  try {
    return await sendAndConfirm(txn_s);
  } catch (e) {
    console.log(e);
    throw Error(`${label} txn failed:\n${JSON.stringify(txn)}\nwith:\n${JSON.stringify(e)}`);
  }
};
export const transfer = async (from, to, value, AlgoSigner = null, ledger = null) => {
  const valuen = value.toNumber();
  const sender = from.networkAccount;
  const receiver = to.networkAccount.addr;
  const label = `transfer ${JSON.stringify(from)} ${JSON.stringify(to)} ${valuen}`;
  const params = await getTxnParams();
  const note_str = '@reach-sh/ALGO.mjs transfer';
  const note = algosdk.encodeObj(note_str);
  const txn = algosdk.makePaymentTxnWithSuggestedParams(sender.addr, receiver, valuen, undefined, note, params);
  if (AlgoSigner && ledger) {
    // XXX maybe don't makePaymentTxnWithSuggestedParams for this,
    // because it's clearly not compatible
    return await sign_and_send_sync_AlgoSigner(AlgoSigner, ledger, params, note_str, label, txn);
  } else {
    console.log(`transfer: sign_and_send_sync`);
    return await sign_and_send_sync(label, sender, txn, params.genesisHash, note_str);
  }
};
// XXX I'd use x.replaceAll if I could (not supported in this node version), but it would be better to extend ConnectorInfo so these are functions
const replaceAll = (orig, what, whatp) => {
  const once = orig.replace(what, whatp);
  if (once === orig) {
    return orig;
  } else {
    return replaceAll(once, what, whatp);
  }
};
const replaceUint8Array = (label, arr, x) => replaceAll(x, `"{{${label}}}"`, `base32(${base32.encode(arr).toString()})`);
const replaceAddr = (label, addr, x) => replaceUint8Array(label, algosdk.decodeAddress(addr).publicKey, x);

function must_be_supported(bin) {
  const algob = bin._Connectors.ALGO;
  const { unsupported } = algob;
  if (unsupported) {
    throw Error(`This Reach application is not supported by Algorand.`);
  }
}
async function compileFor(bin, ApplicationID) {
  must_be_supported(bin);
  const algob = bin._Connectors.ALGO;
  const { appApproval, appClear, ctc, steps, stepargs } = algob;
  const subst_appid = (x) => replaceUint8Array('ApplicationID', T_UInt.toNet(bigNumberify(ApplicationID)), x);
  const ctc_bin = await compileTEAL('ctc_subst', subst_appid(ctc));
  const subst_ctc = (x) => replaceAddr('ContractAddr', ctc_bin.hash, x);
  let appApproval_subst = appApproval;
  const stepCode_bin = await Promise.all(steps.map(async (mc, mi) => {
    if (!mc) {
      return null;
    }
    const mN = `m${mi}`;
    const mc_subst = subst_ctc(subst_appid(mc));
    const cr = await compileTEAL(mN, mc_subst);
    const plen = cr.result.length;
    const alen = stepargs[mi];
    const tlen = plen + alen;
    if (tlen > 1000) {
      throw Error(`This Reach application is not supported by Algorand (program(${plen}) + args(${alen}) = total(${tlen}) > 1000)`);
    }
    appApproval_subst =
      replaceAddr(mN, cr.hash, appApproval_subst);
    return cr;
  }));
  const appApproval_bin = await compileTEAL('appApproval_subst', appApproval_subst);
  const appClear_bin = await compileTEAL('appClear', appClear);
  return {
    appApproval: appApproval_bin,
    appClear: appClear_bin,
    ctc: ctc_bin,
    steps: stepCode_bin,
  };
}
const ui8z = new Uint8Array();
const base64ify = (x) => Buffer.from(x).toString('base64');
const format_failed_request = (e) => {
  const ep = JSON.parse(JSON.stringify(e));
  const db64 = ep.req ?
    (ep.req.data ? base64ify(ep.req.data) :
      `no data, but ${JSON.stringify(Object.keys(ep.req))}`) :
    `no req, but ${JSON.stringify(Object.keys(ep))}`;
  const msg = e.text ? JSON.parse(e.text) : e;
  return `\n${db64}\n${JSON.stringify(msg)}`;
};
const doQuery = async (dhead, query) => {
  //debug(`${dhead} --- QUERY = ${JSON.stringify(query)}`);
  let res;
  try {
    res = await query.do();
  } catch (e) {
    throw Error(`${dhead} --- QUERY FAIL: ${JSON.stringify(e)}`);
  }
  if (res.transactions.length == 0) {
    // debug(`${dhead} --- RESULT = empty`);
    // XXX Look at the round in res and wait for a new round
    return null;
  }
  debug(`${dhead} --- RESULT = ${JSON.stringify(res)}`);
  const txn = res.transactions[0];
  return txn;
};
// txnOrig :: A
// clean_for_AlgoSigner :: A -> B
// unclean_for_AlgoSigner :: B -> A // sort of but not exactly A
// algoSigner :: B -> C
// send :: D -> E
// txnSign :: A -> D
// \stx-obj -> Buffer.from(stx_obj.blob, 'base64') :: C -> D
// do a message unpack on the signed txn to see what's actually different
async function signTxn(networkAccount, txnOrig, genesisHash, note_str) {
  const {sk, AlgoSigner} = networkAccount;
  // XXX TODO prefer sk if available
  if (!AlgoSigner && sk) {
    const tx = txnOrig.signTxn(sk);
    const ret = {
      tx,
      txID: txnOrig.txID().toString(),
      lastRound: txnOrig.lastRound,
    }
    return ret;
  } else if (AlgoSigner) {
    // TODO: clean up txn before signing
    const txn = clean_for_AlgoSigner(txnOrig, genesisHash, note_str);

    // XXX
    if (sk) {
      const re_tx = txnOrig.signTxn ? txnOrig : new algosdk__src__transaction.Transaction(txnOrig);
      re_tx.group = txnOrig.group;

      const sk_tx = re_tx.signTxn(sk);
      const sk_ret = {
        tx: sk_tx,
        txID: re_tx.txID().toString(),
        lastRound: txnOrig.lastRound,
      }
      console.log('signed sk_ret');
      console.log({txID: sk_ret.txID});
      console.log(msgpack.decode(sk_ret.tx));
    }
    console.log('AlgoSigner.sign ...');
    const stx_obj = await AlgoSigner.sign(txn);
    console.log('...signed');
    // console.log({stx_obj});
    const ret = {
      tx: Buffer.from(stx_obj.blob, 'base64'),
      txID: stx_obj.txID,
      lastRound: txnOrig.lastRound,
    };

    console.log('signed AlgoSigner')
    console.log({txID: ret.txID});
    console.log(msgpack.decode(ret.tx));
    return ret;
  } else {
    throw Error(`networkAccount has neither sk nor AlgoSigner: ${JSON.stringify(networkAccount)}`);
  }
}
export const connectAccount = async (networkAccount) => {
  const indexer = await getIndexer();
  const thisAcc = networkAccount;
  const shad = thisAcc.addr.substring(2, 6);
  const pks = T_Address.canonicalize(thisAcc);
  debug(`${shad}: connectAccount`);
  const selfAddress = () => {
    return pks;
  };
  const iam = (some_addr) => {
    if (some_addr === pks) {
      return some_addr;
    } else {
      throw Error(`I should be ${some_addr}, but am ${pks}`);
    }
  };
  const attachP = async (bin, ctcInfoP) => {
    const ctcInfo = await ctcInfoP;
    const getInfo = async () => ctcInfo;
    const ApplicationID = ctcInfo.ApplicationID;
    let lastRound = ctcInfo.creationRound;
    debug(`${shad}: attach ${ApplicationID} created at ${lastRound}`);
    const bin_comp = await compileFor(bin, ApplicationID);
    await verifyContract(ctcInfo, bin);
    console.log(bin_comp); // XXX
    const ctc_prog = algosdk.makeLogicSig(bin_comp.ctc.result, []);
    const wait = async (delta) => {
      return await waitUntilTime(bigNumberify(lastRound).add(delta));
    };
    const sendrecv = async (label, funcNum, evt_cnt, tys, args, value, out_tys, timeout_delay, sim_p) => {
      const funcName = `m${funcNum}`;
      const dhead = `${shad}: ${label} sendrecv ${funcName} ${timeout_delay}`;
      debug(`${dhead} --- START`);
      const handler = bin_comp.steps[funcNum];
      if (!handler) {
        throw Error(`${dhead} Internal error: reference to undefined handler: ${funcName}`);
      }
      const fake_res = {
        didTimeout: false,
        data: argsSlice(args, evt_cnt),
        value: value,
        from: pks,
      };
      const sim_r = sim_p(fake_res);
      debug(`${dhead} --- SIMULATE ${JSON.stringify(sim_r)}`);
      const isHalt = sim_r.isHalt;
      const sim_txns = sim_r.txns;
      while (true) {
        const params = await getTxnParams();
        if (timeout_delay) {
          const tdn = timeout_delay.toNumber();
          params.lastRound = lastRound + tdn;
          if (params.firstRound > params.lastRound) {
            debug(`${dhead} --- FAIL/TIMEOUT`);
            return { didTimeout: true };
          }
        }
        debug(`${dhead} --- ASSEMBLE w/ ${JSON.stringify(params)}`);
        const txnFromContracts = sim_txns.map((txn_nfo) => algosdk.makePaymentTxnWithSuggestedParams(bin_comp.ctc.hash,
          // XXX use some other function
          algosdk.encodeAddress(Buffer.from(txn_nfo.to.slice(2), 'hex')), txn_nfo.amt.toNumber(), undefined, ui8z, params));
        const totalFromFee = txnFromContracts.reduce(((sum, txn) => sum + txn.fee), 0);
        debug(`${dhead} --- totalFromFee = ${JSON.stringify(totalFromFee)}`);
        debug(`${dhead} --- isHalt = ${JSON.stringify(isHalt)}`);
        const actual_args = [sim_r.prevSt, sim_r.nextSt, isHalt, bigNumberify(totalFromFee), lastRound, ...args];
        const actual_tys = [T_Digest, T_Digest, T_Bool, T_UInt, T_UInt, ...tys];
        debug(`${dhead} --- ARGS = ${JSON.stringify(actual_args)}`);
        const safe_args = actual_args.map((m, i) => actual_tys[i].toNet(m));
        safe_args.forEach((x) => {
          if (!(x instanceof Uint8Array)) {
            // The types say this is impossible now,
            // but we'll leave it in for a while just in case...
            throw Error(`expect safe program argument, got ${JSON.stringify(x)}`);
          }
        });
        const ui8h = (x) => Buffer.from(x).toString('hex');
        debug(`${dhead} --- PREPARE: ${JSON.stringify(safe_args.map(ui8h))}`);
        const handler_with_args = algosdk.makeLogicSig(handler.result, safe_args);
        debug(`${dhead} --- PREPARED`); // XXX display handler_with_args usefully, like with base64ify toBytes
        const whichAppl = isHalt ?
          // We are treating it like any party can delete the application, but the docs say it may only be possible for the creator. The code appears to not care: https://github.com/algorand/go-algorand/blob/0e9cc6b0c2ddc43c3cfa751d61c1321d8707c0da/ledger/apply/application.go#L589
          algosdk.makeApplicationDeleteTxn :
          algosdk.makeApplicationNoOpTxn;
        // XXX if it is a halt, generate closeremaindertos for all the handlers and the contract account
        const txnAppl = whichAppl(thisAcc.addr, params, ApplicationID);
        const txnFromHandler = algosdk.makePaymentTxnWithSuggestedParams(handler.hash, thisAcc.addr, 0, undefined, ui8z, params);
        debug(`${dhead} --- txnFromHandler = ${JSON.stringify(txnFromHandler)}`);
        const txnToHandler = algosdk.makePaymentTxnWithSuggestedParams(thisAcc.addr, handler.hash, txnFromHandler.fee, undefined, ui8z, params);
        debug(`${dhead} --- txnToHandler = ${JSON.stringify(txnToHandler)}`);
        const txnToContract = algosdk.makePaymentTxnWithSuggestedParams(thisAcc.addr, bin_comp.ctc.hash, value.toNumber() + totalFromFee, undefined, ui8z, params);
        const txns = [
          txnAppl,
          txnToHandler,
          txnFromHandler,
          txnToContract,
          ...txnFromContracts,
        ];
        algosdk.assignGroupID(txns);
        regroup(thisAcc, txns);

        // XXX
        console.log('txnAppl');
        console.log(txnAppl);
        console.log(txnAppl.txID());
        // console.log('txnApple regrouped');
        // const rg0 = regrouped[0]
        // console.log(rg0);
        // const rg0t = new algosdk__src__transaction.Transaction(rg0);
        // console.log('pre-grouped ID');
        // console.log(rg0t.txID());
        // rg0t.group = rg0.group;
        // console.log('grouped ID');
        // console.log(rg0t.txID());
        // XXX

        const signLSTO = (txn, ls) => {
          // This part simulates signLogicSigTransactionObject
          // but does it a little differently
          // see: algosdk src/main.js
          // algosdk.signLogicSigTransactionObject(txn, ls)
          // XXX
          console.log(txn);
          const encodeme = txn.get_obj_for_encoding
            ? txn.get_obj_for_encoding()
            : txn;
          const tx_obj = {
            txID: txn.txID
              ? txn.txID()
              : (new algosdk__src__transaction.Transaction(txn)).txID(),
            blob: {
              lsig: ls.get_obj_for_encoding(),
              txn: algosdk.encodeObj(encodeme),
            },
          };
          return {
            tx: tx_obj.blob,
            txID: tx_obj.txID,
            lastRound: txn.lastRound,
          }
        };
        const sign_me = async (x) => await signTxn(thisAcc, x);
        const txnAppl_s = await sign_me(txnAppl);
        const txnToHandler_s = await sign_me(txnToHandler);
        const txnFromHandler_s = signLSTO(txnFromHandler, handler_with_args);
        // debug(`txnFromHandler_s: ${base64ify(txnFromHandler_s.tx)}`);
        const txnToContract_s = await sign_me(txnToContract);
        const txnFromContracts_s = txnFromContracts.map((txn) => signLSTO(txn, ctc_prog));
        const txns_s = [
          txnAppl_s,
          txnToHandler_s,
          txnFromHandler_s,
          txnToContract_s,
          ...txnFromContracts_s,
        ];
        debug(`${dhead} --- SEND: ${txns_s.length}`);
        let res;
        try {
          res = await sendAndConfirm(txns_s, txnAppl);
        } catch (e) {
          if (e.type === 'sendRawTransaction') {
            console.log(e);
            throw Error(`${dhead} --- FAIL:\n${format_failed_request(e.e)}`);
          } else {
            console.log(e);
            throw Error(`${dhead} --- FAIL:\n${JSON.stringify(e)}`);
          }
        }
        // XXX we should inspect res and if we failed because we didn't get picked out of the queue, then we shouldn't error, but should retry and let the timeout logic happen.
        debug(`${dhead} --- SUCCESS: ${JSON.stringify(res)}`);
        return await recv(label, funcNum, evt_cnt, out_tys, timeout_delay);
      }
    };
    const recv = async (label, funcNum, evt_cnt, tys, timeout_delay) => {
      const funcName = `m${funcNum}`;
      const dhead = `${shad}: ${label} recv ${funcName} ${timeout_delay}`;
      debug(`${dhead} --- START`);
      const handler = bin_comp.steps[funcNum];
      if (!handler) {
        throw Error(`${dhead} Internal error: reference to undefined handler: ${funcName}`);
      }
      const timeoutRound = timeout_delay ?
        lastRound + timeout_delay.toNumber() :
        undefined;
      while (true) {
        const currentRound = await getLastRound();
        if (timeoutRound && timeoutRound < currentRound) {
          return { didTimeout: true };
        }
        let query = indexer.searchForTransactions()
          .address(handler.hash)
          .addressRole('sender')
          .minRound(lastRound);
        if (timeoutRound) {
          query = query.maxRound(timeoutRound);
        }
        const txn = await doQuery(dhead, query);
        if (!txn) {
          // XXX perhaps wait until a new round has happened using wait
          await Timeout.set(2000);
          continue;
        }
        const ctc_args = txn.signature.logicsig.args;
        debug(`${dhead} --- ctc_args = ${JSON.stringify(ctc_args)}`);
        const args = argsSlice(ctc_args, evt_cnt);
        debug(`${dhead} --- args = ${JSON.stringify(args)}`);
        /** @description base64->hex->arrayify */
        const reNetify = (x) => {
          const s = Buffer.from(x, 'base64').toString('hex');
          // debug(`${dhead} --- deNetify ${s}`);
          return ethers.utils.arrayify('0x' + s);
        };
        const args_un = args.map((x, i) => tys[i].fromNet(reNetify(x)));
        debug(`${dhead} --- args_un = ${JSON.stringify(args_un)}`);
        const totalFromFee = T_UInt.fromNet(reNetify(ctc_args[3]));
        debug(`${dhead} --- totalFromFee = ${JSON.stringify(totalFromFee)}`);
        const fromAddr = txn['payment-transaction'].receiver;
        const from = T_Address.canonicalize({ addr: fromAddr });
        debug(`${dhead} --- from = ${JSON.stringify(from)} = ${fromAddr}`);
        const oldLastRound = lastRound;
        lastRound = txn['confirmed-round'];
        debug(`${dhead} --- updating round from ${oldLastRound} to ${lastRound}`);
        // XXX ideally we'd get the whole transaction group before and not need to do this.
        const ptxn = await doQuery(dhead, indexer.searchForTransactions()
          .address(bin_comp.ctc.hash)
          .addressRole('receiver')
          .round(lastRound));
        const value = bigNumberify(ptxn['payment-transaction'].amount)
          .sub(totalFromFee);
        debug(`${dhead} --- value = ${JSON.stringify(value)}`);
        return {
          didTimeout: false,
          data: args_un,
          value,
          from,
        };
      }
    };
    return { getInfo, sendrecv, recv, iam, selfAddress, wait };
  };
  const deployP = async (bin) => {
    must_be_supported(bin);
    debug(`${shad} deploy`);
    const algob = bin._Connectors.ALGO;
    const { appApproval0, appClear } = algob;
    const appApproval0_subst = replaceAddr('Deployer', thisAcc.addr, appApproval0);
    const appApproval0_bin = await compileTEAL('appApproval0', appApproval0_subst);
    const appClear_bin = await compileTEAL('appClear', appClear);
    console.log(`deployP: sign_and_send_sync`);
    const createRes = await sign_and_send_sync('ApplicationCreate', thisAcc, algosdk.makeApplicationCreateTxn(thisAcc.addr, await getTxnParams(), algosdk.OnApplicationComplete.NoOpOC, appApproval0_bin.result, appClear_bin.result, 0, 0, 2, 1));
    const ApplicationID = createRes['application-index'];
    if (!ApplicationID) {
      throw Error(`No application-index in ${JSON.stringify(createRes)}`);
    }
    const bin_comp = await compileFor(bin, ApplicationID);
    const params = await getTxnParams();
    const txnUpdate = algosdk.makeApplicationUpdateTxn(thisAcc.addr, params, ApplicationID, bin_comp.appApproval.result, appClear_bin.result);
    const txnToContract = algosdk.makePaymentTxnWithSuggestedParams(thisAcc.addr, bin_comp.ctc.hash, raw_minimumBalance, undefined, ui8z, params);
    const txnToHandlers = bin_comp.steps.flatMap((sc) => {
      if (!sc) {
        return [];
      }
      return [algosdk.makePaymentTxnWithSuggestedParams(thisAcc.addr, sc.hash, raw_minimumBalance, undefined, ui8z, params)];
    });
    const txns = [
      txnUpdate,
      txnToContract,
      ...txnToHandlers,
    ];

    algosdk.assignGroupID(txns);
    regroup(thisAcc, txns);

    console.log(`deployP: sign txnUpdate`);
    const txnUpdate_s = await signTxn(thisAcc, txnUpdate);
    console.log(`deployP: sign txnToContract`);
    const txnToContract_s = await signTxn(thisAcc, txnToContract);
    console.log(`deployP: sign each txnToHandlers`);
    // This is written a dumb way to make sure signatures happen one at a time.
    const txnToHandlers_s = [];
    for (const tx of txnToHandlers) {
      console.log(`deployP: sign another txnToHandler`);
      txnToHandlers_s.push(await signTxn(thisAcc, tx))
    }
    const txns_s = [
      txnUpdate_s,
      txnToContract_s,
      ...txnToHandlers_s,
    ];
    let updateRes;
    try {
      updateRes = await sendAndConfirm(txns_s, txnUpdate);
    } catch (e) {
      throw Error(`deploy: ${JSON.stringify(e)}`);
    }
    const creationRound = updateRes['confirmed-round'];
    const getInfo = async () => ({ ApplicationID, creationRound });
    debug(`${shad} application created`);
    return await attachP(bin, getInfo());
  };
  /**
   * @description Push await down into the functions of a ContractAttached
   * @param implP A promise of an implementation of ContractAttached
   */
  const deferP = (implP) => {
    return {
      getInfo: async () => (await implP).getInfo(),
      sendrecv: async (...args) => (await implP).sendrecv(...args),
      recv: async (...args) => (await implP).recv(...args),
      wait: async (...args) => (await implP).wait(...args),
      iam,
      selfAddress,
    };
  };
  const attach = (bin, ctcInfoP) => {
    return deferP(attachP(bin, ctcInfoP));
  };
  const deploy = (bin) => {
    return deferP(deployP(bin));
  };
  return { deploy, attach, networkAccount };
};
export const balanceOf = async (acc) => {
  const { networkAccount } = acc;
  if (!networkAccount)
    throw Error(`acc.networkAccount missing. Got: ${acc}`);
  const client = await getAlgodClient();
  const { amount } = await client.accountInformation(networkAccount.addr).do();
  return bigNumberify(amount);
};
const showBalance = async (note, networkAccount) => {
  const bal = await balanceOf({ networkAccount });
  const showBal = formatCurrency(bal, 2);
  console.log('%s: balance: %s algos', note, showBal);
};
export const newTestAccount = async (startingBalance) => {
  const networkAccount = algosdk.generateAccount();
  if (getDEBUG()) {
    await showBalance('before', networkAccount);
  }
  await transfer({ networkAccount: FAUCET }, { networkAccount }, startingBalance);
  if (getDEBUG()) {
    await showBalance('after', networkAccount);
  }
  return await connectAccount(networkAccount);
};
/** @description the display name of the standard unit of currency for the network */
export const standardUnit = 'ALGO';
/** @description the display name of the atomic (smallest) unit of currency for the network */
export const atomicUnit = 'μALGO';
/**
 * @description  Parse currency by network
 * @param amt  value in the {@link standardUnit} for the network.
 * @returns  the amount in the {@link atomicUnit} of the network.
 * @example  parseCurrency(100).toString() // => '100000000'
 */
export function parseCurrency(amt) {
  const numericAmt = isBigNumber(amt) ? amt.toNumber() :
    typeof amt === 'string' ? parseFloat(amt) :
    amt;
  return bigNumberify(algosdk.algosToMicroalgos(numericAmt));
}
// XXX get from SDK
const raw_minimumBalance = 100000;
export const minimumBalance = bigNumberify(raw_minimumBalance);
/**
 * @description  Format currency by network
 * @param amt  the amount in the {@link atomicUnit} of the network.
 * @param decimals  up to how many decimal places to display in the {@link standardUnit}.
 *   Trailing zeroes will be omitted. Excess decimal places will be truncated. (not rounded)
 *   This argument defaults to maximum precision.
 * @returns  a string representation of that amount in the {@link standardUnit} for that network.
 * @example  formatCurrency(bigNumberify('100000000')); // => '100'
 */
export function formatCurrency(amt, decimals = 6) {
  // Recall that 1 algo = 10^6 microalgos
  if (!(Number.isInteger(decimals) && 0 <= decimals)) {
    throw Error(`Expected decimals to be a nonnegative integer, but got ${decimals}.`);
  }
  // Use decimals+1 and then slice it off to truncate instead of round
  const algosStr = algosdk.microalgosToAlgos(amt.toNumber()).toFixed(decimals + 1);
  // Have to roundtrip thru Number to drop trailing zeroes
  return Number(algosStr.slice(0, algosStr.length - 1)).toString();
}
// TODO: get from AlgoSigner if in browser
export async function getDefaultAccount() {
  return await getFaucet();
}
/**
 * @param mnemonic 25 words, space-separated
 */
export const newAccountFromMnemonic = async (mnemonic) => {
  return await connectAccount(algosdk.mnemonicToSecretKey(mnemonic));
};
/**
 * @param secret a Uint8Array, or its hex string representation
 */
export const newAccountFromSecret = async (secret) => {
  const sk = ethers.utils.arrayify(secret);
  const mnemonic = algosdk.secretKeyToMnemonic(sk);
  return await newAccountFromMnemonic(mnemonic);
};
// If mnemonic is specified, it prints extra debug stuff
// comparing AlgoSigner to regular signing
export const newAccountFromAlgoSigner = async (addr, AlgoSigner, ledger, mnemonic) => {
  if (!AlgoSigner) {
    throw Error(`AlgoSigner is falsy`);
  }
  const accts = await AlgoSigner.accounts({ledger});
  if (!Array.isArray(accts)) {
    throw Error(`AlgoSigner.accounts('${ledger}') is not an array: ${accts}`);
  }
  if (!accts.map(x => x.address).includes(addr)) {
    throw Error(`Address ${addr} not found in AlgoSigner accounts`);
  }
  let networkAccount = {addr, AlgoSigner};
  if (mnemonic) {
    networkAccount = algosdk.mnemonicToSecretKey(mnemonic);
    networkAccount.AlgoSigner = AlgoSigner;
    if (addr !== networkAccount.addr) {
      throw Error(`mnemonic does not pertain to address ${addr}`);
    }
  }
  return await connectAccount(networkAccount);
};
export const getNetworkTime = async () => bigNumberify(await getLastRound());
export const waitUntilTime = async (targetTime, onProgress) => {
  const onProg = onProgress || (() => {});
  let currentTime = await getNetworkTime();
  while (currentTime.lt(targetTime)) {
    debug(`waitUntilTime: iteration: ${currentTime} -> ${targetTime}`);
    const status = await (await getAlgodClient()).statusAfterBlock(currentTime.toNumber()).do();
    currentTime = bigNumberify(status['last-round']);
    onProg({ currentTime, targetTime });
  }
  debug(`waitUntilTime: ended: ${currentTime} -> ${targetTime}`);
  return currentTime;
};
export const wait = async (delta, onProgress) => {
  const now = await getNetworkTime();
  debug(`wait: delta=${delta} now=${now}, until=${now.add(delta)}`);
  return await waitUntilTime(now.add(delta), onProgress);
};
// XXX: implement this
export const verifyContract = async (ctcInfo, backend) => {
  void(ctcInfo);
  void(backend);
  // XXX verify contract was deployed at creationRound
  // XXX verify something about ApplicationId
  // XXX (above) attach creator info to ContractInfo
  // XXX verify creator was the one that deployed the contract
  // XXX verify deployed contract code matches backend
  // (after deployMode:firstMsg is implemented)
  // XXX (above) attach initial args to ContractInfo
  // XXX verify contract storage matches expectations based on initial args
  // (don't bother checking ctc balance at creationRound, the ctc enforces this)
  return true;
};
export const addressEq = mkAddressEq(T_Address);
