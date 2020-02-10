/* Copyright 2019 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

const osc = require('osc');

function oscServer(params) {
  this.port = params.port || 9876;
  this.map = [];

  this.oscPort = new osc.UDPPort({
    localAddress: '0.0.0.0',
    localPort: this.port,
    remotePort: this.port + 1,
    remoteAddress: params.remoteAddr
  });

  this.oscPort.on('ready', () => console.log(`OSC listening on port ${this.port}`));

  this.oscPort.on('message', (oscMessage/*, timeTag, info*/) => {
    const control = oscMessage.address;
    const values = oscMessage.args;
    console.log(`OSC message: '${control}' values: [ ${values} ]`);

    this.map.forEach(entry => {
      const update = entry[control];
      if (update)
        update(values);
    });
  });

  this.oscPort.on('error', err => {
    console.log('OSC port error: ', err);
  });

  this.oscPort.open();
}

oscServer.prototype.sendMsg = function(control, msg) {
  this.oscPort.send({
    address: control,
    args: msg
  })
};

oscServer.prototype.addControl = function(control, upd, set) {
  this.map.push({ [control]: upd });
  this.sendMsg(control, set());
};

oscServer.prototype.removeControl = function(control) {
  this.map.forEach((entry, index) => {
    if (entry[control])
      this.map.splice(index, 1);
  });
};

oscServer.prototype.close = function() {
  console.log('Closing OSC');
  this.oscPort.close();
};

module.exports = oscServer;