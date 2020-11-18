export default class AlgoSignerClient {
  constructor(AlgoSigner, ledger, clientName, opts = {}) {
    this.AlgoSigner = AlgoSigner;
    this.ledger = ledger;
    this.clientName = clientName;
    this.opts = opts;
  }

  debug(label, obj) {
    if (this.opts.debug) {
      console.log(`DEBUG: AlgoSignerClient: ${label}`);
      console.log({...obj});
    }
  }

  async get(path, query={}, requestHeaders={}) {
    this.debug('get args', {path, query, requestHeaders});
    const {AlgoSigner, clientName, ledger} = this;
    void(requestHeaders); // XXX make sure this is empty?
    void(query); // XXX append this into the path?
    // XXX handle non-200 results?
    const body = await AlgoSigner[clientName]({
        ledger,
        path,
    });
    const ret = {body}; // XXX status code?
    this.debug('get return body', body);
    return ret;
  }

  async post(path, data, requestHeaders={}) {
    const {AlgoSigner, clientName, ledger} = this;
    this.debug('post args', {path, data, requestHeaders});
    void(requestHeaders); // XXX make sure this is empty?
    // XXX how should this work, exactly?
    const body =
        typeof data === 'string' ? data
          : data.toString(); // XXX
          // : typeof data === 'Buffer' ? data.toString()
          // : JSON.stringify(data);

    // XXX requestHeaders ignored
    const retBody = await AlgoSigner[clientName]({
      ledger,
      path,
      method: 'POST',
      body,
    });
    const ret = {body: retBody}; // XXX status code?
    this.debug('post return body', retBody);
    return ret;
  }

  async delete(path, data, requestHeaders={}) {
    this.debug('delete args', {path, data, requestHeaders});
    void(path);
    void(data);
    void(requestHeaders);
    throw Error(`delete is not implemented`);
  }
}
