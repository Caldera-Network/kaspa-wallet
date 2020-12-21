import { Buffer } from 'safe-buffer';
const _ = require('lodash');
import * as bitcore from 'bitcore-lib-cash';

const Output = require('bitcore-lib-cash/lib/transaction/output');
const Input = require('bitcore-lib-cash/lib/transaction/input');

const secp256k1 = require('../../secp256k1/secp.js');

let {PrivateKey, PublicKey, Script, Transaction} = bitcore;
let {Schnorr, Signature, BN, Hash} = bitcore.crypto;
let {BufferReader, BufferWriter} = bitcore.encoding;
let {sighash} = Transaction;


//@ts-ignore
const {preconditions:_$, buffer:BufferUtil} = bitcore.util;

//@ts-ignore
if(!sighash._sighash){
  //@ts-ignore
  sighash._sighash = sighash.sighash;
  //@ts-ignore
  sighash.sighash = (...args:any[]):buffer=>{
    //@ts-ignore
    let buf:Buffer = sighash._sighash(...args);
    //@ts-ignore
    return new BufferReader(buf).readReverse();
  }
}

//@ts-ignore
Schnorr.sign = function(hashbuf:Buffer, privateKey:PrivateKey){
  console.log(":::sighash:", hashbuf.toString("hex"))
  let result = secp256k1.schnorrsig_sign(privateKey.toString(), hashbuf.toString("hex"));
  let sig = bitcore.crypto.Signature.fromString(result.sig);
  sig.compressed = true;
  return sig;
}
//@ts-ignore
Schnorr.verify = function(hashbuf, sig, pubkey, endian) {
  return true;//TODO
}

Script.buildPublicKeyHashIn = function(publicKey, signature, sigtype) {
  _$.checkArgument(signature instanceof Signature || BufferUtil.isBuffer(signature));
  _$.checkArgument(_.isUndefined(sigtype) || _.isNumber(sigtype));
  if (signature instanceof Signature) {
    signature = signature.toBuffer();
  }
  var script = new Script()
  //@ts-ignore
    .add(BufferUtil.concat([
      signature,
      //@ts-ignore
      BufferUtil.integerAsSingleByteBuffer(sigtype || Signature.SIGHASH_ALL)
    ]))
    //@ts-ignore
    .add(new PublicKey(publicKey).toBuffer().slice(1));
  return script;
};


PrivateKey.prototype.toPublicKey = function(){
  if (!this._pubkey) {
    let publicKeys = secp256k1.export_public_keys(this.toString());
    this._pubkey = new PublicKey(publicKeys.pubkey, {network:this.network.name});//PublicKey.fromPrivateKey(this);
  }
  return this._pubkey;
};

let _txlogBuffer = false;
const txlogBuffer = (...args:any[])=>{
  //@ts-ignore
  if(!_txlogBuffer)
    return
  args[args.length-1] = args[args.length-1].map((buf:Buffer)=>buf.toString("hex"));
  console.log(...args)
}

//@ts-ignore
Transaction.prototype.toBufferWriter = function(writer, extra) {
  writer.writeInt32LE(this.version);
  txlogBuffer("$$$$ version: ", this.version, writer.bufs)
  let bn = BN.fromNumber(this.inputs.length);
  writer.writeUInt64LEBN(bn);
  txlogBuffer("$$$$ inputs.length: ", this.inputs.length, writer.bufs)
  //@ts-ignore
  _.each(this.inputs, function(input) {
    input.toBufferWriter(writer);
  });
  bn = BN.fromNumber(this.outputs.length);
  writer.writeUInt64LEBN(bn);
  txlogBuffer("$$$$ outputs.length: ", this.outputs.length, writer.bufs)
  //@ts-ignore
  _.each(this.outputs, function(output) {
    output.toBufferWriter(writer);
  });
  bn = BN.fromNumber(this.nLockTime);
  writer.writeUInt64LEBN(bn);
  txlogBuffer("$$$$ nLockTime: ", this.nLockTime, writer.bufs)

  let subnetworkId = Buffer.from("0000000000000000000000000000000000000000", "hex");
  writer.write(subnetworkId);
  txlogBuffer("$$$$ subnetworkId: ", subnetworkId.toString("hex"), writer.bufs)

  //GAS
  let gas = Buffer.from("0000000000000000", "hex");
  writer.write(gas);
  txlogBuffer("$$$$ gas: ", gas.toString("hex"), writer.bufs)
  //PayloadHash
  let payload = Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex")
  writer.write(payload)
  txlogBuffer("$$$$ payload: ", payload.toString("hex"), writer.bufs)

  let unknown = Buffer.from("0000000000000000", "hex");
  writer.write(unknown);
  txlogBuffer("$$$$ unknown: ", unknown.toString("hex"), writer.bufs)

  return writer;
};

Transaction.prototype.fromBufferReader = function(reader) {
  _$.checkArgument(!reader.finished(), 'No transaction data received');
  var i, sizeTxIns, sizeTxOuts;

  this.version = reader.readInt32LE();
  sizeTxIns = reader.readUInt64LEBN().toNumber();
  for (i = 0; i < sizeTxIns; i++) {
    var input = Input.fromBufferReader(reader);
    this.inputs.push(input);
  }
  sizeTxOuts = reader.readUInt64LEBN().toNumber();
  for (i = 0; i < sizeTxOuts; i++) {
    this.outputs.push(Output.fromBufferReader(reader));
  }
  this.nLockTime = reader.readUInt32LE();
  return this;
};

Output.fromBufferReader = function(br:any) {
  var obj:any = {};
  obj.satoshis = br.readUInt64LEBN();
  var size = br.readUInt64LEBN().toNumber();
  if (size !== 0) {
    obj.script = br.read(size);
  } else {
    obj.script = Buffer.from([]);
  }
  return new Output(obj);
};

Output.prototype.toBufferWriter = function(writer:any) {
  if (!writer) {
    writer = new BufferWriter();
  }
  writer.writeUInt64LEBN(this._satoshisBN);
  var script = this._scriptBuffer;
  let bn = BN.fromNumber(script.length);
  writer.writeUInt64LEBN(bn);
  writer.write(script);
  return writer;
};

Input.fromBufferReader = function(br:any) {
  var input = new Input();
  input.prevTxId = br.read(32);
  input.outputIndex = br.readUInt32LE();
  input._scriptBuffer = br.read(br.readUInt64LEBN().toNumber());
  input.sequenceNumber = br.readUInt64LEBN().toNumber();
  // TODO: return different classes according to which input it is
  // e.g: CoinbaseInput, PublicKeyHashInput, MultiSigScriptHashInput, etc.
  return input;
};

Input.prototype.toBufferWriter = function(writer:any) {
  if (!writer) {
    writer = new BufferWriter();
  }

  var script = this._scriptBuffer;

  //@ts-ignore
  let prevTxId = new BufferReader(this.prevTxId).readReverse()
  writer.write(this.prevTxId);
  txlogBuffer("$$$$ prevTxId1: ", this.prevTxId.toString("hex"), writer.bufs)
  writer.writeUInt32LE(this.outputIndex);
  txlogBuffer("$$$$ outputIndex: ", this.outputIndex, writer.bufs)
  let bn = BN.fromNumber(script.length);
  writer.writeUInt64LEBN(bn);
  txlogBuffer("$$$$ script.length: ", script.length, writer.bufs)
  let scriptBuf = Buffer.from(script, "hex");
  writer.write(scriptBuf);
  txlogBuffer("$$$$ script: ", script.toString("hex"), writer.bufs)
  bn = BN.fromNumber(this.sequenceNumber);
  writer.writeUInt64LEBN(bn);
  txlogBuffer("$$$$ sequenceNumber: ", this.sequenceNumber, writer.bufs)
  
  return writer;
};

//@ts-ignore
Transaction.prototype.getSignatures = function(privKey, sigtype, signingMethod) {
  privKey = new PrivateKey(privKey);

  // By default, signs using ALL|FORKID
  //@ts-ignore
  sigtype = sigtype || (Signature.SIGHASH_ALL |  Signature.SIGHASH_FORKID);
  var transaction = this;
  //@ts-ignore
  var results = [];
  
  var hashData = Hash.sha256ripemd160(privKey.publicKey.toBuffer().slice(1));
  //@ts-ignore
  _.each(this.inputs, function forEachInput(input, index) {
    _.each(input.getSignatures(transaction, privKey, index, sigtype, hashData, signingMethod), function(signature:any) {
      results.push(signature);
    });
  });
  //@ts-ignore
  return results;
};
