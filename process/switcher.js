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

const imageProcess = require('./imageProcess.js');
const resize = require('./resize.js');
const mix = require('./mix.js');
const wipe = require('./wipe.js');
const combine = require('./combine.js');

function vidSwitch(context, width, height, numInputs, numOverlays) {
  this.context = context;
  this.width = width;
  this.height = height;
  this.numInputs = numInputs;
  this.numOverlays = numOverlays;

  return this;
}

vidSwitch.prototype.init = async function() {
  const numBytesRGBA = this.width * this.height * 4 * 4;

  this.sizer0 = new imageProcess(this.context, this.width, this.height, new resize({}));
  await this.sizer0.init();
  this.rgbaSz0 = await this.context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: this.width, height: this.height });

  if (this.numInputs > 1) {
    this.sizer1 = new imageProcess(this.context, this.width, this.height, new resize({}));
    await this.sizer1.init();
    this.rgbaSz1 = await this.context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: this.width, height: this.height });
    this.mixer = new imageProcess(this.context, this.width, this.height, new mix({}));
    await this.mixer.init();
    this.wiper = new imageProcess(this.context, this.width, this.height, new wipe({}));
    await this.wiper.init();
  }
  this.combiner = new imageProcess(this.context, this.width, this.height, new combine({ numOverlays: this.numOverlays }));
  await this.combiner.init();
  this.rgbaMx = await this.context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: this.width, height: this.height });
}

vidSwitch.prototype.processFrame = async function(inParams, mixParams, overlays, output) {
  let timings;
  inParams[0].output = this.rgbaSz0;
  timings = await this.sizer0.run(inParams[0]);
  // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  if (this.numInputs > 1) {
    inParams[1].output = this.rgbaSz1;
    timings = await this.sizer1.run(inParams[1]);

    if (mixParams.wipe) {
      timings = await this.wiper.run({ input0: this.rgbaSz0, input1: this.rgbaSz1, wipe: mixParams.frac, output: this.rgbaMx });
      // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);
    } else {
      timings = await this.mixer.run({ input0: this.rgbaSz0, input1: this.rgbaSz1, mix: mixParams.frac, output: this.rgbaMx });
      // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);
    }
  }

  timings = await this.combiner.run({ bgIn: this.rgbaMx, ovIn: overlays, output: output });
  // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);
}

module.exports = vidSwitch;
